import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientConfig } from "../src/config/ClientConfig";
import { HunterController } from "../src/game/controllers/HunterController";
import { PropController } from "../src/game/controllers/PropController";
import { collectNearbyColliders } from "../src/game/world/collisionBroadphase";
import type { InputManager, InputState } from "../src/input/InputManager";
import warehouseManifest from "../public/assets/maps/harbor-v2/warehouse.manifest.json";

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

const raisedPlatform = new THREE.Box3(
  new THREE.Vector3(-2, 1.8, -2),
  new THREE.Vector3(2, 2, 2),
);

const lowerStair = new THREE.Box3(
  new THREE.Vector3(-1, 0, -1.4),
  new THREE.Vector3(1, 0.4, 0),
);
const upperStair = new THREE.Box3(
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(1, 0.8, 1.4),
);

const warehouseEastStairs = warehouseManifest.collisions
  .filter((collider) => collider.name.startsWith("COL_MOVE_EXT_STAIR_EAST_"))
  .map((collider) => new THREE.Box3(
    new THREE.Vector3(collider.min.x, collider.min.y, collider.min.z),
    new THREE.Vector3(collider.max.x, collider.max.y, collider.max.z),
  ));

afterEach(() => {
  inputState.forward = false;
  inputState.backward = false;
  inputState.left = false;
  inputState.right = false;
  inputState.jump = false;
  inputState.crouch = false;
});

