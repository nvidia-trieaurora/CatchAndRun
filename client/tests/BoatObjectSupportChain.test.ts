import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CollisionSpatialIndex } from "../src/game/world/collisionBroadphase";
import { WaterVolumes } from "../src/game/controllers/WaterSwim";
import { PropRegistry } from "../src/game/world/PropRegistry";
import mapData from "../src/game/world/harbor-warehouse.json";
import type { PropDefinition } from "@catch-and-run/shared";
import { candidateHarborFleet, FLEET_TRACKS } from "./helpers/candidateHarborFleet";
import { createMovementProbe, movementAssetRoot, visibleSurface, type MovementRole } from "./helpers/assetMovementProbe";

interface Duplicate {
  mesh: THREE.Mesh;
  collider: THREE.Box3;
  hp: number;
  vy: number;
  onGround: boolean;
}

interface Harness {
  colliders: THREE.Box3[];
  duplicates: Duplicate[];
  rebuildCollisionIndex(): void;
  spawnDuplicateMesh(x: number, y: number, z: number, prop: string, rotation: number): void;
  clearDuplicates(): void;
  updateDuplicatePhysics(dt: number): void;
  updateBoatPhysics(): void;
}

type Fleet = Awaited<ReturnType<typeof candidateHarborFleet>>;
let prototype: object;
beforeAll(async () => {
  // Invoke production GameManager methods without creating its browser/UI shell.
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  prototype = (await import("../src/game/GameManager")).GameManager.prototype;
});
afterAll(() => vi.unstubAllGlobals());

function harness(fleet: Fleet): Harness {
  const registry = new PropRegistry();
  registry.loadFromMapData(mapData.props as PropDefinition[]);
  const water = new WaterVolumes();
  water.setBoxes(mapData.waterHazards);
  water.setDrySupports(fleet.boats.colliders);
  const manager = Object.assign(Object.create(prototype) as Harness, {
    scene: new THREE.Scene(),
    colliders: [...fleet.boats.colliders],
    collisionIndex: new CollisionSpatialIndex(),
    nearbyMapColliders: [],
    ferrisCabinColliders: [],
    duplicates: [],
    boatCollisionRig: fleet.boats,
    boatCarryScratch: new THREE.Vector3(),
    duplicateWater: water,
    controllersReady: false,
    localIsAlive: true,
    propRegistry: {
      // Fixed unit solids isolate stacking from decorative prop modelling;
      // the thin-ring case below uses the actual shipped PropRegistry mesh.
      createMesh: (id: string) => id === "life_ring"
        ? registry.createMesh(id)
        : new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()),
      get: (id: string) => registry.get(id) ?? { hp: 100 },
    },
  });
  manager.rebuildCollisionIndex();
  return manager;
}

function addCube(manager: Harness, x: number, feetY: number, z: number) {
  manager.spawnDuplicateMesh(x, feetY + .5, z, "unit-test-solid", 0);
  const duplicate = manager.duplicates[manager.duplicates.length - 1];
  duplicate.onGround = true;
  return duplicate;
}

function deckAt(fleet: Fleet, suffix: string, x: number, z: number) {
  const boat = fleet.boats.getBoats().find((entry) => entry.name.endsWith(suffix));
  expect(boat, `${suffix} missing from ${movementAssetRoot}`).toBeDefined();
  if (!boat) throw new Error(`Missing ${suffix}`);
  const candidates = boat.boxes.filter((box) => x > box.min.x && x < box.max.x
    && z > box.min.z && z < box.max.z && box.max.y < .2);
  const deck = candidates.sort((a, b) => b.max.y - a.max.y).at(0);
  expect(deck, `no low physical deck at ${x},${z}`).toBeDefined();
  if (!deck) throw new Error(`Missing deck at ${x},${z}`);
  const surface = visibleSurface(fleet.root, [x, deck.max.y + .04, z], [0, -1, 0], .08);
  expect(surface, "physical deck must correspond to a real visible native surface").toBeDefined();
  if (!surface) throw new Error("Deck support has no visible surface");
  expect(surface.y).toBeCloseTo(deck.max.y, 3);
  const rig = fleet.root.getObjectByName(boat.name);
  if (!rig) throw new Error(`Missing native rig ${boat.name}`);
  return { deck, rig };
}

function attachActor(manager: Harness, fleet: Fleet, role: MovementRole, x: number, feetY: number, z: number) {
  const actor = createMovementProbe(role, [x, feetY, z]);
  actor.controller.setBoatSupports(fleet.boats.colliders);
  Object.assign(manager, {
    controllersReady: true, localRole: role,
    hunterController: actor.controller, propController: actor.controller,
  });
  return actor;
}

function release(manager: Harness, fleet: Fleet) {
  for (const duplicate of manager.duplicates) duplicate.mesh.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const mesh = object as THREE.Mesh;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material.dispose();
  });
  manager.clearDuplicates();
  fleet.dispose();
}

const stackCases = (["high", "low"] as const).flatMap((tier) =>
  [false, true].map((reverse) => ({ tier, reverse })));
const actorCases = (["high", "low"] as const).flatMap((tier) =>
  (["hunter", "prop"] as const).map((role) => ({ tier, role })));
const workboat = FLEET_TRACKS[0];

