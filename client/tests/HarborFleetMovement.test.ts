import * as THREE from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { HARBOR_LOW_BOAT_DECKS, type MapData } from "@catch-and-run/shared";
import { getHunterMovementSpeed, HunterController } from "../src/game/controllers/HunterController";
import { WaterVolumes } from "../src/game/controllers/WaterSwim";
import { CollisionSpatialIndex } from "../src/game/world/collisionBroadphase";
import { getSupportHeightAt } from "../src/game/world/SupportSurfaces";
import { DrowningTracker, findWaterHazard } from "../../server/src/systems/EnvironmentalHazards";
import mapData from "../src/game/world/harbor-warehouse.json";
import { installHeadlessDom } from "./helpers/headlessDom";
import { candidateHarborFleet, FLEET_TRACKS } from "./helpers/candidateHarborFleet";
import { createMovementProbe, movementAssetRoot, visibleSurface, type MovementRole, type MovementTier } from "./helpers/assetMovementProbe";

type Fleet = Awaited<ReturnType<typeof candidateHarborFleet>>;
type Track = typeof FLEET_TRACKS[number];
const cases: [MovementTier, MovementRole, string, Track][] = (["high", "low"] as const)
  .flatMap(tier => (["hunter", "prop"] as const).flatMap(role => FLEET_TRACKS.map(track => [tier, role, track.id, track] as [MovementTier, MovementRole, string, Track])));
const objectCases: [MovementTier, string, Track][] = (["high", "low"] as const)
  .flatMap(tier => FLEET_TRACKS.map(track => [tier, track.id, track] as [MovementTier, string, Track]));

function boatFor(fleet: Fleet, track: Track) {
  const boats = fleet.boats.getBoats();
  expect(boats.map(boat => boat.name).sort()).toEqual(FLEET_TRACKS.map(item => `RIG_FERRIS_HARBOR_BOAT_${item.rig}`).sort());
  const boat = boats.find(item => item.name === `RIG_FERRIS_HARBOR_BOAT_${track.rig}`);
  if (!boat) throw new Error(`Missing candidate ${track.id}`);
  expect(boat.moored).toBe(track.id !== "barge");
  expect(boat.boxes.length).toBeGreaterThan(0);
  return boat;
}

/** Selected-asset proof, not live network/browser or arbitrary open-world physics. */
describe(`all-five candidate fleet movement (${movementAssetRoot})`, () => {
  beforeAll(() => installHeadlessDom());

  it.each(cases)("%s %s %s: moving deck and dry jump stay safe; leaving or deleting support drowns", async (tier, role, _id, track) => {
    const fleet = await candidateHarborFleet(tier);
    try {
      const boat = boatFor(fleet, track);
      const initialSurface = visibleSurface(fleet.root, [track.x, 4, track.z], [0, -1, 0], 6);
      expect(initialSurface).toBeDefined();
      const probe = createMovementProbe(role, [track.x, 4, track.z]);
      if (probe.controller instanceof HunterController) probe.controller.setMovementTuning(getHunterMovementSpeed(false, false), 13);
      probe.controller.setBoatSupports(fleet.boats.colliders);
      const delta = new THREE.Vector3(), drowning = new DrowningTracker();
      let now = 0, minimumFeet = Infinity, maximumFeet = -Infinity;
      const tick = (dt: number) => {
        fleet.advance(dt);
        const before = probe.sample();
        if (probe.controller.isGrounded() && fleet.boats.carryDelta(before.x, before.feetY, before.z, delta)) probe.controller.translatePosition(delta.x, delta.y, delta.z);
        probe.controller.update(dt, fleet.boats.colliders);
        now += dt * 1000;
        const position = probe.sample();
        return { position, status: drowning.update(role, findWaterHazard(mapData as MapData, position.x, position.feetY, position.z) !== null, now) };
      };
      // A full sampled wave cycle, including occasional real runtime-capped
      // 50 ms frames. Every 5th frame compares physical feet with rendered deck.
      for (let frame = 0; frame < 1500; frame++) {
        const { position, status } = tick(frame % 120 === 0 ? .05 : 1 / 60);
        if (frame < 120) continue;
        expect(status, `${track.id} server-side false drowning`).toBe("dry");
        expect(probe.controller.isInWater(), `${track.id} dry contact became swimming`).toBe(false);
        minimumFeet = Math.min(minimumFeet, position.feetY);
        maximumFeet = Math.max(maximumFeet, position.feetY);
        if (frame % 5 === 0) {
          const visible = visibleSurface(fleet.root, [position.x, position.feetY + .15, position.z], [0, -1, 0], .35);
          expect(visible, `${track.id} has invisible support at ${position.x},${position.z}`).toBeDefined();
          if (!visible) throw new Error("Physical deck has no visible surface");
          expect(Math.abs(position.feetY - visible.y)).toBeLessThan(.025);
        }
      }
      expect(maximumFeet - minimumFeet, `${track.id} did not actually move`).toBeGreaterThan(.06);
      if (tier === "high" && track.rig.startsWith("SKIFF_")) {
        expect(minimumFeet).toBeLessThan(-.9);
        const contract = HARBOR_LOW_BOAT_DECKS.find(item => item.rig === boat.name);
        expect(contract, "Low deck must retain its measured server contract").toBeDefined();
      }

      const restingFeet = probe.feetY();
      probe.state.jump = true;
      let jumpPeak = restingFeet;
      for (let frame = 0; frame < 180; frame++) {
        const { position, status } = tick(1 / 60);
        probe.state.jump = false;
        jumpPeak = Math.max(jumpPeak, position.feetY);
        expect(status).not.toBe("drowned");
      }
      expect(jumpPeak).toBeGreaterThan(restingFeet + 1);
      expect(probe.controller.isInWater()).toBe(false);

      probe.state.backward = true;
      probe.state.jump = true; // Holding Jump after leaving cannot reset death.
      let died = false;
      for (let frame = 0; frame < 900; frame++) {
        if (tick(1 / 60).status === "drowned") { died = true; break; }
      }
      expect(died, `${track.id} departure never reached lethal water`).toBe(true);
      expect(probe.controller.isInWater()).toBe(true);

      // Negative control: remove only this vessel's support references. Other
      // four boats, actual render meshes and real water logic stay untouched.
      const remaining = fleet.boats.colliders.filter(box => !boat.boxes.includes(box));
      const unsupported = createMovementProbe(role, [track.x, 4, track.z]);
      unsupported.controller.setBoatSupports(remaining);
      const missingTracker = new DrowningTracker();
      let missingDied = false;
      for (let frame = 0; frame < 420; frame++) {
        fleet.advance(1 / 60);
        unsupported.controller.update(1 / 60, remaining);
        const point = unsupported.sample();
        if (missingTracker.update("missing", findWaterHazard(mapData as MapData, point.x, point.feetY, point.z) !== null, frame * 1000 / 60) === "drowned") { missingDied = true; break; }
      }
      expect(missingDied, `${track.id} missing support was not detected`).toBe(true);
      expect(unsupported.feetY()).toBeCloseTo(-1.6, 3);
    } finally { fleet.dispose(); }
  });
});

