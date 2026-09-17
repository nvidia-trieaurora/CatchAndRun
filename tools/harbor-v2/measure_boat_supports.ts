/** Run with npx vite-node -c client/vite.config.ts tools/harbor-v2/measure_boat_supports.ts. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { prepareMapAsset } from "../../client/src/game/world/assets/MapAssetLoader";
import { BoatCollisionRig } from "../../client/src/game/world/zones/BoatCollisionRig";

const bytes = readFileSync("client/public/assets/maps/harbor-v2/zones/ferris-harbor.glb");
const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
json.materials = json.materials.map(() => ({})); json.images = []; json.textures = [];
const encoded = Buffer.from(JSON.stringify(json)), padded = Math.ceil(encoded.length / 4) * 4;
const bin = bytes.subarray(20 + jsonLength), output = Buffer.alloc(20 + padded + bin.length, 0x20);
bytes.copy(output, 0, 0, 12); output.writeUInt32LE(output.length, 8); output.writeUInt32LE(padded, 12); output.writeUInt32LE(0x4e4f534a, 16);
encoded.copy(output, 20); bin.copy(output, 20 + padded);
const r = (value: number) => Math.round(value * 10000) / 10000;
const result = [];
for (const quality of ["high", "low"] as const) {
  const root = (await new GLTFLoader().parseAsync(output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength), "")).scene;
  prepareMapAsset(root, quality);
  const rig = new BoatCollisionRig([root]);
  for (const boat of rig.getBoats()) {
    result.push({ quality, name: boat.name, moored: boat.moored, boxes: boat.boxes.map((box) => ({ min: box.min.toArray().map(r), max: box.max.toArray().map(r) })) });
  }
}
console.log(JSON.stringify({ sha256: createHash("sha256").update(bytes).digest("hex"), boats: result }, null, 2));
