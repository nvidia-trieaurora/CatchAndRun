#!/usr/bin/env node

import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const rootDir = process.cwd();
const assetPath = path.join(
  rootDir,
  "client/public/assets/maps/harbor-v2/cinematic/harbor-cinematic.glb",
);
const metricsPath = path.join(
  rootDir,
  "docs/v2/harbor/harbor-cinematic-metrics.json",
);
const requiredZones = [
  "base",
  "construction",
  "container-yard",
  "dock",
  "dock-detail",
  "boats",
  "garden-detail",
  "construction-detail",
  "restored-landmarks",
  "ferris-static",
  "hunter-spawn",
  "residential",
  "shared-props",
];

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const document = await io.read(assetPath);
const gltfRoot = document.getRoot();
const nodes = gltfRoot.listNodes();
const extensions = gltfRoot.listExtensionsUsed().map((extension) => extension.extensionName);
const errors = [];

function collectMeshes(meshes) {
  const triangles = meshes.reduce((total, node) => {
    const mesh = node.getMesh();
    if (!mesh) return total;
    return total + mesh.listPrimitives().reduce((meshTotal, primitive) => {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute("POSITION");
      const count = indices?.getCount() ?? position?.getCount() ?? 0;
      return meshTotal + Math.floor(count / 3);
    }, 0);
  }, 0);
  return {
    triangles,
    renderMeshes: meshes.length,
    drawCalls: meshes.length,
  };
}

function collectLod(suffix) {
  return collectMeshes(nodes.filter((node) => node.getName().endsWith(suffix)));
}

const lod0 = collectLod("_LOD0");
const lod1 = collectLod("_LOD1");
const commonNodes = nodes.filter((node) => {
  const name = node.getName();
  return (
    node.getMesh() !== null
    && !name.endsWith("_LOD0")
    && !name.endsWith("_LOD1")
    && !name.startsWith("COL_")
    && !name.startsWith("MARKER_")
  );
});
const common = collectMeshes(commonNodes);
const commonUninstanced = collectMeshes(commonNodes.filter((node) =>
  typeof node.getExtras().instanceKey !== "string"
));
const collisionNodes = nodes.filter((node) =>
  node.getName().startsWith("COL_MOVE_")
);
const instanceKeys = new Set(
  nodes
    .map((node) => node.getExtras().instanceKey)
    .filter((key) => typeof key === "string"),
);
const zones = new Set(
  nodes
    .map((node) => node.getExtras().harborZone)
    .filter((zone) => typeof zone === "string"),
);
const boatMotionGroups = new Set(
  nodes
    .map((node) => node.getExtras().ambientMotion)
    .filter((key) => typeof key === "string" && key.startsWith("boat-")),
);
const hunterGate = nodes.find((node) =>
  node.getName() === "MESH_HUNTER_GATE"
);
const payloadBytes = (await stat(assetPath)).size;

for (const zone of requiredZones) {
  if (!zones.has(zone) && !nodes.some((node) => node.getName().toLowerCase().includes(zone))) {
    errors.push(`missing render zone: ${zone}`);
  }
}
if (!extensions.includes("EXT_meshopt_compression")) {
  errors.push("optimized asset is missing EXT_meshopt_compression");
}
if (!extensions.includes("EXT_texture_webp")) {
  errors.push("optimized asset is missing EXT_texture_webp");
}
if (instanceKeys.size < 6) {
  errors.push(`expected at least 6 runtime instance groups, found ${instanceKeys.size}`);
}
if (collisionNodes.length < 25) {
  errors.push(`expected cinematic shell colliders, found ${collisionNodes.length}`);
}
if (boatMotionGroups.size < 4) {
  errors.push(`expected four authored boat groups, found ${boatMotionGroups.size}`);
}
if (!hunterGate || hunterGate.getExtras().gameplayRole !== "hunterGate") {
  errors.push("missing independently animated east-side Hunter gate");
}
if (payloadBytes > 12 * 1024 * 1024) {
  errors.push(`payload exceeds 12 MB mobile environment cap: ${payloadBytes}`);
}
if (
  lod0.triangles + common.triangles > 400_000
  || lod1.triangles + common.triangles > 180_000
) {
  errors.push("triangle budget exceeded");
}
if (lod0.drawCalls + commonUninstanced.drawCalls + instanceKeys.size > 250) {
  errors.push("desktop draw-call budget exceeded");
}
if (lod1.drawCalls + commonUninstanced.drawCalls + instanceKeys.size > 120) {
  errors.push("mobile draw-call budget exceeded");
}

const metrics = {
  asset: path.relative(rootDir, assetPath),
  payloadBytes,
  lod0,
  lod1,
  common,
  estimatedRuntimeCommonDrawCalls:
    commonUninstanced.drawCalls + instanceKeys.size,
  cinematicColliders: collisionNodes.length,
  boatMotionGroups: [...boatMotionGroups].sort(),
  runtimeInstanceGroups: [...instanceKeys].sort(),
  extensions,
  requiredZones,
  passed: errors.length === 0,
  errors,
};
await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);

if (errors.length > 0) {
  console.error("Optimized Harbor validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Optimized Harbor validation passed");
  console.log(JSON.stringify(metrics, null, 2));
}
