import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { describe, expect, it } from "vitest";
import { prepareMapAsset } from "../src/game/world/assets/MapAssetLoader";

async function load(zone: string, quality: "high" | "low") {
  const bytes = readFileSync(path.resolve(__dirname, process.env.HARBOR_STRUCTURAL_STAGING
    ? `../../art-source/harbor-v2/_staging/structural-rp03/${zone}-runtime.glb` : `../public/assets/maps/harbor-v2/zones/${zone}.glb`));
  const n = bytes.readUInt32LE(12); const json = JSON.parse(bytes.subarray(20, 20 + n).toString()) as { images: unknown[]; textures: unknown[]; materials: { doubleSided?: boolean }[] };
  json.images = []; json.textures = []; json.materials = json.materials.map(() => ({ doubleSided: true }));
  const encoded = Buffer.from(JSON.stringify(json)); const padded = Math.ceil(encoded.length / 4) * 4;
  const binary = bytes.subarray(20 + n); const output = Buffer.alloc(20 + padded + binary.length, 0x20);
  bytes.copy(output, 0, 0, 12); output.writeUInt32LE(output.length, 8); output.writeUInt32LE(padded, 12); output.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(output, 20); binary.copy(output, 20 + padded);
  const root = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(output.buffer, "")).scene;
  const asset = prepareMapAsset(root, quality); root.updateMatrixWorld(true); return asset;
}
function hits(root: THREE.Object3D, origin: number[], direction: number[], far: number) {
  return new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far).intersectObject(root, true);
}

describe("shipped native structural route parity", () => {
  it.each(["high", "low"] as const)("keeps all three Operations entries visibly open on %s", async quality => {
    const { root } = await load("operations-ab", quality);
    for (const y of [.45, .92, 1.8]) {
      const personnel = hits(root, [-3.2, y, -28], [0, 0, -1], 2.5);
      expect(personnel, `personnel y=${y}: ${JSON.stringify(personnel.map(h => ({ name: h.object.name, at: h.point.toArray() })))}`).toHaveLength(0);
      const roller = hits(root, [3.5, y, -28], [0, 0, -1], 2.5);
      expect(roller, `roller y=${y}: ${JSON.stringify(roller.map(h => ({ name: h.object.name, at: h.point.toArray() })))}`).toHaveLength(0);
      const side = hits(root, [-10.5, y, -36], [1, 0, 0], 2.2);
      expect(side, `side y=${y}: ${JSON.stringify(side.map(h => ({name: h.object.name, at: h.point.toArray()})))}`).toHaveLength(0);
    }
  });
  it.each(["high", "low"] as const)("keeps garden house windows, loggia and chimney physically open on %s", async quality => {
    const { root } = await load("garden-ac", quality);
    for (const y of [2.2, 7.2]) {
      expect(hits(root, [-41, y, 22], [1, 0, 0], 1.4), `left ${y}`).toHaveLength(0);
      expect(hits(root, [-29, y, 22], [-1, 0, 0], 1.4), `right ${y}`).toHaveLength(0);
    }
    expect(hits(root, [-35, 7, 27], [0, 0, -1], 1.4), "loggia").toHaveLength(0);
    expect(hits(root, [-31.5, 13.4, 19], [0, -1, 0], 12.5), "flue").toHaveLength(0);
    expect(hits(root, [-31.5, 1.7, 19.4], [0, 0, 1], 1.2), "hearth").toHaveLength(0);
    expect(hits(root, [-35, 1.8, 27], [0, 0, -1], 1.6), "front entry").toHaveLength(0);
  });
  it.each(["high", "low"] as const)("draws the actual garden 2F support surface on %s", async quality => {
    const { root } = await load("garden-ac", quality);
    expect(hits(root, [-35, 6, 23], [0, -1, 0], 1)[0]?.point.y).toBeCloseTo(5.55, 3);
  });
  it.each(["high", "low"] as const)("exports matching movement collision for both construction concrete pours on %s", async quality => {
    const { root, colliders } = await load("construction-ad", quality);
    for (const top of [3.5, 6.7]) {
      const hit = hits(root, [-31.6, top + .5, -18.5], [0, -1, 0], 1)[0];
      expect(hit.point.y).toBeCloseTo(top, 3);
      const support = colliders.find(box => box.containsPoint(new THREE.Vector3(-31.6, top - .1, -18.5)));
      expect(support).toBeDefined(); expect(support?.max.y).toBeCloseTo(top, 3);
      expect(support?.min.x).toBeCloseTo(-33, 3); expect(support?.max.x).toBeCloseTo(-30.2, 3);
      expect(support?.min.z).toBeCloseTo(-21.8, 3); expect(support?.max.z).toBeCloseTo(top < 4 ? -15.8 : -15.2, 3);
    }
    expect(colliders.find(box => box.containsPoint(new THREE.Vector3(-32, 3.4, -15.5)))).toBeDefined();
  });
});