describe(`actual boat object support chains [asset root: ${movementAssetRoot}]`, () => {
  it.each(stackCases)("$tier keeps stacked duplicates separate (reverse creation: $reverse), never self-supported", async ({ tier, reverse }) => {
    const fleet = await candidateHarborFleet(tier);
    const manager = harness(fleet);
    try {
      const { deck } = deckAt(fleet, "WORKBOAT", workboat.x, workboat.z);
      // Negative control: a lone loose solid above the real boat must fall,
      // even though its own collider is present in the live spatial index.
      const falling = addCube(manager, workboat.x, deck.max.y + 2, workboat.z);
      falling.onGround = false;
      const before = falling.collider.min.y;
      manager.updateDuplicatePhysics(1 / 60);
      expect(falling.collider.min.y).toBeLessThan(before);
      for (let frame = 0; frame < 120; frame++) manager.updateDuplicatePhysics(1 / 60);
      expect(falling.collider.min.y).toBeCloseTo(deck.max.y, 4);
      manager.clearDuplicates();

      const levels = reverse ? [1, 0] : [0, 1];
      const cubes = levels.map((level) => addCube(manager, workboat.x, deck.max.y + level, workboat.z));
      const lower = cubes[levels.indexOf(0)], upper = cubes[levels.indexOf(1)];
      for (let frame = 0; frame < 120; frame++) manager.updateDuplicatePhysics(1 / 60);
      expect(lower.collider.min.y).toBeCloseTo(deck.max.y, 4);
      expect(upper.collider.min.y, "upper duplicate fell through its lower support").toBeCloseTo(lower.collider.max.y, 4);
      expect(upper.collider.min.y).toBeGreaterThanOrEqual(lower.collider.max.y - 1e-5);
    } finally { release(manager, fleet); }
  });

  it.each(actorCases)("$tier $role rides a carried duplicate exactly once but an airborne actor is not carried", async ({ tier, role }) => {
    // Do the negative control first: it must not depend on the positive check
    // failing early or on a manually fabricated controller grounded flag.
    for (const airborne of [true, false]) {
      const fleet = await candidateHarborFleet(tier);
      const manager = harness(fleet);
      try {
        const { deck, rig } = deckAt(fleet, "WORKBOAT", workboat.x, workboat.z);
        const cube = addCube(manager, workboat.x, deck.max.y, workboat.z);
        const actor = attachActor(manager, fleet, role, workboat.x, cube.collider.max.y, workboat.z);
        actor.controller.update(1 / 60, manager.colliders);
        if (airborne) {
          actor.state.jump = true;
          actor.controller.update(1 / 240, manager.colliders);
        }
        const before = actor.sample(), cubeBefore = cube.mesh.position.clone();
        if (airborne) {
          // Still within the .09 contact tolerance, but a real ascending jump
          // must not be reattached to a moving support merely by proximity.
          expect(before.feetY).toBeGreaterThan(cube.collider.max.y + .025);
          expect(before.feetY).toBeLessThan(cube.collider.max.y + .09);
        }
        else expect(before.feetY).toBeCloseTo(cube.collider.max.y, 5);
        const translate = vi.spyOn(actor.controller, "translatePosition");
        const delta = new THREE.Vector3(.02, .04, -.015);
        // Controlled translation of the actual native rig, not a mocked
        // carryDelta. Translation isolates support chains from tilt sampling.
        rig.position.add(delta);
        manager.updateBoatPhysics();
        const after = actor.sample();
        const expectedDelta = airborne ? new THREE.Vector3() : delta;
        expect(after.x - before.x).toBeCloseTo(expectedDelta.x, 6);
        expect(after.feetY - before.feetY).toBeCloseTo(expectedDelta.y, 6);
        expect(after.z - before.z).toBeCloseTo(expectedDelta.z, 6);
        expect(translate).toHaveBeenCalledTimes(airborne ? 0 : 1);
        expect(cube.mesh.position.distanceTo(cubeBefore.clone().add(delta))).toBeLessThan(1e-6);
        // A stationary next frame must not replay the last vessel delta.
        manager.updateBoatPhysics();
        const stationary = actor.sample();
        expect(stationary.x).toBeCloseTo(after.x, 6);
        expect(stationary.feetY).toBeCloseTo(after.feetY, 6);
        expect(stationary.z).toBeCloseTo(after.z, 6);
      } finally { release(manager, fleet); }
    }
  });

  it.each(["hunter", "prop"] as const)("high %s stays dry and can jump from a thin ring supported by the actual lowered skiff", async (role) => {
    const fleet = await candidateHarborFleet("high");
    const manager = harness(fleet);
    try {
      const x = -15.5, z = 48.6;
      const { deck, rig } = deckAt(fleet, "SKIFF_RED", x, z);
      // Within the documented moored .3015m excursion: floor -.72 -> -.92.
      // This controlled pose tests support classification, not wave timing.
      rig.position.y -= .2;
      fleet.boats.update();
      manager.spawnDuplicateMesh(x, deck.max.y, z, "life_ring", 0);
      const ring = manager.duplicates[0];
      for (let frame = 0; frame < 10; frame++) manager.updateDuplicatePhysics(1 / 60);
      expect(ring.collider.min.y).toBeCloseTo(deck.max.y, 4);
      expect(ring.collider.max.y - ring.collider.min.y).toBeCloseTo(.1, 4);
      const actor = attachActor(manager, fleet, role, x, ring.collider.max.y, z);
      manager.updateBoatPhysics();
      actor.controller.update(1 / 60, manager.colliders);
      expect(actor.feetY()).toBeCloseTo(ring.collider.max.y, 4);
      expect(actor.feetY()).toBeLessThan(-.8);
      expect(actor.controller.isInWater(), "supported ring rider must not be classified as swimming").toBe(false);
      const beforeJump = actor.feetY();
      actor.state.jump = true;
      actor.controller.update(1 / 60, manager.colliders);
      expect(actor.feetY()).toBeGreaterThan(beforeJump + .05);
    } finally { release(manager, fleet); }
  });
});
