import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { describe, expect, it } from "vitest";
import { prepareMapAsset } from "../src/game/world/assets/MapAssetLoader";
import { HunterController } from "../src/game/controllers/HunterController";
import type { InputManager, InputState } from "../src/input/InputManager";
import type { ClientConfig } from "../src/config/ClientConfig";
import { HARBOR_ZONE_ASSETS } from "../src/game/world/zones/harborZones";

async function readGeometry(relative: string) {
  const bytes = readFileSync(path.resolve(__dirname, "../public/assets/maps/harbor-v2", relative));
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString()) as { materials?: unknown[]; images: unknown[]; textures: unknown[] };
  json.materials = (json.materials ?? []).map(() => ({}));
  json.images = []; json.textures = [];
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Math.ceil(encoded.length / 4) * 4;
  const bin = bytes.subarray(20 + length);
  const output = Buffer.alloc(20 + padded + bin.length, 0x20);
  bytes.copy(output, 0, 0, 12);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(output, 20); bin.copy(output, 20 + padded);
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(output.buffer, "")).scene;
}

async function loadBooth(quality: "high" | "low") {
  const root = await readGeometry("zones/ferris-harbor.glb");
  root.updateMatrixWorld(true);
  const booth = new Map<string, THREE.Box3>();
  root.traverse((object) => {
    if (object.name.startsWith("COL_MOVE_FERRIS_HARBOR_TICKET_")) {
      booth.set(object.name.replace("COL_MOVE_FERRIS_HARBOR_TICKET_", ""), new THREE.Box3().setFromObject(object));
    }
  });
  const prepared = prepareMapAsset(root, quality);
  root.updateMatrixWorld(true);
  return { root, booth, colliders: prepared.colliders };
}

