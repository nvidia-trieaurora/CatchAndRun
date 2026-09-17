import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareMapAsset } from "../src/game/world/assets/MapAssetLoader";
import {
  HARBOR_ZONE_ASSETS,
  OPERATIONS_AB_CARVE_BOX,
  OPERATIONS_AB_REMOVED_COLLIDERS,
  activeHarborZoneAssets,
} from "../src/game/world/zones/harborZones";
import { installHeadlessDom } from "./helpers/headlessDom";

const zone = HARBOR_ZONE_ASSETS.find((asset) => asset.id === "operations-ab");
if (!zone) throw new Error("operations-ab zone asset missing");

const CONTRACT_PATH = path.resolve(__dirname, "../../tools/harbor-v2/zones/contracts/operations_ab.json");
const METRICS_PATH = path.resolve(__dirname, "../../art-source/harbor-v2/_staging/operations-ab-candidate.metrics.json");
const SERVER_MAP_PATH = path.resolve(__dirname, "../../server/src/data/maps/harbor-warehouse.json");

interface Box { min: [number, number, number]; max: [number, number, number] }
interface Contract {
  removesCinematicColliders: string[];
  carveBox: Box;
  footprint: Box;
  expectedProceduralColliders: number;
  gameplay: {
    building: { doors: { personnel: [number, number]; roller: [number, number]; sideDoorZ: [number, number] } };
    lane: { z: [number, number]; clear: [number, number] };
    seawallCollider: Box;
    waterHazardZ: number;
  };
  clearance: ({ name: string } & Box)[];
  budgets: {
    lod0Triangles: number; lod0DrawCalls: number; lod1Triangles: number; lod1DrawCalls: number;
    payloadBytes: number; gpuTextureBytes: number; zoneColliders: number;
  };
}
interface Metrics {
  passed: boolean;
  zoneColliders: { name: string; min: [number, number, number]; max: [number, number, number] }[];
  lod0: { triangles: number; estimatedDrawCalls: number; instancedMeshes: number };
  lod1: { triangles: number; estimatedDrawCalls: number };
  payloadBytes: number;
  estimatedGpuTextureBytes: number;
}
interface WaterHazardMap {
  waterHazards: { id: string; min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }[];
}

const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8")) as Contract;

function toBox3(box: Box): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(...box.min), new THREE.Vector3(...box.max));
}

function overlapVolume(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const dy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const dz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  return dx > 0 && dy > 0 && dz > 0 ? dx * dy * dz : 0;
}

function intruding(colliders: THREE.Box3[], volume: THREE.Box3): THREE.Box3[] {
  return colliders.filter((box) => overlapVolume(box, volume) > 1e-6);
}

function legacyMesh(name: string, harborZone: string, min: THREE.Vector3, max: THREE.Vector3): THREE.Mesh {
  const size = max.clone().sub(min);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshStandardMaterial());
  mesh.name = name;
  mesh.userData.harborZone = harborZone;
  mesh.position.copy(min).add(size.multiplyScalar(0.5));
  return mesh;
}

/** One non-indexed batch made of boxes at the given centres (mirrors a merged cinematic batch). */
function mergedBatch(name: string, harborZone: string, centres: [number, number, number][], height = 1): THREE.Mesh {
  const parts = centres.map(([x, y, z]) => new THREE.BoxGeometry(1, height, 1).toNonIndexed().translate(x, y, z));
  const total = parts.reduce((n, g) => n + g.getAttribute("position").array.length, 0);
  const positions = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    positions.set(part.getAttribute("position").array as Float32Array, offset);
    offset += part.getAttribute("position").array.length;
  }
  const mesh = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3)),
    new THREE.MeshStandardMaterial(),
  );
  mesh.name = name;
  mesh.userData.harborZone = harborZone;
  return mesh;
}