interface Duplicate { mesh: THREE.Mesh; collider: THREE.Box3; hp: number; vy: number; onGround: boolean }
interface DuplicateHarness {
  duplicates: Duplicate[];
  colliders: THREE.Box3[];
  rebuildCollisionIndex(): void;
  spawnDuplicateMesh(x: number, y: number, z: number, propId: string, rotation: number): void;
  updateDuplicatePhysics(dt: number): void;
  updateBoatPhysics(): void;
}

describe(`all-five candidate loose-object movement (${movementAssetRoot})`, () => {
  let prototype: object;
  beforeAll(async () => {
    installHeadlessDom();
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    prototype = (await import("../src/game/GameManager")).GameManager.prototype;
    vi.unstubAllGlobals();
  });

  it.each(objectCases)("%s object %s: real duplicate rides the deck; deleting vessel supports exposes the fall", async (tier, _id, track) => {
    const fleet = await candidateHarborFleet(tier);
    const water = new WaterVolumes(); water.setBoxes(mapData.waterHazards);
    const manager: DuplicateHarness = Object.assign(Object.create(prototype) as DuplicateHarness, {
      scene: new THREE.Scene(), colliders: [...fleet.boats.colliders], collisionIndex: new CollisionSpatialIndex(),
      nearbyMapColliders: [], ferrisCabinColliders: [], duplicates: [], boatCollisionRig: fleet.boats,
      boatCarryScratch: new THREE.Vector3(), controllersReady: false, localIsAlive: false, duplicateWater: water,
      propRegistry: { createMesh: () => new THREE.Mesh(new THREE.BoxGeometry(.35, .5, .35), new THREE.MeshBasicMaterial()), get: () => ({ hp: 100 }) },
    });
    try {
      const boat = boatFor(fleet, track);
      manager.rebuildCollisionIndex();
      manager.spawnDuplicateMesh(track.x, 3, track.z, "crate", 0);
      const duplicate = manager.duplicates[0];
      let minFeet = Infinity, maxFeet = -Infinity;
      for (let frame = 0; frame < 900; frame++) {
        const dt = frame % 120 === 0 ? .05 : 1 / 60;
        fleet.advanceWithManager(dt, () => manager.updateBoatPhysics());
        manager.updateDuplicatePhysics(dt);
        if (frame < 120) continue;
        expect(duplicate.onGround).toBe(true);
        const feet = duplicate.collider.min.y;
        expect(boat.boxes.some(box => {
          const surface = getSupportHeightAt(box, duplicate.mesh.position.x, duplicate.mesh.position.z, 0);
          return surface !== null && Math.abs(feet - surface) < .001;
        })).toBe(true);
        minFeet = Math.min(minFeet, feet); maxFeet = Math.max(maxFeet, feet);
        if (frame % 10 === 0) {
          const visible = visibleSurface(fleet.root, [duplicate.mesh.position.x, feet + .15, duplicate.mesh.position.z], [0, -1, 0], .35);
          expect(visible).toBeDefined();
          if (!visible) throw new Error("Duplicate sits on invisible support");
          expect(Math.abs(feet - visible.y)).toBeLessThan(.025);
        }
      }
      expect(maxFeet - minFeet).toBeGreaterThan(.06);
      manager.colliders = manager.colliders.filter(box => !boat.boxes.includes(box));
      manager.rebuildCollisionIndex();
      duplicate.onGround = false;
      for (let frame = 0; frame < 180; frame++) manager.updateDuplicatePhysics(1 / 60);
      expect(duplicate.collider.min.y).toBeCloseTo(-1.6, 3);
    } finally {
      for (const duplicate of manager.duplicates) {
        duplicate.mesh.geometry.dispose();
        const materials = Array.isArray(duplicate.mesh.material) ? duplicate.mesh.material : [duplicate.mesh.material];
        materials.forEach(material => material.dispose());
      }
      fleet.dispose();
    }
  });
});
