import { readFileSync } from "node:fs";
import path from "node:path";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { prepareMapAsset } from "../../src/game/world/assets/MapAssetLoader";
import { BoatCollisionRig } from "../../src/game/world/zones/BoatCollisionRig";
import { HarborAmbientMotion } from "../../src/game/world/environment/HarborAmbientMotion";
import { createHarborWater } from "../../src/game/world/environment/harborWater";

/** Keep shipped geometry/extras/LOD/transforms; skip only image decoding. */
export async function actualHarborFleet(quality: "high" | "low") {
  const bytes = readFileSync(path.resolve(__dirname, "../../public/assets/maps/harbor-v2/zones/ferris-harbor.glb"));
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()) as { materials: unknown[]; images: unknown[]; textures: unknown[] };
  json.materials = json.materials.map(() => ({})); json.images = []; json.textures = [];
  const encoded = Buffer.from(JSON.stringify(json)), padded = Math.ceil(encoded.length / 4) * 4;
  const bin = bytes.subarray(20 + jsonLength), output = Buffer.alloc(20 + padded + bin.length, 0x20);
  bytes.copy(output, 0, 0, 12); output.writeUInt32LE(output.length, 8); output.writeUInt32LE(padded, 12); output.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(output, 20); bin.copy(output, 20 + padded);
  const root = (await new GLTFLoader().parseAsync(output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength), "")).scene;
  const asset = prepareMapAsset(root, quality);
  const boats = new BoatCollisionRig([root]);
  return { root, asset, boats, motion: new HarborAmbientMotion([root], false), water: createHarborWater(quality) };
}
