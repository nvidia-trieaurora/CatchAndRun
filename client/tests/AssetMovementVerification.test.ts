import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import type { MapData } from "@catch-and-run/shared";
import { BoatCollisionRig } from "../src/game/world/zones/BoatCollisionRig";
import { buildHarborV2Map } from "../src/game/world/maps/harborV2Map";
import { HARBOR_ZONE_ASSETS } from "../src/game/world/zones/harborZones";
import mapData from "../src/game/world/harbor-warehouse.json";
import { installHeadlessDom } from "./helpers/headlessDom";
import {
  createMovementProbe, loadMovementAsset, movementAssetRoot, visibleSurface, withoutMovementBox,
  type MovementRole, type MovementTier,
} from "./helpers/assetMovementProbe";

const cases: [MovementTier, MovementRole][] = [
  ["high", "hunter"], ["high", "prop"], ["low", "hunter"], ["low", "prop"],
];

/**
 * Reusable promotion gate for fixed gameplay routes, not an exhaustive map proof.
 * HARBOR_VERIFY_ASSET_ROOT may point at a complete staged harbor-v2 tree.
 * Every negative control changes ONLY this test's in-memory collider list;
 * the exact same visible exported mesh and real controller remain in use.
 */
describe(`real asset movement verification (${movementAssetRoot})`, () => {
  const tiers = new Map<MovementTier, Awaited<ReturnType<typeof loadMovementAsset>>>();
  beforeAll(async () => {
    for (const tier of ["high", "low"] as const) tiers.set(tier, await loadMovementAsset("zones/ferris-harbor.glb", tier));
  });
  const assetFor = (tier: MovementTier) => {
    const asset = tiers.get(tier);
    if (!asset) throw new Error(`Missing ${tier} fixture`);
    return asset;
  };
  const boothBox = (tier: MovementTier, name: string) => {
    const box = assetFor(tier).authored.get(`COL_MOVE_FERRIS_HARBOR_TICKET_${name}`);
    if (!box) throw new Error(`Missing ${tier} authored ticket ${name}`);
    return box;
  };

  it.each(cases)("%s %s: visible wall blocks a long movement frame; removing its collider is detected", (tier, role) => {
    const asset = assetFor(tier), wall = boothBox(tier, "WEST_FRONT");
    const surface = visibleSurface(asset.root, [-22, 1.5, 32], [1, 0, 0], 2);
    expect(surface, "Real wall must exist before testing collision").toBeDefined();
    if (!surface) throw new Error("Missing visible west wall");
    const solid = createMovementProbe(role, [-22, .2, 32], { right: true });
    // 200 ms is an intentional long-frame stress above runtime's 50 ms cap.
    solid.controller.update(.2, asset.colliders);
    expect(solid.sample().x + .35).toBeLessThanOrEqual(surface.x + .03);
    const missing = createMovementProbe(role, [-22, .2, 32], { right: true });
    missing.controller.update(.2, withoutMovementBox(asset.colliders, wall));
    expect(missing.sample().x).toBeGreaterThan(surface.x + .1);
  });

  it.each(cases)("%s %s: real side doorway is traversable; an invisible blocker is detected", (tier, role) => {
    const asset = assetFor(tier);
    expect(visibleSurface(asset.root, [-22, 1.5, 30.8], [1, 0, 0], 1.6)).toBeUndefined();
    const clear = createMovementProbe(role, [-22, .2, 30.8], { right: true });
    clear.controller.update(.2, asset.colliders);
    expect(clear.sample().x).toBeGreaterThan(-20.5);
    const ghost = new THREE.Box3(new THREE.Vector3(-21, .05, 30.4), new THREE.Vector3(-20.65, 2.6, 31.2));
    const blocked = createMovementProbe(role, [-22, .2, 30.8], { right: true });
    blocked.controller.update(.2, [...asset.colliders, ghost]);
    expect(blocked.sample().x).toBeLessThan(-21.2);
    expect(clear.sample().x - blocked.sample().x).toBeGreaterThan(.7);
  });

  it.each(cases)("%s %s: roof top catches a fall; removing the physical roof is detected", (tier, role) => {
    const asset = assetFor(tier), roof = boothBox(tier, "ROOF");
    const surface = visibleSurface(asset.root, [-19, 5, 31], [0, -1, 0], 3);
    expect(surface).toBeDefined();
    if (!surface) throw new Error("Missing visible roof top");
    const landing = (colliders: THREE.Box3[]) => {
      const probe = createMovementProbe(role, [-19, 6, 31]);
      for (let frame = 0; frame < 45; frame++) probe.controller.update(.05, colliders);
      return probe.feetY();
    };
    expect(landing(asset.colliders)).toBeCloseTo(surface.y, 2);
    expect(landing(withoutMovementBox(asset.colliders, roof))).toBeLessThan(surface.y - 1);
  });

  it.each(cases)("%s %s: roof underside stops a jump; a raised collider that allows clipping is detected", (tier, role) => {
    const asset = assetFor(tier), roof = boothBox(tier, "ROOF");
    const underside = visibleSurface(asset.root, [-19, 2.8, 31], [0, 1, 0], 1);
    expect(underside).toBeDefined();
    if (!underside) throw new Error("Missing visible roof underside");
    const jump = (colliders: THREE.Box3[]) => {
      const probe = createMovementProbe(role, [-19, .2, 31], { jump: true });
      let maxHead = 0;
      for (let frame = 0; frame < 60; frame++) {
        probe.controller.update(1 / 60, colliders);
        probe.state.jump = false;
        maxHead = Math.max(maxHead, probe.sample().headY);
      }
      return maxHead;
    };
    expect(jump(asset.colliders)).toBeLessThanOrEqual(underside.y + .005);
    const raised = roof.clone(); raised.min.y += .12;
    expect(jump([...withoutMovementBox(asset.colliders, roof), raised])).toBeGreaterThan(underside.y + .08);
  });

  it.each(cases)("%s %s: a real boat deck supports the actor; removing dynamic colliders is detected", (tier, role) => {
    const asset = assetFor(tier);
    const boatRig = new BoatCollisionRig([asset.root]);
    const deck = visibleSurface(asset.root, [7.7, 4, 50], [0, -1, 0], 6);
    expect(deck).toBeDefined();
    if (!deck) throw new Error("Missing visible workboat deck");
    const drop = (includeBoatColliders: boolean) => {
      const probe = createMovementProbe(role, [7.7, 4, 50]);
      const supports = includeBoatColliders ? boatRig.colliders : [];
      probe.controller.setBoatSupports(supports);
      for (let frame = 0; frame < 180; frame++) probe.controller.update(1 / 60, [...asset.colliders, ...supports]);
      return { feetY: probe.feetY(), inWater: probe.controller.isInWater() };
    };
    const supported = drop(true), missing = drop(false);
    expect(supported.inWater).toBe(false);
    expect(supported.feetY).toBeCloseTo(deck.y, 2);
    expect(missing.inWater).toBe(true);
    expect(missing.feetY).toBeCloseTo(-1.6, 3);
  });
});

