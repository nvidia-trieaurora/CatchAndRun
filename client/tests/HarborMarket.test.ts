import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { installHeadlessDom } from "./helpers/headlessDom";

// Harbor Market — the BD shop (38..52 × -43..-33, storefront at z -33 facing south).
// Gameplay boxes live in buildDocksideMiniMart (oldHarborFortnite.ts); the zone GLB
// only dresses them. These tests pin the floorplan contract the visuals are built on.
const CONTRACT_PATH = path.resolve(__dirname, "../../tools/harbor-v2/zones/contracts/container_bd.json");
const METRICS_PATH = path.resolve(__dirname, "../../art-source/harbor-v2/_staging/container-bd-candidate.metrics.json");
const BUILD_STATS_PATH = path.resolve(__dirname, "../../art-source/harbor-v2/_staging/container-bd-build-stats.json");

interface Vol { min: [number, number, number]; max: [number, number, number] }
interface Contract {
  gameplay: {
    miniMart: { door: { x: [number, number]; z: number; clearHeight: number } };
    harborMarket: {
      leftSideClear: Vol;
      gondolas: [number, number, number, number][];
      checkout: [number, number, number, number];
      fridges: [number, number, number, number][];
      rooms: { min: [number, number]; max: [number, number]; doors: [number, number][] };
      roofHatch: Vol;
      roofLadder: { collider: string; approach: string } & Vol;
    };
  };
  clearance: ({ name: string } & Vol)[];
}
interface Metrics { passed: boolean; zoneColliders: ({ name: string } & Vol)[] }
interface BuildStats {
  shop: { lod0Triangles: number; lod1Triangles: number; lod0Materials: number; lod1Materials: number; products: number };
}

const box = (v: Vol) => new THREE.Box3(new THREE.Vector3(...v.min), new THREE.Vector3(...v.max));
const vol = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
  new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));

function overlapVolume(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const dy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const dz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  return dx > 0 && dy > 0 && dz > 0 ? dx * dy * dz : 0;
}
const intersecting = (colliders: THREE.Box3[], volume: THREE.Box3) =>
  colliders.filter((c) => overlapVolume(c, volume) > 1e-6);
const describeBox = (c: THREE.Box3) =>
  `[${c.min.x.toFixed(2)},${c.min.y.toFixed(2)},${c.min.z.toFixed(2)} -> ${c.max.x.toFixed(2)},${c.max.y.toFixed(2)},${c.max.z.toFixed(2)}]`;

