import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { prepareMapAsset } from "../src/game/world/assets/MapAssetLoader";
import {
  CONTAINER_BD_REMOVED_COLLIDERS,
  HARBOR_ZONE_ASSETS,
  activeHarborZoneAssets,
} from "../src/game/world/zones/harborZones";

const zone = HARBOR_ZONE_ASSETS.find((asset) => asset.id === "container-bd");
if (!zone) throw new Error("container-bd zone asset missing");

const CONTRACT_PATH = path.resolve(__dirname, "../../tools/harbor-v2/zones/contracts/container_bd.json");
const METRICS_PATH = path.resolve(__dirname, "../public/assets/maps/harbor-v2/zones/container-bd.metrics.json");

interface Box { min: [number, number, number]; max: [number, number, number] }
interface Contract {
  removesCinematicColliders: string[];
  footprint: Box;
  gameplay: {
    miniMart: { door: { x: [number, number]; z: number; clearHeight: number } };
    propSpawns: [number, number][];
    mainLaneX: [number, number];
  };
  clearance: ({ name: string } & Box)[];
  budgets: {
    lod0Triangles: number; lod0DrawCalls: number; lod1Triangles: number; lod1DrawCalls: number;
    payloadBytes: number; gpuTextureBytes: number;
  };
}
interface Metrics {
  passed: boolean;
  zoneColliders: { name: string; min: [number, number, number]; max: [number, number, number] }[];
  lod0: { triangles: number; estimatedDrawCalls: number };
  lod1: { triangles: number; estimatedDrawCalls: number };
  payloadBytes: number;
  estimatedGpuTextureBytes: number;
}

function legacyCollider(name: string, min: THREE.Vector3, max: THREE.Vector3): THREE.Mesh {
  const size = max.clone().sub(min);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshStandardMaterial());
  mesh.name = name;
  mesh.userData.harborZone = "cinematic-collision";
  mesh.position.copy(min).add(size.multiplyScalar(0.5));
  return mesh;
}