describe("swept ground collision", () => {
  it("keeps the Hunter from falling through a raised platform", () => {
    const controller = new HunterController(
      new THREE.PerspectiveCamera(),
      input,
      config,
    );
    controller.setPosition(0, 3, 0);

    const position = controller.update(0.3, [raisedPlatform]);

    expect(position.y - 1.6).toBeCloseTo(2);
  });

  it("keeps a Prop from falling through a raised platform", () => {
    const controller = new PropController(
      new THREE.PerspectiveCamera(),
      input,
      config,
    );
    controller.setPosition(0, 3, 0);

    const position = controller.update(0.3, [raisedPlatform]);

    expect(position.y).toBeCloseTo(2);
  });

  it("keeps a fast Prop from tunneling through a thin wall", () => {
    inputState.forward = true;
    const controller = new PropController(
      new THREE.PerspectiveCamera(),
      input,
      config,
    );
    controller.setPosition(0, 0, 0);
    const wall = new THREE.Box3(
      new THREE.Vector3(-2, 0, -0.9),
      new THREE.Vector3(2, 3, -0.7),
    );

    const position = controller.update(0.2, [wall]);
    inputState.forward = false;

    expect(position.z).toBeGreaterThan(-0.7);
  });

  it("keeps Hunter physics on the next tread while smoothing the camera", () => {
    inputState.backward = true;
    const camera = new THREE.PerspectiveCamera();
    const controller = new HunterController(camera, input, config);
    controller.setPosition(0, 0.4, -0.45);

    let position = controller.getPosition();
    for (let frame = 0; frame < 8; frame++) {
      position = controller.update(0.016, [lowerStair, upperStair]);
      if (position.z > 0.28) break;
    }
    inputState.backward = false;
    position = controller.update(0.016, [lowerStair, upperStair]);

    expect(position.z).toBeGreaterThan(0.28);
    expect(position.y - 1.6).toBeCloseTo(0.8);
    expect(camera.position.y).toBeGreaterThan(0.4 + 1.6);
    expect(camera.position.y).toBeLessThan(0.8 + 1.6);
  });

  it("steps a Hunter down to the adjacent tread without free-falling", () => {
    inputState.forward = true;
    const controller = new HunterController(
      new THREE.PerspectiveCamera(),
      input,
      config,
    );
    controller.setPosition(0, 0.8, 0.45);

    controller.update(0.06, [lowerStair, upperStair]);
    const position = controller.update(0.06, [lowerStair, upperStair]);

    expect(position.z).toBeLessThan(-0.28);
    expect(position.y - 1.6).toBeCloseTo(0.4);
  });

  it("steps a Prop down to the adjacent tread without free-falling", () => {
    inputState.forward = true;
    const controller = new PropController(
      new THREE.PerspectiveCamera(),
      input,
      config,
    );
    controller.setPosition(0, 0.8, 0.45);

    controller.update(0.06, [lowerStair, upperStair]);
    const position = controller.update(0.06, [lowerStair, upperStair]);

    expect(position.z).toBeLessThan(-0.28);
    expect(position.y).toBeCloseTo(0.4);
  });

  it("keeps a Hunter supported through the full Warehouse stair run", () => {
    inputState.forward = true;
    expect(warehouseEastStairs).toHaveLength(21);
    const camera = new THREE.PerspectiveCamera();
    const controller = new HunterController(
      camera,
      input,
      config,
    );
    controller.setPosition(26, 0, 15.4);

    let position = controller.getPosition();
    let previousFeetY = 0;
    let previousCameraY = position.y;
    for (let frame = 0; frame < 400 && position.z > -13.6; frame++) {
      position = controller.update(0.016, warehouseEastStairs);
      const feetY = position.y - 1.6;
      expect(feetY).toBeGreaterThanOrEqual(previousFeetY - 0.001);
      expect(Math.abs(camera.position.y - previousCameraY)).toBeLessThan(0.2);
      previousFeetY = feetY;
      previousCameraY = camera.position.y;
    }

    expect(position.z).toBeLessThanOrEqual(-13.6);
    expect(position.y - 1.6).toBeCloseTo(8.4);
  });

  it("keeps a Prop supported through the full Warehouse stair run", () => {
    inputState.forward = true;
    const camera = new THREE.PerspectiveCamera();
    const controller = new PropController(
      camera,
      input,
      config,
    );
    const propMesh = new THREE.Mesh();
    controller.setPropMesh(propMesh);
    controller.setPosition(26, 0, 15.4);

    let position = controller.getPosition();
    let previousY = 0;
    let previousVisualY = propMesh.position.y;
    for (let frame = 0; frame < 400 && position.z > -13.6; frame++) {
      position = controller.update(0.016, warehouseEastStairs);
      expect(position.y).toBeGreaterThanOrEqual(previousY - 0.001);
      expect(Math.abs(propMesh.position.y - previousVisualY)).toBeLessThan(0.2);
      previousY = position.y;
      previousVisualY = propMesh.position.y;
    }

    expect(position.z).toBeLessThanOrEqual(-13.6);
    expect(position.y).toBeCloseTo(8.4);
  });

  it("lands a Hunter jump back on the same stair tread", () => {
    const controller = new HunterController(
      new THREE.PerspectiveCamera(),
      input,
      config,
    );
    controller.setPosition(0, 0.8, 0.7);

    inputState.jump = true;
    controller.update(0.016, [upperStair]);
    inputState.jump = false;

    let position = controller.getPosition();
    for (let frame = 0; frame < 120; frame++) {
      position = controller.update(0.016, [upperStair]);
      expect(position.y - 1.6).toBeGreaterThanOrEqual(0.8);
    }
    expect(position.y - 1.6).toBeCloseTo(0.8);
  });

  it("lands a Prop jump back on the same stair tread", () => {
    const controller = new PropController(
      new THREE.PerspectiveCamera(),
      input,
      config,
    );
    controller.setPosition(0, 0.8, 0.7);

    inputState.jump = true;
    controller.update(0.016, [upperStair]);
    inputState.jump = false;

    let position = controller.getPosition();
    for (let frame = 0; frame < 120; frame++) {
      position = controller.update(0.016, [upperStair]);
      expect(position.y).toBeGreaterThanOrEqual(0.8);
    }
    expect(position.y).toBeCloseTo(0.8);
  });
});

describe("movement collision broadphase", () => {
  it("keeps intersecting floors and nearby obstacles while excluding distant geometry", () => {
    const floor = new THREE.Box3(
      new THREE.Vector3(-60, -1, -60),
      new THREE.Vector3(60, 0, 60),
    );
    const nearbyWall = new THREE.Box3(
      new THREE.Vector3(4, 0, -1),
      new THREE.Vector3(5, 3, 1),
    );
    const distantWall = new THREE.Box3(
      new THREE.Vector3(40, 0, 40),
      new THREE.Vector3(42, 3, 42),
    );

    expect(collectNearbyColliders(
      [floor, nearbyWall, distantWall],
      new THREE.Vector3(0, 1.6, 0),
      12,
    )).toEqual([floor, nearbyWall]);
  });
});
