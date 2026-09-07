#!/usr/bin/env node

import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const assetDir = path.join(
  root,
  "client/public/assets/maps/harbor-v2/cinematic",
);
const input = path.join(assetDir, "harbor-cinematic.glb");
const webpOutput = path.join(assetDir, "harbor-cinematic.webp.glb");
const meshoptOutput = path.join(assetDir, "harbor-cinematic.optimized.glb");
const manifestPath = path.join(assetDir, "harbor-cinematic.manifest.json");
const executable = path.join(root, "node_modules/.bin/gltf-transform");

function run(args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`gltf-transform ${args[0]} failed`);
  }
}

try {
  run(["webp", input, webpOutput, "--quality", "86", "--effort", "70"]);
  run(["meshopt", webpOutput, meshoptOutput, "--level", "high"]);
  await rename(meshoptOutput, input);
  await rm(webpOutput, { force: true });

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const { size } = await import("node:fs/promises").then(({ stat }) => stat(input));
  manifest.metrics.payloadBytes = size;
  manifest.compression = {
    geometry: "EXT_meshopt_compression",
    textures: "WebP quality 86",
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Optimized Harbor cinematic asset: ${size} bytes`);
} catch (error) {
  await rm(webpOutput, { force: true });
  await rm(meshoptOutput, { force: true });
  throw error;
}