describe("Harbor Market floorplan (BD shop)", () => {
  let colliders: THREE.Box3[] = [];
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8")) as Contract;
  const hm = contract.gameplay.harborMarket;

  beforeAll(async () => {
    installHeadlessDom();
    const { buildOldHarborFortniteMap } = await import("../src/game/world/maps/oldHarborFortnite");
    const mapData = (await import("../src/game/world/harbor-warehouse.json")).default;
    colliders = buildOldHarborFortniteMap(new THREE.Scene(), mapData as never, {
      useWarehouseV2: true,
      cinematicVisuals: true,
      quality: "high",
    }).colliders;
  });

  it("keeps the left (west) side flat: no stair, ramp, landing, post or invisible box", () => {
    const hits = intersecting(colliders, box(hm.leftSideClear));
    expect(hits.map(describeBox)).toEqual([]);
    // and the roof is no longer reachable from that side: nothing to step on between the
    // ground and the roof slab within 3 m of the west wall
    const steps = colliders.filter((c) => c.max.x > 34 && c.min.x < 38 && c.min.y > 0.3 && c.min.y < 5.4 && c.max.z > -44 && c.min.z < -32.5);
    expect(steps.map(describeBox)).toEqual([]);
  });

  it("reaches the roof from inside instead: a hatch hole above the stockroom ladder", () => {
    const hatch = box(hm.roofHatch);
    // the hole itself is open (the ladder column passes through it)
    expect(intersecting(colliders, hatch).map(describeBox)).toEqual([]);
    // but the roof around it is solid on all four sides
    for (const [dx, dz] of [[-0.3, 0], [0.3, 0], [0, -0.3], [0, 0.3]] as const) {
      const probe = hatch.clone().translate(new THREE.Vector3(dx * 4, 0, dz * 4));
      expect(intersecting(colliders, probe).length, `roof beside the hatch ${dx},${dz}`).toBeGreaterThan(0);
    }
    // the ladder column stays inside the stockroom, clear of every procedural box
    expect(intersecting(colliders, box(hm.roofLadder)).map(describeBox)).toEqual([]);
    expect(hm.roofLadder.approach).toBe("+x");
    expect(hm.roofLadder.max[1]).toBe(hm.roofHatch.max[1]);
  });

  it("opens a 3 m automatic double door, 4 m clear, with a free approach inside and out", () => {
    const door = contract.gameplay.miniMart.door;
    expect(door.x[1] - door.x[0]).toBeCloseTo(3.0, 5);
    const doorway = vol(door.x[0], 0.26, door.z - 1.6, door.x[1], 4.0, door.z + 1.6);
    expect(intersecting(colliders, doorway).map(describeBox)).toEqual([]);
    // the glazing either side of the door is solid down to the slab (no walk-through glass)
    const leftGlass = colliders.find((c) => Math.abs(c.max.x - door.x[0]) < 1e-6 && c.min.x <= 38.01 && Math.abs(c.min.z - (door.z - 0.15)) < 1e-6);
    const rightGlass = colliders.find((c) => Math.abs(c.min.x - door.x[1]) < 1e-6 && c.max.x >= 51.99 && Math.abs(c.min.z - (door.z - 0.15)) < 1e-6);
    expect(leftGlass && rightGlass).toBeTruthy();
    expect(leftGlass?.min.y).toBe(0);
    expect(rightGlass?.min.y).toBe(0);
  });

  it("gives every fixture of the floorplan exactly one gameplay box", () => {
    const fixtureBoxes = [...hm.gondolas, hm.checkout, ...hm.fridges].map(([x0, z0, x1, z1]) => vol(x0, 0.25, z0, x1, 0.3, z1));
    for (const fx of fixtureBoxes) {
      const owners = colliders.filter((c) => Math.abs(c.min.x - fx.min.x) < 1e-6 && Math.abs(c.max.x - fx.max.x) < 1e-6
        && Math.abs(c.min.z - fx.min.z) < 1e-6 && Math.abs(c.max.z - fx.max.z) < 1e-6);
      expect(owners, `fixture ${describeBox(fx)}`).toHaveLength(1);
      expect(owners[0].max.y).toBeGreaterThanOrEqual(1.1);
    }
  });

  it("keeps every aisle at least 1.5 m wide and the rooms enterable (no dead ends, no prop-only pockets)", () => {
    const aisles = contract.clearance.filter((v) => v.name.startsWith("shop-aisle") || v.name === "shop-checkout-lane" || v.name === "shop-entrance-in");
    expect(aisles.length).toBeGreaterThanOrEqual(6);
    for (const aisle of aisles) {
      const width = Math.min(aisle.max[0] - aisle.min[0], aisle.max[2] - aisle.min[2]);
      // the clearance volume sits 0.05 m inside each fixture face
      expect(width + 0.1, aisle.name).toBeGreaterThanOrEqual(1.5);
      expect(intersecting(colliders, box(aisle)).map(describeBox), aisle.name).toEqual([]);
    }
    for (const [dx0, dx1] of hm.rooms.doors) {
      expect(dx1 - dx0).toBeGreaterThanOrEqual(0.9 - 1e-6);
      const doorway = vol(dx0 + 0.02, 0.26, hm.rooms.max[1] - 0.3, dx1 - 0.02, 2.1, hm.rooms.max[1] + 0.3);
      expect(intersecting(colliders, doorway).map(describeBox)).toEqual([]);
    }
    // the room partition walls reach the roof so nobody can hop over into a hidden pocket
    const walls = colliders.filter((c) => c.min.x >= hm.rooms.min[0] - 1e-6 && c.max.x <= hm.rooms.max[0] + 1e-6
      && c.min.z >= hm.rooms.min[1] - 1e-6 && c.max.z <= hm.rooms.max[1] + 0.2 && c.max.y >= 5.5);
    expect(walls.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps the zone GLB colliders out of the storefront approach, the left side and the aisles", () => {
    if (!existsSync(METRICS_PATH)) return;
    const metrics = JSON.parse(readFileSync(METRICS_PATH, "utf8")) as Metrics;
    expect(metrics.passed).toBe(true);
    const forbidden = [box(hm.leftSideClear), ...contract.clearance.filter((v) => v.name.startsWith("shop-")).map(box)];
    for (const collider of metrics.zoneColliders) {
      const c = box(collider);
      for (const volume of forbidden) {
        expect(overlapVolume(c, volume), `${collider.name} intrudes ${describeBox(volume)}`).toBeLessThanOrEqual(0);
      }
    }
    // the zone ships the roof-access ladder exactly where the contract says
    const ladder = metrics.zoneColliders.find((c) => c.name === hm.roofLadder.collider);
    expect(ladder?.min).toEqual(hm.roofLadder.min);
    expect(ladder?.max).toEqual(hm.roofLadder.max);
    if (!existsSync(BUILD_STATS_PATH)) return;
    const stats = JSON.parse(readFileSync(BUILD_STATS_PATH, "utf8")) as BuildStats;
    expect(stats.shop.lod0Triangles).toBeLessThanOrEqual(35_000);
    expect(stats.shop.lod1Triangles).toBeLessThanOrEqual(8_000);
    expect(stats.shop.lod0Materials).toBeLessThanOrEqual(15);
    expect(stats.shop.lod1Materials).toBeLessThanOrEqual(8);
    expect(stats.shop.products).toBeGreaterThan(200);
  });
});
