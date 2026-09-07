import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientConfig } from "../src/config/ClientConfig";
import { HunterController } from "../src/game/controllers/HunterController";
import {
  LADDER_CLIMB_SPEED,
  LadderClimber,
  detectLadderVolumes,
  ladderVolumeFromBox,
} from "../src/game/controllers/LadderClimb";
import { PropController } from "../src/game/controllers/PropController";
import type { InputManager, InputState } from "../src/input/InputManager";

const inputState: InputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  crouch: false,
  shoot: false,
  reload: false,
  interact: false,
  lockPose: false,
  ability: false,
  ability2: false,
  scoreboard: false,
  soulMode: false,
};

const input = {
  isPointerLocked: () => true,
  consumeMouseDelta: () => ({ x: 0, y: 0 }),
  getState: () => inputState,
} as unknown as InputManager;

const config = {
  get: () => ({ sensitivity: 0.002 }),
} as ClientConfig;

const box = (
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
) => new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));

// Construction-site gameplay colliders exactly as `buildConstructionZone` emits them.
const slab = box(-46, -0.1, -33, -24, 0.2, -11);
const siloBody = box(-50.2, 0, -24.2, -45.8, 8, -19.8);
const siloPlatform = box(-50.5, 8.03, -24.5, -45.5, 8.18, -19.5);
const siloRungs = Array.from({ length: 20 }, (_, i) =>
  box(-46.3, i * 0.4, -22.15, -45.7, i * 0.4 + 0.4, -21.85));
// Secondary scaffold: 13 "thick step" colliders that all start on the ground.
const scaffoldRungs = Array.from({ length: 13 }, (_, i) =>
  box(-31.35, 0, -24.8, -30.65, (i + 1) * (5 / 13), -24.35));
const scaffoldDeck = box(-32.9, 4.88, -27.4, -29.1, 5.05, -24.6);
const scaffoldRailSouth = box(-32.75, 5.0, -24.85, -29.25, 6.0, -24.65);
const scaffoldPosts = [
  box(-32.87, 0, -27.37, -32.63, 5, -27.13),
  box(-32.87, 0, -24.87, -32.63, 5, -24.63),
  box(-29.37, 0, -27.37, -29.13, 5, -27.13),
  box(-29.37, 0, -24.87, -29.13, 5, -24.63),
];
// The shoring-frame staircase: same width, but every tread advances in z.
const frameStairs = Array.from({ length: 8 }, (_, s) => {
  const sz = -14.5 - (s / 7) * 4;
  return box(-37.5, 0, sz - 0.3, -36.5, (s + 1) * 0.375, sz + 0.3);
});
const lonePost = box(-27.3, 0, -30.3, -26.7, 10, -29.7);

const siteColliders = [
  slab, siloBody, siloPlatform, ...siloRungs,
  ...scaffoldRungs, scaffoldDeck, scaffoldRailSouth, ...scaffoldPosts,
  ...frameStairs, lonePost,
];

afterEach(() => {
  inputState.forward = false;
  inputState.backward = false;
  inputState.left = false;
  inputState.right = false;
  inputState.jump = false;
  inputState.crouch = false;
});

describe("detectLadderVolumes", () => {
  it("turns stacked rung colliders into ladders and ignores stairs, posts and platforms", () => {
    const ladders = detectLadderVolumes(siteColliders);

    expect(ladders).toHaveLength(2);
    const [silo, scaffold] = ladders; // sorted west to east
    expect(silo.bottomY).toBe(0);
    expect(silo.topY).toBeCloseTo(8);
    expect(silo.centerX).toBeCloseTo(-46);
    expect(silo.centerZ).toBeCloseTo(-22);
    expect(scaffold.topY).toBeCloseTo(5);
    expect(scaffold.centerX).toBeCloseTo(-31);
  });

  it("does not treat a short stack or a crate as a ladder", () => {
    const shortStack = Array.from({ length: 3 }, (_, i) => box(0, i * 0.4, 0, 0.5, i * 0.4 + 0.4, 0.5));
    const crates = Array.from({ length: 4 }, (_, i) => box(2, i * 0.5, 2, 2.9, i * 0.5 + 0.5, 2.9));
    expect(detectLadderVolumes([...shortStack, ...crates])).toHaveLength(0);
  });
});