describe("AB Harbor Operations & Repair Lane zone", () => {
  let procedural: THREE.Box3[] = [];

  beforeAll(async () => {
    installHeadlessDom();
    const { buildOldHarborFortniteMap } = await import("../src/game/world/maps/oldHarborFortnite");
    const mapData = (await import("../src/game/world/harbor-warehouse.json")).default;
    const result = buildOldHarborFortniteMap(new THREE.Scene(), mapData as never, {
      useWarehouseV2: true,
      cinematicVisuals: true,
      quality: "high",
    });
    procedural = result.colliders;
  });

  it("is registered as a promoted zone (cache token) that drops the cinematic bar shell colliders", () => {
    // promoted 2026-09-09 on request; the ?v token busts cached copies of the GLB
    expect(zone.promoted).toBe(true);
    expect(zone.url).toMatch(/^\/assets\/maps\/harbor-v2\/zones\/operations-ab\.glb\?v=/);
    expect(zone.stagingUrl).toBe("/staging-assets/structural-rp03/operations-ab-runtime.glb");
    expect(activeHarborZoneAssets("production").includes(zone)).toBe(true);
    expect(activeHarborZoneAssets("staging").includes(zone)).toBe(true);
    expect(activeHarborZoneAssets("off")).toEqual([]);
    expect(zone.override.removeZones).toEqual([]);
    expect(OPERATIONS_AB_REMOVED_COLLIDERS).toHaveLength(6);
    expect(zone.override.removeNames).toEqual([...OPERATIONS_AB_REMOVED_COLLIDERS]);
    expect(contract.removesCinematicColliders).toEqual([...OPERATIONS_AB_REMOVED_COLLIDERS]);
    expect(OPERATIONS_AB_CARVE_BOX.min.toArray()).toEqual(contract.carveBox.min);
    expect(OPERATIONS_AB_CARVE_BOX.max.toArray()).toEqual(contract.carveBox.max);
    // the strip never overlaps the AD (x ≤ -23.6) or BD (x ≥ 29.5) carve boxes
    const ad = HARBOR_ZONE_ASSETS.find((asset) => asset.id === "construction-ad");
    const bd = HARBOR_ZONE_ASSETS.find((asset) => asset.id === "container-bd");
    expect(ad && OPERATIONS_AB_CARVE_BOX.intersectsBox(ad.override.carveBox)).toBe(false);
    expect(bd && OPERATIONS_AB_CARVE_BOX.intersectsBox(bd.override.carveBox)).toBe(false);
  });

  it("removes only the six BAR colliders and carves the bar shell without touching slab, rail or Mini Mart", () => {
    const root = new THREE.Group();
    const barFront = legacyMesh("COL_MOVE_CINE_BAR_FRONT_CENTER", "cinematic-collision", new THREE.Vector3(-2, 0, -29.65), new THREE.Vector3(2, 5.8, -29.35));
    const barLeft = legacyMesh("COL_MOVE_CINE_BAR_LEFT", "cinematic-collision", new THREE.Vector3(-9.2, 0, -40.5), new THREE.Vector3(-8.8, 5.8, -29.5));
    const container = legacyMesh("COL_MOVE_CINE_CONTAINER_10", "cinematic-collision", new THREE.Vector3(25.84, 0, -29.35), new THREE.Vector3(32.16, 2.5, -26.65));
    const martHeader = legacyMesh("COL_MOVE_CINE_MART_FRONT_HEADER", "cinematic-collision", new THREE.Vector3(44, 2.8, -33.15), new THREE.Vector3(46, 5.2, -32.85));
    // shared dock roof: bar roof (incl. its z -43.5 overhang), Mini Mart roof
    const roof = mergedBatch("dock_MESH_roof_LOD0", "dock", [[0, 6, -35], [-5, 6, -43.0], [45, 6, -38]]);
    // map-wide steel LOD1: bar column, seawall rail in front of the bar, rail east of the strip
    const steel = mergedBatch("harbor_MESH_steel_navy_LOD1", "base", [[8, 3, -35], [0, 1.2, -43.0], [40, 1.2, -43.0]]);
    // legacy lane dashes (y 0.19..0.21) + the asphalt slab under them
    const dashes = mergedBatch("base_MESH_road_marking_LOD0", "base", [[0, 0.2, -22], [0, 0.2, 10]], 0.02);
    const asphalt = mergedBatch("base_MESH_asphalt_LOD0", "base", [[0, 0.09, -22]], 0.18);
    const railPost = legacyMesh("MESH_RAIL_POST_-2_-43", "base", new THREE.Vector3(-2.05, 0.58, -43.05), new THREE.Vector3(-1.95, 1.83, -42.95));
    root.add(barFront, barLeft, container, martHeader, roof, steel, dashes, asphalt, railPost);

    const asset = prepareMapAsset(root, "high", { zoneOverrides: [zone.override] });

    const kept = asset.colliders.map((box) => `${box.min.x.toFixed(2)},${box.max.y.toFixed(1)}`).sort();
    expect(kept).toEqual(["25.84,2.5", "44.00,5.2"]);
    expect(roof.geometry.getAttribute("position").count).toBe(36);          // only the Mini Mart cube survives
    expect(roof.geometry.getAttribute("position").getX(0)).toBeCloseTo(45.5, 5);
    expect(steel.geometry.getAttribute("position").count).toBe(72);         // both rail cubes survive
    expect(dashes.geometry.getAttribute("position").count).toBe(36);        // only the dash outside the lane
    expect(asphalt.geometry.getAttribute("position").count).toBe(36);       // ground is never carved
    expect(railPost.parent).toBe(root);
  });

  it("keeps every declared route clear of procedural gameplay colliders (lane, cross routes, doors, interior)", () => {
    expect(procedural).toHaveLength(contract.expectedProceduralColliders);
    for (const volume of contract.clearance) {
      const hits = intruding(procedural, toBox3(volume)).map((box) => `${box.min.toArray().map((v) => v.toFixed(2)).join(",")} -> ${box.max.toArray().map((v) => v.toFixed(2)).join(",")}`);
      expect(hits, `procedural collider inside clearance volume ${volume.name}`).toEqual([]);
    }
    // the 5 m inspection lane (z -24..-19) is free along the whole strip at walking height
    const [laneZ0, laneZ1] = contract.gameplay.lane.z;
    const fiveMetres = new THREE.Box3(new THREE.Vector3(-23.2, 0.25, laneZ0 + 1.0), new THREE.Vector3(29.4, 3.5, laneZ1));
    expect(intruding(procedural, fiveMetres)).toEqual([]);
    const mainLane = contract.clearance.find((volume) => volume.name === "main-lane");
    expect(mainLane && mainLane.max[2] - mainLane.min[2]).toBeGreaterThanOrEqual(4.6);
    for (const name of ["lane-west-full", "lane-east-full"]) {
      const volume = contract.clearance.find((entry) => entry.name === name);
      expect(volume && volume.max[2] - volume.min[2], name).toBeGreaterThanOrEqual(5.6);
    }
    // two cross-lane escape routes (west and east of the building) reach from the seawall pocket to the lane
    for (const name of ["cross-west", "cross-east"]) {
      const volume = contract.clearance.find((entry) => entry.name === name);
      expect(volume, name).toBeDefined();
      expect(volume!.max[0] - volume!.min[0]).toBeGreaterThanOrEqual(1.6 - 1e-6);
      expect(volume!.max[2]).toBeGreaterThanOrEqual(laneZ0);
      expect(volume!.min[2]).toBeLessThanOrEqual(-41.5);
    }
  });

  it("enters the Operations building through both front openings and the side door once the BAR colliders are gone", () => {
    const { personnel, roller, sideDoorZ } = contract.gameplay.building.doors;
    // the procedural shell keeps the wall segments between the doors and the 5 m lintels above them
    const frontWall = procedural.filter((box) => box.min.z <= -28.85 && box.max.z >= -29.15 && box.max.y >= 7);
    expect(frontWall.length).toBeGreaterThanOrEqual(5);
    const lintels = procedural.filter((box) => box.min.z <= -28.85 && box.max.z >= -29.15 && box.min.y >= 4.9 && box.max.y >= 7);
    expect(lintels.length).toBeGreaterThanOrEqual(2);
    // declared door volumes (already proven collider-free above) sit inside the legacy openings and stay ≥ 2 m wide
    const find = (name: string) => {
      const volume = contract.clearance.find((entry) => entry.name === name);
      if (!volume) throw new Error(`clearance volume ${name} missing`);
      return volume;
    };
    const doorPersonnel = find("door-personnel");
    const doorRoller = find("door-roller");
    const doorSide = find("door-side");
    expect(doorPersonnel.min[0]).toBeGreaterThanOrEqual(personnel[0]);
    expect(doorPersonnel.max[0]).toBeLessThanOrEqual(personnel[1]);
    expect(doorPersonnel.max[0] - doorPersonnel.min[0]).toBeGreaterThanOrEqual(2.0);
    expect(doorRoller.min[0]).toBeGreaterThanOrEqual(roller[0]);
    expect(doorRoller.max[0]).toBeLessThanOrEqual(roller[1]);
    expect(doorRoller.max[0] - doorRoller.min[0]).toBeGreaterThanOrEqual(2.8);
    expect(doorSide.min[2]).toBeGreaterThanOrEqual(sideDoorZ[0]);
    expect(doorSide.max[2]).toBeLessThanOrEqual(sideDoorZ[1]);
    expect(doorSide.max[2] - doorSide.min[2]).toBeGreaterThanOrEqual(1.7);
    for (const door of [doorPersonnel, doorRoller]) {
      // each front door volume spans the wall plane (z -29.15..-28.85) and reaches the hall + the apron walk
      expect(door.min[2]).toBeLessThanOrEqual(-29.8);
      expect(door.max[2]).toBeGreaterThanOrEqual(-27.6);
    }
    // the interior loop: office corridor -> partition door -> workshop middle -> hall link -> hall -> office front
    const loop = ["office-front", "office-floor", "partition-door", "workshop-middle", "hall-link-a", "hall-link-b", "hall"];
    const volumes = loop.map((name) => find(name));
    expect(toBox3(doorPersonnel).intersectsBox(toBox3(find("hall")))).toBe(true);
    expect(toBox3(doorRoller).intersectsBox(toBox3(find("hall")))).toBe(true);
    expect(toBox3(doorRoller).intersectsBox(toBox3(find("workshop-route")))).toBe(true);
    expect(toBox3(doorSide).intersectsBox(toBox3(find("office-floor")))).toBe(true);
    expect(toBox3(doorSide).intersectsBox(toBox3(find("cross-west")))).toBe(true);
    expect(toBox3(doorPersonnel).intersectsBox(toBox3(find("apron-walk-w")))).toBe(true);
    expect(toBox3(doorRoller).intersectsBox(toBox3(find("apron-walk-e")))).toBe(true);
    for (let i = 0; i < volumes.length; i++) {
      const a = toBox3(volumes[i]);
      const b = toBox3(volumes[(i + 1) % volumes.length]);
      expect(a.intersectsBox(b), `${volumes[i].name} must connect to ${volumes[(i + 1) % volumes.length].name}`).toBe(true);
    }
    for (const volume of volumes) {
      const width = Math.min(volume.max[0] - volume.min[0], volume.max[2] - volume.min[2]);
      expect(width, `${volume.name} width`).toBeGreaterThanOrEqual(0.85 - 1e-6);
    }
  });

  it("leaves the seawall kill zone, water hazards and the seawall collider untouched", () => {
    const client = JSON.parse(readFileSync(path.resolve(__dirname, "../src/game/world/harbor-warehouse.json"), "utf8")) as WaterHazardMap;
    const server = JSON.parse(readFileSync(SERVER_MAP_PATH, "utf8")) as WaterHazardMap;
    const north = client.waterHazards.find((hazard) => hazard.id === "ocean-north");
    expect(north).toEqual({ id: "ocean-north", min: { x: -72, y: -5, z: -60 }, max: { x: 80, y: -0.9, z: contract.gameplay.waterHazardZ } });
    expect(server.waterHazards).toEqual(client.waterHazards);
    const seawall = toBox3(contract.gameplay.seawallCollider);
    const match = procedural.find((box) => box.min.distanceTo(seawall.min) < 1e-6 && box.max.distanceTo(seawall.max) < 1e-6);
    expect(match, "north seawall collider").toBeDefined();
  });

  it("ships colliders only for large solids, outside every route and off the seawall cap", () => {
    if (!existsSync(METRICS_PATH)) return;   // present after `npm run harbor:v2:preflight-operations-ab`
    const metrics = JSON.parse(readFileSync(METRICS_PATH, "utf8")) as Metrics;
    expect(metrics.passed).toBe(true);
    expect(metrics.lod0.estimatedDrawCalls).toBeLessThanOrEqual(contract.budgets.lod0DrawCalls);
    expect(metrics.lod0.triangles).toBeLessThanOrEqual(contract.budgets.lod0Triangles);
    expect(metrics.lod1.estimatedDrawCalls).toBeLessThanOrEqual(contract.budgets.lod1DrawCalls);
    expect(metrics.lod1.triangles).toBeLessThanOrEqual(contract.budgets.lod1Triangles);
    expect(metrics.payloadBytes).toBeLessThanOrEqual(contract.budgets.payloadBytes);
    expect(metrics.estimatedGpuTextureBytes).toBeLessThanOrEqual(contract.budgets.gpuTextureBytes);
    expect(metrics.zoneColliders.length).toBeLessThanOrEqual(contract.budgets.zoneColliders);
    const seawall = toBox3(contract.gameplay.seawallCollider);
    const footprint = toBox3(contract.footprint);
    for (const collider of metrics.zoneColliders) {
      const box = new THREE.Box3(new THREE.Vector3(...collider.min), new THREE.Vector3(...collider.max));
      expect(collider.name.startsWith("COL_MOVE_OPERATIONS_AB_") || collider.name.startsWith("COL_LADDER_OPERATIONS_AB_"), collider.name).toBe(true);
      expect(footprint.containsBox(box), `${collider.name} inside the footprint`).toBe(true);
      // colliders never sit inside the 0.9 m seawall cap (the kill-zone edge stays the legacy one)
      expect(overlapVolume(box, seawall), `${collider.name} overlaps the seawall collider`).toBeLessThanOrEqual(0.002);
      for (const volume of contract.clearance) {
        expect(overlapVolume(box, toBox3(volume)), `${collider.name} intrudes ${volume.name}`).toBe(0);
      }
      for (const legacy of procedural) {
        expect(overlapVolume(box, legacy), `${collider.name} duplicates a procedural collider`).toBeLessThanOrEqual(0.002);
      }
    }
    // the two rotors are the only instanced meshes (spin animation targets)
    expect(metrics.lod0.instancedMeshes).toBe(2);
  });
});