describe("BD Eastern Container Yard zone", () => {
  it("is registered as a promoted zone (cache token) that replaces the legacy yard", () => {
    // promoted 2026-09-08 on request; the ?v token busts cached copies of the GLB
    expect(zone.promoted).toBe(true);
    expect(zone.url).toMatch(/^\/assets\/maps\/harbor-v2\/zones\/container-bd\.glb\?v=/);
    expect(activeHarborZoneAssets("production").includes(zone)).toBe(true);
    expect(activeHarborZoneAssets("staging").includes(zone)).toBe(true);
    expect(zone.stagingUrl).toBe("/staging-assets/market-rp04/container-bd-runtime.glb");
    expect(zone.override.removeZones).toEqual(["container-yard"]);
    expect(CONTAINER_BD_REMOVED_COLLIDERS).toHaveLength(23);
    expect(zone.override.removeNames).toEqual([...CONTAINER_BD_REMOVED_COLLIDERS]);
    const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8")) as Contract;
    expect(contract.removesCinematicColliders).toEqual([...CONTAINER_BD_REMOVED_COLLIDERS]);
  });

  it("drops re-authored cinematic yard/Market colliders and keeps the office and seawall", () => {
    const root = new THREE.Group();
    const container = legacyCollider("COL_MOVE_CINE_CONTAINER_12", new THREE.Vector3(46.9, 0, -29.2), new THREE.Vector3(53.1, 2.5, -26.8));
    const forklift = legacyCollider("COL_MOVE_CINE_FORKLIFT", new THREE.Vector3(48.1, 0, -5.75), new THREE.Vector3(49.9, 2.2, -4.25));
    const martHeader = legacyCollider("COL_MOVE_CINE_MART_FRONT_HEADER", new THREE.Vector3(44, 2.8, -33.15), new THREE.Vector3(46, 5.2, -32.85));
    const office = legacyCollider("COL_MOVE_CINE_YARD_OFFICE", new THREE.Vector3(51.5, 0, -4.5), new THREE.Vector3(58.5, 3.2, 0.5));
    // legacy yard visuals + clutter inside the carve box, and the same clutter family outside it
    const oldContainer = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 2.4), new THREE.MeshStandardMaterial());
    oldContainer.name = "container-yard_MESH_container_red_LOD0";
    oldContainer.userData.harborZone = "container-yard";
    oldContainer.position.set(40, 1.25, -8);
    const yardCone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7), new THREE.MeshStandardMaterial());
    yardCone.name = "MESH_TRAFFIC_CONE_6";
    yardCone.userData.harborZone = "shared-props";
    yardCone.position.set(42, 0.35, -18);
    const roadCone = yardCone.clone();
    roadCone.name = "MESH_TRAFFIC_CONE_7";
    roadCone.position.set(20, 0.35, -16);
    root.add(container, forklift, martHeader, office, oldContainer, yardCone, roadCone);

    const asset = prepareMapAsset(root, "high", { zoneOverrides: [zone.override] });

    const kept = asset.colliders.map((box) => `${box.min.x.toFixed(1)},${box.max.y.toFixed(1)}`).sort();
    // Old Market header belongs to its obsolete 2m entrance. The real Market
    // regression checks the procedural shell + native3m operator/header instead.
    expect(kept).toEqual(["51.5,3.2"]);
    expect(oldContainer.parent).toBeNull();
    expect(yardCone.parent).toBeNull();
    expect(roadCone.parent).toBe(root);
  });

  it("carves a shared merged batch for every zone that names it", () => {
    const ferris = HARBOR_ZONE_ASSETS.find((asset) => asset.id === "ferris-harbor");
    if (!ferris) throw new Error("ferris-harbor zone asset missing");
    // one map-wide roof LOD1 batch: a cube over the Mini Mart, one over the old ticket booth, one far away
    const parts = [
      new THREE.BoxGeometry(1, 1, 1).toNonIndexed().translate(45, 6, -38),   // BD mart box
      new THREE.BoxGeometry(1, 1, 1).toNonIndexed().translate(-18, 3, 31),   // Ferris roof carve box
      new THREE.BoxGeometry(1, 1, 1).toNonIndexed().translate(0, 6, 0),      // warehouse, untouched
    ];
    const total = parts.reduce((n, g) => n + g.getAttribute("position").array.length, 0);
    const positions = new Float32Array(total);
    let offset = 0;
    for (const part of parts) {
      positions.set(part.getAttribute("position").array as Float32Array, offset);
      offset += part.getAttribute("position").array.length;
    }
    const roof = new THREE.Mesh(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3)),
      new THREE.MeshStandardMaterial(),
    );
    roof.name = "harbor_MESH_roof_LOD1";
    roof.userData.harborZone = "residential";
    const root = new THREE.Group();
    root.add(roof);

    prepareMapAsset(root, "low", { zoneOverrides: [ferris.override, zone.override] });

    expect(roof.parent).toBe(root);
    // both districts carved their cube; the warehouse cube (36 vertices) survives
    expect(roof.geometry.getAttribute("position").count).toBe(36);
    expect(roof.geometry.getAttribute("position").getX(0)).toBeCloseTo(0.5, 5);
  });

  it("ships the container colliders it draws and keeps the doorway, lanes and spawns clear", () => {
    const root = new THREE.Group();
    const stackLower = new THREE.Mesh(new THREE.BoxGeometry(12.192, 2.591, 2.438), new THREE.MeshStandardMaterial());
    stackLower.name = "COL_MOVE_CONTAINER_BD_CONT_W1_L";
    stackLower.userData.harborZone = "container-bd";
    stackLower.position.set(31 + 12.192 / 2, 2.591 / 2, -18.95 + 2.438 / 2);
    root.add(stackLower);
    const asset = prepareMapAsset(root, "high");
    expect(asset.colliders).toHaveLength(1);
    expect(asset.colliders[0].min.x).toBeCloseTo(31, 5);
    expect(asset.colliders[0].max.x).toBeCloseTo(43.192, 4);
    expect(asset.colliders[0].max.y).toBeCloseTo(2.591, 5);

    // Validate the currently shipped candidate, not a stale pre-RP03 staging copy.
    if (!existsSync(METRICS_PATH)) return;
    const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8")) as Contract;
    const metrics = JSON.parse(readFileSync(METRICS_PATH, "utf8")) as Metrics;
    expect(metrics.passed).toBe(true);
    // yard + Harbor Market together (the shop alone stays under 35k / 15 draws, see HarborMarket.test.ts)
    expect(metrics.lod0.estimatedDrawCalls).toBeLessThanOrEqual(contract.budgets.lod0DrawCalls);
    expect(metrics.lod0.triangles).toBeLessThanOrEqual(contract.budgets.lod0Triangles);
    expect(metrics.lod1.estimatedDrawCalls).toBeLessThanOrEqual(contract.budgets.lod1DrawCalls);
    expect(metrics.lod1.triangles).toBeLessThanOrEqual(contract.budgets.lod1Triangles);
    expect(metrics.payloadBytes).toBeLessThanOrEqual(contract.budgets.payloadBytes);
    expect(metrics.estimatedGpuTextureBytes).toBeLessThanOrEqual(contract.budgets.gpuTextureBytes);
    const door = contract.gameplay.miniMart.door;
    expect(door.x[1] - door.x[0]).toBeGreaterThanOrEqual(1.8);
    const [laneX0, laneX1] = contract.gameplay.mainLaneX;
    for (const collider of metrics.zoneColliders) {
      const [x0, y0, z0] = collider.min;
      const [x1, y1, z1] = collider.max;
      // nothing in the 3 m x 2.8 m doorway approach (6 m forecourt in front of the shop)
      const inDoorway = x1 > door.x[0] && x0 < door.x[1] && z1 > door.z && z0 < door.z + 6.5 && y0 < door.clearHeight && y1 > 0.25;
      expect(inDoorway, `${collider.name} blocks the shop doorway`).toBe(false);
      // nothing solid inside the 6 m main lane
      const inLane = x1 > laneX0 && x0 < laneX1 && z1 > -25 && z0 < 2.5 && y1 > 0.25;
      expect(inLane, `${collider.name} intrudes the main forklift lane`).toBe(false);
      for (const [sx, sz] of contract.gameplay.propSpawns) {
        const onSpawn = x1 > sx - 0.6 && x0 < sx + 0.6 && z1 > sz - 0.6 && z0 < sz + 0.6 && y0 < 2;
        expect(onSpawn, `${collider.name} covers the prop spawn ${sx},${sz}`).toBe(false);
      }
    }
    // the door column itself is a declared clearance volume of the contract
    const doorway = contract.clearance.find((volume) => volume.name === "shop-doorway");
    expect(doorway?.min[0]).toBe(door.x[0]);
    expect(doorway?.max[0]).toBe(door.x[1]);
  });
});