describe("LadderClimber", () => {
  const climber = () => {
    const c = new LadderClimber();
    c.setLadders(detectLadderVolumes(siteColliders));
    return c;
  };

  it("grabs only when pushing into the rungs from beside the column", () => {
    const c = climber();
    // pushing west into the silo ladder from the slab
    expect(c.tryGrab(-45.3, 0.2, -22, 0.35, { forward: true, backward: false, jump: false, moveX: -1, moveZ: 0 })).toBe(true);
    const idle = climber();
    // walking past it (moving north along the face)
    expect(idle.tryGrab(-45.3, 0.2, -22, 0.35, { forward: true, backward: false, jump: false, moveX: 0, moveZ: -1 })).toBe(false);
    // standing on top of the silo next to the ladder head
    expect(idle.tryGrab(-46.6, 8.18, -22, 0.35, { forward: true, backward: false, jump: false, moveX: 1, moveZ: 0 })).toBe(false);
    // too far away
    expect(idle.tryGrab(-44.5, 0.2, -22, 0.35, { forward: true, backward: false, jump: false, moveX: -1, moveZ: 0 })).toBe(false);
  });

  it("climbs at the climb speed, hangs off the approach face and mantles over the top", () => {
    const c = climber();
    const feet = new THREE.Vector3(-45.3, 0.2, -22);
    expect(c.tryGrab(feet.x, feet.y, feet.z, 0.35, { forward: true, backward: false, jump: false, moveX: -1, moveZ: 0 })).toBe(true);

    c.step(1, { forward: true, backward: false, jump: false, moveX: 0, moveZ: 0 }, feet, 0.35);
    expect(feet.y).toBeCloseTo(0.2 + LADDER_CLIMB_SPEED, 5);
    // hangs just east of the column: centre -46 + half 0.3 + radius 0.35 + gap
    expect(feet.x).toBeGreaterThan(-45.7 + 0.35);
    expect(feet.x).toBeLessThan(-45.7 + 0.35 + 0.12);

    let result = c.step(10, { forward: true, backward: false, jump: false, moveX: 0, moveZ: 0 }, feet, 0.35);
    expect(result.detached).toBe(false);
    expect(c.isMantling()).toBe(true);
    for (let i = 0; i < 40 && !result.detached; i++) {
      result = c.step(1 / 60, { forward: false, backward: false, jump: false, moveX: 0, moveZ: 0 }, feet, 0.35);
    }
    expect(result.detached).toBe(true);
    expect(result.landed).toBe(true);
    expect(feet.y).toBeCloseTo(8.02, 3);
    // carried over the column onto the silo roof (west of the rungs)
    expect(feet.x).toBeLessThan(-46.3);
    expect(c.isClimbing()).toBe(false);
  });

  it("lets go with a hop on jump and steps off at the bottom rung", () => {
    const c = climber();
    const feet = new THREE.Vector3(-45.3, 0.2, -22);
    c.tryGrab(feet.x, feet.y, feet.z, 0.35, { forward: true, backward: false, jump: false, moveX: -1, moveZ: 0 });
    c.step(1, { forward: true, backward: false, jump: false, moveX: 0, moveZ: 0 }, feet, 0.35);
    const jumped = c.step(1 / 60, { forward: false, backward: false, jump: true, moveX: 0, moveZ: 0 }, feet, 0.35);
    expect(jumped).toEqual({ detached: true, hop: true, landed: false });
    expect(c.isClimbing()).toBe(false);

    const d = climber();
    const down = new THREE.Vector3(-45.3, 1.0, -22);
    d.tryGrab(down.x, down.y, down.z, 0.35, { forward: true, backward: false, jump: false, moveX: -1, moveZ: 0 });
    const landed = d.step(2, { forward: false, backward: true, jump: false, moveX: 0, moveZ: 0 }, down, 0.35);
    expect(landed).toEqual({ detached: true, hop: false, landed: true });
    expect(down.y).toBe(0);
  });
});

describe("authored ladder inside the crane mast", () => {
  // Hollow lattice mast exactly as build_construction_ad.py ships it: 4 legs, 4 thin
  // walls (south wall starts above the door), the interior ladder column climbed from
  // +z, a viewing ring at 24.3 and the pad the mast stands on.
  const mx = -48, mz = -31, outer = 0.67, inner = 0.53, deck = 24.15, top = 25.6;
  const pad = box(-49.7, 0, -32.7, -47.3, 0.12, -29.3);
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) =>
    box(mx + sx * 0.6 - 0.07, 0.12, mz + sz * 0.6 - 0.07, mx + sx * 0.6 + 0.07, top, mz + sz * 0.6 + 0.07));
  const walls = [
    box(mx - outer, 0.12, mz - outer, mx + outer, deck, mz - outer + 0.08),
    box(mx - outer, 3.32, mz + outer - 0.08, mx + outer, deck, mz + outer),
    box(mx - outer, 0.12, mz - outer, mx - outer + 0.08, deck, mz + outer),
    box(mx + outer - 0.08, 0.12, mz - outer, mx + outer, deck, mz + outer),
  ];
  const ladderBox = box(mx - 0.3, 0.12, mz - inner, mx + 0.3, deck + 0.1, mz - inner + 0.3);
  const ring = [
    box(mx - 1.8, deck, mz - 1.8, mx + 1.8, deck + 0.12, mz - outer),
    box(mx - 1.8, deck, mz + outer, mx + 1.8, deck + 0.12, mz + 1.8),
    box(mx - 1.8, deck, mz - outer, mx - outer, deck + 0.12, mz + outer),
    box(mx + outer, deck, mz - outer, mx + 1.8, deck + 0.12, mz + outer),
  ];
  const craneColliders = [pad, ...legs, ...walls, ladderBox, ...ring];
  const craneLadder = ladderVolumeFromBox(ladderBox, "+z");

  it("is not detected as a rung stack and keeps its approach side", () => {
    expect(detectLadderVolumes(craneColliders)).toHaveLength(0);
    expect(craneLadder.approach).toEqual({ x: 0, z: 1 });
    expect(craneLadder.topY).toBeCloseTo(deck + 0.1);
  });

  it("refuses a grab through the mast wall from outside but takes one from inside the shaft", () => {
    const c = new LadderClimber();
    c.setLadders([craneLadder]);
    // outside, north of the mast, pushing south into the wall
    expect(c.tryGrab(mx, 0.12, mz - outer - 0.36, 0.35, { forward: true, backward: false, jump: false, moveX: 0, moveZ: 1 })).toBe(false);
    // inside the shaft (entered through the south door), pushing north into the rungs
    expect(c.tryGrab(mx, 0.12, mz - inner + 0.3 + 0.36, 0.35, { forward: true, backward: false, jump: false, moveX: 0, moveZ: -1 })).toBe(true);
  });

  it("carries a Hunter through the door, up the shaft and out onto the viewing ring", () => {
    const controller = new HunterController(new THREE.PerspectiveCamera(), input, config);
    controller.setLadders([craneLadder]);
    controller.setPosition(mx, 0.12, mz + 1.4); // on the pad, south of the door
    controller.setRotation(0, 0); // forward = -z: through the door toward the ladder
    inputState.forward = true;

    let position = controller.getPosition();
    let climbed = false;
    for (let frame = 0; frame < 1500; frame++) {
      position = controller.update(1 / 60, craneColliders);
      if (controller.isClimbingLadder()) climbed = true;
      if (!controller.isClimbingLadder() && position.y - 1.6 > deck && position.z < mz - outer) break;
    }
    inputState.forward = false;
    position = controller.update(1 / 60, craneColliders);

    expect(climbed).toBe(true);
    expect(position.y - 1.6).toBeCloseTo(deck + 0.12, 2);
    expect(position.z).toBeLessThan(mz - outer); // north strip of the ring
    expect(position.z).toBeGreaterThan(mz - 1.8);
  });
});

