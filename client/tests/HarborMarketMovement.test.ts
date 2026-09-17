import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import type { MapData } from "@catch-and-run/shared";
import type { InputState } from "../src/input/InputManager";
import { buildHarborV2Map } from "../src/game/world/maps/harborV2Map";
import { detectLadderVolumes, ladderVolumeFromBox } from "../src/game/controllers/LadderClimb";
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
type Vec = readonly [number, number, number];
type Asset = Awaited<ReturnType<typeof loadMovementAsset>>;
type MapFixture = ReturnType<typeof buildHarborV2Map> & { scene: THREE.Scene; market: Asset };
const box = (min: Vec, max: Vec) => new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));

/**
 * Bounded candidate gate: the Market is visual GLB + procedural shell/fixtures,
 * not a self-contained zone file. Assemble every real candidate zone so old
 * cinematic blockers cannot silently survive integration. Never fall back to
 * production if HARBOR_VERIFY_ASSET_ROOT names an incomplete candidate tree.
 * Negative controls alter only local collider arrays/ladder metadata in memory.
 */
describe(`Harbor Market real movement verification (${movementAssetRoot})`, () => {
  const maps = new Map<MovementTier, MapFixture>();
  beforeAll(async () => {
    installHeadlessDom();
    const promoted = HARBOR_ZONE_ASSETS.filter((zone) => zone.promoted);
    for (const tier of ["high", "low"] as const) {
      const warehouse = await loadMovementAsset("warehouse.glb", tier);
      const cinematic = await loadMovementAsset("cinematic/harbor-cinematic.glb", tier, {
        zoneOverrides: promoted.map((zone) => zone.override),
      });
      const zones: Asset[] = [];
      let market: Asset | undefined;
      for (const zone of promoted) {
        const asset = await loadMovementAsset(`zones/${zone.id}.glb`, tier);
        // Physical route parity alone can pass while both render LODs overlap.
        // Check Group ancestors as well as Meshes: a multi-material glTF node
        // expands into primitives whose generated names may have no LOD suffix.
        const rejectedLod = tier === "low" ? "LOD0" : "LOD1";
        const wrongLodNodes: string[] = [];
        asset.root.traverse((object) => {
          if (object.userData.zoneLod === rejectedLod || object.name.endsWith(`_${rejectedLod}`)) {
            wrongLodNodes.push(object.name);
          }
        });
        expect(wrongLodNodes, `${tier} ${zone.id} retained the opposite render LOD`).toEqual([]);
        zones.push(asset);
        if (zone.id === "container-bd") market = asset;
      }
      if (!market) throw new Error("No promoted Market asset was loaded");
      const scene = new THREE.Scene();
      const assembled = buildHarborV2Map(scene, mapData as MapData, warehouse, tier, cinematic, zones);
      scene.updateMatrixWorld(true);
      maps.set(tier, { ...assembled, scene, market });
    }
  }, 30_000);

  const mapFor = (tier: MovementTier) => {
    const result = maps.get(tier);
    if (!result) throw new Error(`Missing assembled ${tier} Market`);
    return result;
  };
  const physicalBox = (map: MapFixture, min: Vec, max: Vec) => {
    const expected = box(min, max);
    const matches = map.colliders.filter((candidate) => candidate.min.distanceTo(expected.min) < 1e-4
      && candidate.max.distanceTo(expected.max) < 1e-4);
    expect(matches, "The real assembled collider must have one unambiguous owner").toHaveLength(1);
    return matches[0];
  };
  const authoredBox = (map: MapFixture, suffix: string) => {
    const result = map.market.authored.get(`COL_MOVE_CONTAINER_BD_MARKET_${suffix}`);
    if (!result) throw new Error(`Missing Market ${suffix} collider`);
    return result;
  };
  const walk = (role: MovementRole, start: Vec, controls: Partial<InputState>, colliders: THREE.Box3[],
    reached: (sample: ReturnType<ReturnType<typeof createMovementProbe>["sample"]>) => boolean) => {
    const probe = createMovementProbe(role, start, controls);
    for (let frame = 0; frame < 360 && !reached(probe.sample()); frame++) probe.controller.update(1 / 60, colliders);
    return probe.sample();
  };
  const fall = (role: MovementRole, start: Vec, colliders: THREE.Box3[]) => {
    const probe = createMovementProbe(role, start);
    for (let frame = 0; frame < 120; frame++) probe.controller.update(1 / 60, colliders);
    return probe.sample();
  };

  it.each(cases)("%s %s: front door admits the body on three tracks; an invisible door blocker fails", (tier, role) => {
    const map = mapFor(tier);
    for (const x of [43.95, 45, 46.05]) {
      expect(visibleSurface(map.scene, [x, 1.3, -31.6], [0, 0, -1], 2.9)).toBeUndefined();
      const result = walk(role, [x, .25, -31.6], { forward: true }, map.colliders, (p) => p.z < -34.4);
      expect(result.z, `Door body clearance at x=${x}`).toBeLessThan(-34.4);
      expect(result.feetY).toBeCloseTo(.25, 2);
    }
    const ghost = box([43.5, .25, -33.15], [46.5, 2.9, -32.85]);
    const blocked = walk(role, [45, .25, -31.6], { forward: true }, [...map.colliders, ghost], (p) => p.z < -34.4);
    expect(blocked.z).toBeGreaterThan(-32.6);
  });

  it.each(cases)("%s %s: all five shop aisles stay walkable; a hidden shelf in the centre aisle fails", (tier, role) => {
    const map = mapFor(tier);
    const routes: { name: string; start: Vec; end: Vec; controls: Partial<InputState>; reached: (p: { x: number; z: number }) => boolean }[] = [
      { name: "centre", start: [44, .25, -34.4], end: [44, .25, -40.6], controls: { forward: true }, reached: (p) => p.z < -40.6 },
      { name: "produce", start: [40.3, .25, -34.4], end: [40.3, .25, -39.7], controls: { forward: true }, reached: (p) => p.z < -39.7 },
      { name: "checkout", start: [47.35, .25, -34.4], end: [47.35, .25, -40.9], controls: { forward: true }, reached: (p) => p.z < -40.9 },
      { name: "rear", start: [43.6, .25, -41.2], end: [50.4, .25, -41.2], controls: { right: true }, reached: (p) => p.x > 50.4 },
      { name: "front", start: [40, .25, -34.1], end: [48, .25, -34.1], controls: { right: true }, reached: (p) => p.x > 48 },
    ];
    for (const route of routes) {
      const delta = new THREE.Vector3(...route.end).sub(new THREE.Vector3(...route.start));
      expect(visibleSurface(map.scene, [route.start[0], 1.1, route.start[2]], [delta.x, 0, delta.z], delta.length()), route.name).toBeUndefined();
      const result = walk(role, route.start, route.controls, map.colliders, route.reached);
      expect(route.reached(result), `Actor stalled in ${route.name} aisle`).toBe(true);
      expect(result.feetY, `${route.name} should not require stepping onto stock`).toBeCloseTo(.25, 2);
    }
    const ghost = box([43.3, .25, -37.2], [44.7, 2.2, -36.8]);
    const blocked = walk(role, [44, .25, -34.4], { forward: true }, [...map.colliders, ghost], (p) => p.z < -40.6);
    expect(blocked.z).toBeGreaterThan(-36.5);
  });

  it.each(cases)("%s %s: stockroom and office doors admit the actor; a closed invisible room box fails", (tier, role) => {
    const map = mapFor(tier);
    for (const x of [40.15, 42.35]) {
      expect(visibleSurface(map.scene, [x, 1.5, -39.7], [0, 0, -1], 1.8)).toBeUndefined();
      const result = walk(role, [x, .25, -39.7], { forward: true }, map.colliders, (p) => p.z < -41.55);
      expect(result.z).toBeLessThan(-41.55);
      expect(result.feetY).toBeCloseTo(.25, 2);
    }
    const ghost = box([39.7, .25, -40.61], [40.6, 2.35, -40.49]);
    const blocked = walk(role, [40.15, .25, -39.7], { forward: true }, [...map.colliders, ghost], (p) => p.z < -41.55);
    expect(blocked.z).toBeGreaterThan(-40.2);
  });

  it.each(cases)("%s %s: front glazing blocks a 200 ms movement frame; removing its physical owner fails", (tier, role) => {
    const map = mapFor(tier);
    const surface = visibleSurface(map.scene, [41, 1.4, -31.8], [0, 0, -1], 2);
    expect(surface, "Exported glazing, not a collider proxy, is the visual oracle").toBeDefined();
    if (!surface) throw new Error("Missing Market glazing");
    const glass = physicalBox(map, [38, 0, -33.15], [43.5, 5.5, -32.85]);
    const move = (colliders: THREE.Box3[]) => {
      const probe = createMovementProbe(role, [41, .25, -31.8], { forward: true });
      probe.controller.update(.2, colliders);
      return probe.sample();
    };
    const solid = move(map.colliders), missing = move(withoutMovementBox(map.colliders, glass));
    expect(solid.z - .35).toBeGreaterThanOrEqual(surface.z - .005);
    // Separate the 30 cm shell envelope from the controller's discrete-step
    // stopping gap (at most one radius). The latter is not visual thickness.
    expect(glass.max.z - surface.z).toBeLessThanOrEqual(.15);
    expect(solid.z - .35 - glass.max.z).toBeLessThanOrEqual(.35);
    expect(missing.z).toBeLessThan(surface.z - .1);
  });

  it.each(cases)("%s %s: grocery shelving is solid; deleting its gameplay box exposes clipping", (tier, role) => {
    const map = mapFor(tier);
    const shelf = physicalBox(map, [41.2, .25, -38.95], [42.2, 1.85, -35.15]);
    // Probe the solid kickplate at .35 m, not an air gap between shelf levels.
    const surface = visibleSurface(map.scene, [43.2, .35, -37], [-1, 0, 0], 1.4);
    expect(surface).toBeDefined();
    if (!surface) throw new Error("Missing visible Market shelving");
    const move = (colliders: THREE.Box3[]) => {
      const probe = createMovementProbe(role, [43.2, .25, -37], { left: true });
      probe.controller.update(.2, colliders);
      return probe.sample();
    };
    expect(move(map.colliders).x - .35).toBeGreaterThanOrEqual(surface.x - .025);
    expect(move(withoutMovementBox(map.colliders, shelf)).x).toBeLessThan(surface.x - .2);
  });

  it.each(cases)("%s %s: the roof catches a fall on the exported surface; a missing roof collider fails", (tier, role) => {
    const map = mapFor(tier);
    const surface = visibleSurface(map.scene, [44, 7, -39], [0, -1, 0], 2);
    expect(surface).toBeDefined();
    if (!surface) throw new Error("Missing visible Market roof");
    const roof = physicalBox(map, [39.3, 5.5, -44], [53, 5.8, -32]);
    expect(fall(role, [44, 8, -39], map.colliders).feetY).toBeCloseTo(surface.y, 2);
    expect(fall(role, [44, 8, -39], withoutMovementBox(map.colliders, roof)).feetY).toBeLessThan(surface.y - 1);
  });

  it.each(cases)("%s %s: jumping from a shelf cannot pierce the suspended ceiling; a raised proxy fails", (tier, role) => {
    const map = mapFor(tier), ceiling = authoredBox(map, "CEILING_AISLE");
    const underside = visibleSurface(map.scene, [41.7, 4, -37], [0, 1, 0], .4);
    expect(underside).toBeDefined();
    if (!underside) throw new Error("Missing visible suspended ceiling");
    const jump = (colliders: THREE.Box3[]) => {
      const probe = createMovementProbe(role, [41.7, 1.85, -37]);
      // Settle first so this is a real grounded jump, not fabricated velocity.
      for (let frame = 0; frame < 3; frame++) probe.controller.update(1 / 60, colliders);
      probe.state.jump = true;
      let maxHead = 0;
      for (let frame = 0; frame < 80; frame++) {
        probe.controller.update(1 / 60, colliders);
        probe.state.jump = false;
        maxHead = Math.max(maxHead, probe.sample().headY);
      }
      return maxHead;
    };
    expect(jump(map.colliders)).toBeLessThanOrEqual(underside.y + .005);
    const raised = ceiling.clone(); raised.min.y += .12; raised.max.y += .12;
    expect(jump([...withoutMovementBox(map.colliders, ceiling), raised])).toBeGreaterThan(underside.y + .08);
  });

  it.each(cases)("%s %s: sampled ceiling details preserve jump clearance; lowered trim is detected", (tier, role) => {
    const map = mapFor(tier);
    const jump = (start: Vec) => {
      const probe = createMovementProbe(role, start);
      for (let frame = 0; frame < 3; frame++) probe.controller.update(1 / 60, map.colliders);
      expect(probe.sample().feetY).toBeCloseTo(start[1], 2);
      probe.state.jump = true;
      let maxHead = 0;
      for (let frame = 0; frame < 80; frame++) {
        probe.controller.update(1 / 60, map.colliders);
        probe.state.jump = false;
        maxHead = Math.max(maxHead, probe.sample().headY);
      }
      return maxHead;
    };
    // These authored detail locations are independent of material batching and
    // stay useful if optional vent geometry is removed: the ceiling must still
    // be visible and agree with its physical underside. The shelf edge is real
    // ground support for both body sizes; no fake platform or velocity is added.
    const points: Vec[] = [[43.4, .25, -38.4], [47.6, .25, -40.5], [47.6, .25, -34.8], [46.608, 1.85, -37]];
    for (const start of points) {
      const [x, , z] = start;
      const proxy = [...map.market.authored].find(([name, bounds]) => name.includes("_CEILING_")
        && x >= bounds.min.x && x <= bounds.max.x && z >= bounds.min.z && z <= bounds.max.z)?.[1];
      expect(proxy, `Missing ceiling owner at ${x},${z}`).toBeDefined();
      const underside = visibleSurface(map.scene, [x, 4, z], [0, 1, 0], .4);
      expect(underside, `Missing visible ceiling at ${x},${z}`).toBeDefined();
      if (!proxy || !underside) throw new Error("Missing sampled ceiling contract");
      expect(underside.y, `Visible trim protrudes into head clearance at ${x},${z}`).toBeGreaterThanOrEqual(proxy.min.y - .005);
      // A shallow recess behind the physical underside is conservative, unlike
      // the former 23–47 mm protrusions below it. Bound it to 20 mm so a missing
      // detail cannot silently defer the oracle to a distant roof surface.
      expect(underside.y).toBeLessThanOrEqual(proxy.min.y + .02);
      const maxHead = jump(start);
      expect(maxHead).toBeGreaterThan(start[1] + (role === "hunter" ? 1.8 : .9) + .1);
      expect(maxHead, `Jump pierces visible ceiling at ${x},${z}`).toBeLessThanOrEqual(underside.y + .005);
      if (start[1] > 1) expect(maxHead).toBeGreaterThanOrEqual(underside.y - .005);
    }
    // Recreate the actual regression: a visible trim plate below an unchanged
    // ceiling collider. Only this local visual is perturbed, then fully removed.
    const trim = new THREE.Mesh(new THREE.BoxGeometry(.2, .02, .2), new THREE.MeshBasicMaterial());
    trim.position.set(46.608, 4.15, -37);
    map.scene.add(trim);
    map.scene.updateMatrixWorld(true);
    try {
      const lowered = visibleSurface(map.scene, [46.608, 4, -37], [0, 1, 0], .4);
      expect(lowered).toBeDefined();
      if (!lowered) throw new Error("Lowered-trim negative control was not rendered");
      expect(jump([46.608, 1.85, -37])).toBeGreaterThan(lowered.y + .04);
    } finally {
      map.scene.remove(trim);
      trim.geometry.dispose();
      trim.material.dispose();
    }
    expect(visibleSurface(map.scene, [46.608, 4, -37], [0, 1, 0], .4)?.y).toBeCloseTo(4.2, 2);
  });

  it.each(cases)("%s %s: the roof hatch is open for a falling body; an invisible hatch cap fails", (tier, role) => {
    const map = mapFor(tier);
    // Beside the physical ladder column, still wholly inside the 1.1 m hatch.
    expect(visibleSurface(map.scene, [38.94, 7, -41.3], [0, -1, 0], 3)).toBeUndefined();
    const clear = fall(role, [38.94, 7, -41.3], map.colliders);
    expect(clear.feetY).toBeCloseTo(.25, 2);
    const cap = box([38.2, 5.5, -41.9], [39.3, 5.8, -40.7]);
    const blocked = fall(role, [38.94, 7, -41.3], [...map.colliders, cap]);
    expect(blocked.feetY).toBeCloseTo(5.8, 2);
  });

  it.each(cases)("%s %s: the authored stockroom ladder reaches the roof; missing ladder metadata fails", (tier, role) => {
    const map = mapFor(tier);
    const marketLadders = map.market.ladders;
    expect(marketLadders).toHaveLength(1);
    expect(marketLadders[0].approach).toBe("+x");
    const climb = (includeAuthored: boolean) => {
      // Zero yaw: forward+left gives a valid initial intent toward the +x face;
      // once grabbed the real ladder state machine uses forward to ascend.
      const probe = createMovementProbe(role, [39.03, .25, -41.3]);
      probe.controller.setLadders([
        ...detectLadderVolumes(map.colliders),
        ...map.ladders.filter((l) => includeAuthored || !marketLadders.includes(l))
          .map((l) => ladderVolumeFromBox(l.box, l.approach)),
      ]);
      // setPosition deliberately releases any old ladder and starts the real
      // 350 ms re-grab cooldown. Wait in place instead of walking away from it.
      for (let frame = 0; frame < 30; frame++) probe.controller.update(1 / 60, map.colliders);
      probe.state.forward = true; probe.state.left = true;
      let grabbed = false;
      for (let frame = 0; frame < 250; frame++) {
        probe.controller.update(1 / 60, map.colliders);
        if (probe.controller.isClimbingLadder()) { grabbed = true; probe.state.left = false; }
        if (grabbed && !probe.controller.isClimbingLadder()) break;
      }
      probe.state.forward = false; probe.state.left = false;
      for (let frame = 0; frame < 3; frame++) probe.controller.update(1 / 60, map.colliders);
      return { ...probe.sample(), grabbed };
    };
    const climbed = climb(true), missing = climb(false);
    expect(climbed.grabbed).toBe(true);
    expect(climbed.feetY).toBeCloseTo(5.8, 2);
    expect(climbed.x).toBeLessThan(38.2);
    expect(visibleSurface(map.scene, [climbed.x, 6, climbed.z], [0, -1, 0], .3)?.y).toBeCloseTo(climbed.feetY, 2);
    expect(missing.grabbed).toBe(false);
    expect(missing.feetY).toBeLessThan(1);
    // This case proves access/landing, not a collision sweep while climbing:
    // the current ladder controller bypasses ordinary body collision. The
    // preceding independent hatch test is required and must not be removed.
  });
});