describe("shipped Ferris ticket booth", () => {
  it("removes only the retired Low greenhouse that occluded the ticket office", async () => {
    const greenhouse = new THREE.Box3(new THREE.Vector3(-28.3, -.05, 35.4), new THREE.Vector3(-21.7, 3.3, 40.6));
    const overrides = HARBOR_ZONE_ASSETS.map((zone) => zone.override);
    const before = await readGeometry("cinematic/harbor-cinematic.glb");
    const after = await readGeometry("cinematic/harbor-cinematic.glb");
    prepareMapAsset(before, "low", {
      zoneOverrides: HARBOR_ZONE_ASSETS.map((zone) => zone.id === "garden-ac" ? { ...zone.override, carveNames: [] } : zone.override),
    });
    prepareMapAsset(after, "low", { zoneOverrides: overrides });
    before.updateMatrixWorld(true); after.updateMatrixWorld(true);
    const oldMesh = before.getObjectByName("harbor_MESH_steel_galvanized_LOD1") as THREE.Mesh;
    const newMesh = after.getObjectByName("harbor_MESH_steel_galvanized_LOD1") as THREE.Mesh;
    expect(oldMesh).toBeDefined(); expect(newMesh).toBeDefined();
    for (const mesh of [oldMesh, newMesh]) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.side = THREE.DoubleSide;
    }
    const ray = new THREE.Raycaster(new THREE.Vector3(-24, 3, 38), new THREE.Vector3(5.5, -1.2, -6.8).normalize(), 0, 6);
    expect(ray.intersectObject(oldMesh)[0]?.distance).toBeCloseTo(3.235, 2);
    expect(ray.intersectObject(newMesh)).toHaveLength(0);
    const outsideTriangles = (mesh: THREE.Mesh) => {
      const position = mesh.geometry.getAttribute("position");
      const index = mesh.geometry.index;
      const kept: string[] = [];
      for (let i = 0; i < (index?.count ?? position.count); i += 3) {
        const vertices = [0, 1, 2].map((offset) => new THREE.Vector3()
          .fromBufferAttribute(position, index ? index.getX(i + offset) : i + offset).applyMatrix4(mesh.matrixWorld));
        const centroid = vertices.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3()).multiplyScalar(1 / 3);
        if (!greenhouse.containsPoint(centroid)) kept.push(vertices.flatMap((vertex) => vertex.toArray().map((value) => value.toFixed(4))).join(","));
      }
      return kept.sort();
    };
    const retained = outsideTriangles(newMesh);
    expect(retained.length).toBeGreaterThan(100);
    expect(retained).toEqual(outsideTriangles(oldMesh));
  });

  it("removes the old cinematic wall that would invisibly seal the new side entrance", async () => {
    const root = await readGeometry("cinematic/harbor-cinematic.glb");
    const legacy = root.getObjectByName("COL_MOVE_CINE_TICKET_LEFT");
    expect(legacy).toBeDefined();
    if (!legacy) throw new Error("Legacy booth collider fixture is missing");
    root.updateMatrixWorld(true);
    const doorway = new THREE.Box3(new THREE.Vector3(-20.9, .25, 30.5), new THREE.Vector3(-20.5, 2.1, 31.1));
    expect(new THREE.Box3().setFromObject(legacy).intersectsBox(doorway)).toBe(true);
    const zone = HARBOR_ZONE_ASSETS.find((item) => item.id === "ferris-harbor");
    expect(zone).toBeDefined();
    if (!zone) throw new Error("Ferris zone is missing");
    const prepared = prepareMapAsset(root, "high", { zoneOverrides: [zone.override] });
    expect(prepared.colliders.some((box) => box.intersectsBox(doorway))).toBe(false);
  });

  it.each(["high", "low"] as const)("keeps physical walls/window/roof visible and the side entrance open on %s", async (quality) => {
    const { root, booth } = await loadBooth(quality);
    for (const name of ["BACK", "EAST", "WEST_BACK", "WEST_FRONT", "WEST_HEADER", "FLOOR", "ROOF", "FRONT_GLASS", "COUNTER"]) {
      expect(booth.has(name), `Missing ${name} collider`).toBe(true);
    }
    const probes = [
      { p: [-19, 5, 31], d: [0, -1, 0], expected: 3.4 },
      { p: [-19, 1.8, 34], d: [0, 0, -1], expected: 32.83 },
      { p: [-22, 1.5, 32], d: [1, 0, 0], expected: -20.9 },
      { p: [-19, 1.5, 28.5], d: [0, 0, 1], expected: 29.5 },
    ];
    for (const { p, d, expected } of probes) {
      const ray = new THREE.Raycaster(new THREE.Vector3(...p), new THREE.Vector3(...d), 0, 3);
      const hit = ray.intersectObject(root, true)[0];
      expect(hit, `Invisible collider near ${p.join(",")}`).toBeDefined();
      const axis = d.findIndex((value) => value !== 0);
      expect(hit.point.getComponent(axis)).toBeCloseTo(expected, 1);
    }
    const doorway = new THREE.Box3(new THREE.Vector3(-21.3, 0.25, 30.5), new THREE.Vector3(-20.4, 2.1, 31.1));
    expect([...booth.values()].some((box) => box.intersectsBox(doorway))).toBe(false);
    const ray = new THREE.Raycaster(new THREE.Vector3(-21.5, 1.5, 30.8), new THREE.Vector3(1, 0, 0), 0, 1.1);
    expect(ray.intersectObject(root, true)).toHaveLength(0);
  });

  it("blocks a Hunter at the glazed counter, admits the side door, and supports landing on the roof", async () => {
    const { colliders } = await loadBooth("high");
    const state = { forward: true } as InputState;
    const input = { isPointerLocked: () => true, consumeMouseDelta: () => ({ x: 0, y: 0 }), getState: () => state } as unknown as InputManager;
    const config = { get: () => ({ sensitivity: 0.002 }) } as ClientConfig;
    const camera = new THREE.PerspectiveCamera();
    const hunter = new HunterController(camera, input, config);
    hunter.setPosition(-19, 0.2, 34.5);
    for (let i = 0; i < 90; i++) hunter.update(1 / 60, colliders);
    expect(hunter.getPosition().z).toBeGreaterThan(32.9);
    hunter.setPosition(-22, .05, 30.8);
    hunter.setRotation(0, -Math.PI / 2);
    for (let i = 0; i < 20; i++) hunter.update(1 / 60, colliders);
    expect(hunter.getPosition().x).toBeGreaterThan(-20.4);
    expect(hunter.getPosition().x).toBeLessThan(-17.8);
    state.forward = false;
    hunter.setPosition(-19, 5, 31);
    for (let i = 0; i < 120; i++) hunter.update(1 / 60, colliders);
    expect(hunter.getPosition().y - 1.6).toBeCloseTo(3.4, 2);
    hunter.setPosition(-19, 0.2, 31);
    state.jump = true;
    let maximumHead = 0;
    for (let i = 0; i < 60; i++) {
      hunter.update(1 / 60, colliders);
      maximumHead = Math.max(maximumHead, hunter.getPosition().y + 0.2);
      state.jump = false;
    }
    expect(maximumHead).toBeLessThanOrEqual(3.201);
  });
});