describe(`assembled map route verification (${movementAssetRoot})`, () => {
  const maps = new Map<MovementTier, { scene: THREE.Scene; colliders: THREE.Box3[] }>();
  beforeAll(async () => {
    installHeadlessDom();
    const promoted = HARBOR_ZONE_ASSETS.filter((zone) => zone.promoted);
    for (const tier of ["high", "low"] as const) {
      const warehouse = await loadMovementAsset("warehouse.glb", tier);
      const cinematic = await loadMovementAsset("cinematic/harbor-cinematic.glb", tier, {
        zoneOverrides: promoted.map((zone) => zone.override),
      });
      const zones = [];
      for (const zone of promoted) zones.push(await loadMovementAsset(`zones/${zone.id}.glb`, tier));
      const scene = new THREE.Scene();
      const map = buildHarborV2Map(scene, mapData as MapData, warehouse, tier, cinematic, zones);
      scene.updateMatrixWorld(true);
      maps.set(tier, { scene, colliders: map.colliders });
    }
  }, 30_000);

  it.each(cases)("%s %s: assembled rescue lane stays walkable; a leftover old tree collider is detected", (tier, role) => {
    const map = maps.get(tier);
    if (!map) throw new Error(`Missing assembled ${tier} map`);
    const walk = (x: number, colliders: THREE.Box3[]) => {
      const probe = createMovementProbe(role, [x, .24, 12.5], { backward: true });
      // Use a route endpoint, not equal elapsed time: a default Prop is slower.
      for (let frame = 0; frame < 240 && probe.sample().z < 32.5; frame++) probe.controller.update(1 / 60, colliders);
      return probe.sample();
    };
    for (const x of [43.4, 45, 48.6]) {
      const ground = visibleSurface(map.scene, [x, .31, 28], [0, -1, 0], .1);
      expect(ground, "The assembled route must have visible pavement").toBeDefined();
      if (!ground) throw new Error("Missing rescue pavement");
      expect(visibleSurface(map.scene, [x, 1, 12.5], [0, 0, 1], 20)).toBeUndefined();
      const result = walk(x, map.colliders);
      expect(result.z, `Real ${role} stalled in clear lane x=${x}`).toBeGreaterThan(32);
      expect(result.feetY).toBeCloseTo(ground.y, 2);
    }
    // This is the exact old tree at (45,28), not a new arbitrary obstacle.
    // The visible route above is unchanged; only obsolete collision is restored.
    const oldTree = new THREE.Box3(new THREE.Vector3(44.75, 0, 27.75), new THREE.Vector3(45.25, 1.5, 28.25));
    expect(walk(45, [...map.colliders, oldTree]).z).toBeLessThan(27.5);
  });
});