describe("controllers on the construction ladders", () => {
  it("carries a Hunter from the slab up the silo ladder onto the service platform", () => {
    const camera = new THREE.PerspectiveCamera();
    const controller = new HunterController(camera, input, config);
    controller.setLadders(detectLadderVolumes(siteColliders));
    controller.setPosition(-44.0, 0.2, -22.0);
    controller.setRotation(0, Math.PI / 2); // forward = -x (west, into the ladder)
    inputState.forward = true;

    let position = controller.getPosition();
    let previousFeet = 0.2;
    let climbed = false;
    for (let frame = 0; frame < 900; frame++) {
      position = controller.update(1 / 60, siteColliders);
      const feet = position.y - 1.6;
      expect(feet).toBeGreaterThanOrEqual(previousFeet - 0.35); // never falls back down the ladder
      previousFeet = feet;
      if (controller.isClimbingLadder()) climbed = true;
      if (!controller.isClimbingLadder() && feet > 8.1 && position.x < -45.8) break;
    }
    inputState.forward = false;
    position = controller.update(1 / 60, siteColliders);

    expect(climbed).toBe(true);
    expect(position.y - 1.6).toBeCloseTo(8.18, 2);
    expect(position.x).toBeLessThan(-45.8);
    expect(Math.abs(position.z + 22)).toBeLessThan(0.5);
  });

  it("carries a Prop up the secondary scaffold ladder onto the top deck", () => {
    const controller = new PropController(new THREE.PerspectiveCamera(), input, config);
    controller.setPropMesh(new THREE.Mesh());
    controller.setLadders(detectLadderVolumes(siteColliders));
    controller.setPosition(-31.0, 0.2, -23.0);
    inputState.forward = true; // yaw 0: forward = -z (north, into the ladder)

    let position = controller.getPosition();
    let climbed = false;
    for (let frame = 0; frame < 900; frame++) {
      position = controller.update(1 / 60, siteColliders);
      if (controller.isClimbingLadder()) climbed = true;
      if (!controller.isClimbingLadder() && position.y > 5.0 && position.z < -24.6) break;
    }
    inputState.forward = false;
    position = controller.update(1 / 60, siteColliders);

    expect(climbed).toBe(true);
    expect(position.y).toBeCloseTo(5.05, 2);
    expect(position.z).toBeLessThan(-24.6);
  });

  it("does not grab a ladder while crouching or when strafing along it", () => {
    const controller = new HunterController(new THREE.PerspectiveCamera(), input, config);
    controller.setLadders(detectLadderVolumes(siteColliders));
    controller.setPosition(-45.1, 0.2, -23.5);
    controller.setRotation(0, 0); // forward = -z: running north along the ladder face
    inputState.forward = true;
    for (let frame = 0; frame < 30; frame++) controller.update(1 / 60, siteColliders);
    expect(controller.isClimbingLadder()).toBe(false);

    controller.setPosition(-44.0, 0.2, -22.0);
    controller.setRotation(0, Math.PI / 2);
    inputState.crouch = true;
    for (let frame = 0; frame < 60; frame++) controller.update(1 / 60, siteColliders);
    expect(controller.isClimbingLadder()).toBe(false);
  });
});
