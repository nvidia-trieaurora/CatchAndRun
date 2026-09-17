import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { describe, expect, it } from "vitest";
import { prepareMapAsset } from "../src/game/world/assets/MapAssetLoader";

interface MaterialJSON { name?: string; alphaMode?: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }

async function load(quality: "high" | "low") {
  const source = process.env.HARBOR_MARKET_ASSET ?? path.resolve(__dirname, "../public/assets/maps/harbor-v2/zones/container-bd.glb");
  const bytes = readFileSync(source);
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString()) as {
    materials: (MaterialJSON & { doubleSided?: boolean })[]; images: unknown[]; textures: unknown[];
  };
  json.materials = json.materials.map((material) => ({
    name: material.name, doubleSided: true, alphaMode: material.alphaMode,
    pbrMetallicRoughness: { baseColorFactor: material.pbrMetallicRoughness?.baseColorFactor },
  }));
  json.images = []; json.textures = [];
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Math.ceil(encoded.length / 4) * 4;
  const binary = bytes.subarray(20 + length);
  const output = Buffer.alloc(20 + padded + binary.length, 0x20);
  bytes.copy(output, 0, 0, 12); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded, 12); output.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(output, 20); binary.copy(output, 20 + padded);
  const root = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(output.buffer, "")).scene;
  root.updateMatrixWorld(true);
  const colliders = new Map<string, THREE.Box3>();
  root.traverse((object) => {
    if (object.name.startsWith("COL_MOVE_CONTAINER_BD_MARKET_")) colliders.set(object.name, new THREE.Box3().setFromObject(object));
  });
  prepareMapAsset(root, quality); root.updateMatrixWorld(true);
  return { root, colliders };
}

function ray(root: THREE.Object3D, origin: number[], direction: number[], far: number) {
  return new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far).intersectObject(root, true);
}

describe("native Harbor Market route parity", () => {
  it.each(["high", "low"] as const)("keeps doors and roof hatch genuinely open on %s", async (quality) => {
    const { root } = await load(quality);
    expect(ray(root, [45, 1.7, -31], [0, 0, -1], 3.5), "front entrance must not contain glass or a solid Low plinth").toHaveLength(0);
    expect(ray(root, [40.15, 1.6, -40.2], [0, 0, -1], 1.1), "stockroom entry must not be a solid Low room box").toHaveLength(0);
    expect(ray(root, [42.35, 1.6, -40.2], [0, 0, -1], 1.1), "office entry must be open").toHaveLength(0);
    expect(ray(root, [38.85, 7, -41.3], [0, -1, 0], 3), "ladder hatch must stay open through roof and ceiling").toHaveLength(0);
    const roof = ray(root, [45, 7, -39], [0, -1, 0], 2)[0];
    expect(roof).toBeDefined();
    expect(roof.point.y).toBeCloseTo(5.8, 2);
    expect(ray(root, [41, 1.7, -31], [0, 0, -1], 3)[0]?.point.z).toBeGreaterThan(-33.15);
    expect(ray(root, [37, 1.8, -38], [1, 0, 0], 2)[0]?.point.x).toBeCloseTo(37.88, 1);
  });

  it.each(["high", "low"] as const)("uses clear transom glazing without an opaque steel sheet behind it on %s", async (quality) => {
    const { root } = await load(quality);
    const hits = ray(root, [45, 3.6, -31.8], [0, 0, -1], 1.6);
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      const material = (hit.object as THREE.Mesh).material;
      for (const m of Array.isArray(material) ? material : [material]) {
        expect(m.transparent).toBe(true);
        expect(m.opacity).toBeLessThanOrEqual(.2);
      }
    }
  });

  it("ships collision matching the previously pass-through operator header and suspended ceiling", async () => {
    const { root, colliders } = await load("high");
    const header = colliders.get("COL_MOVE_CONTAINER_BD_MARKET_OPERATOR_HEADER");
    expect(header).toBeDefined();
    expect(header?.min.y).toBeCloseTo(2.9, 3);
    expect(ray(root, [45, 3.05, -31.8], [0, 0, -1], 2)[0]?.point.z).toBeGreaterThan(-33.3);
    const ceiling = [...colliders.entries()].filter(([name]) => name.includes("CEILING"));
    expect(ceiling.length).toBeGreaterThanOrEqual(3);
    const hatch = new THREE.Box3(new THREE.Vector3(38.22, 4.15, -41.88), new THREE.Vector3(39.28, 5.9, -40.72));
    for (const [, bounds] of ceiling) {
      expect(bounds.min.y).toBeCloseTo(4.2, 3);
      expect(bounds.intersectsBox(hatch)).toBe(false);
    }
    const aisleCeiling = ceiling.find(([, bounds]) => bounds.containsPoint(new THREE.Vector3(44, 4.22, -37)));
    expect(aisleCeiling).toBeDefined();
  });
});
