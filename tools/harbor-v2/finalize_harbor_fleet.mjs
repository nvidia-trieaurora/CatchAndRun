/** RP03 material-only fleet export. Default validates staging; explicit --promote publishes. */
import { readFile, writeFile, stat, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { quantize } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";

const root = fileURLToPath(new URL("../../", import.meta.url));
const staging = path.join(root, "art-source/harbor-v2/_staging/fleet-rp03");
const candidate = path.join(staging, "ferris-harbor-candidate.glb");
const runtime = path.join(staging, "ferris-harbor-runtime.glb");
const production = path.join(root, "client/public/assets/maps/harbor-v2/zones/ferris-harbor.glb");
const metricsFile = path.join(staging, "ferris-harbor-runtime.metrics.json");
const parityFile = path.join(staging, "geometry-parity.json");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const canonical = value => JSON.stringify(value, (_key, item) => item && !Array.isArray(item) && typeof item === "object"
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const fingerprint = accessor => {
  if (!accessor) return null;
  const array = accessor.getArray();
  return { type: accessor.getType(), normalized: accessor.getNormalized(), component: accessor.getComponentType(),
    count: accessor.getCount(), data: hash(Buffer.from(array.buffer, array.byteOffset, array.byteLength)) };
};
const geometrySnapshot = doc => Object.fromEntries(doc.getRoot().listNodes().map(node => [node.getName(), {
  matrix: node.getMatrix(), children: node.listChildren().map(child => child.getName()).sort(), extras: node.getExtras(),
  primitives: node.getMesh()?.listPrimitives().map(primitive => ({
    mode: primitive.getMode(), material: primitive.getMaterial()?.getName(), indices: fingerprint(primitive.getIndices()),
    attributes: Object.fromEntries(primitive.listSemantics().map(name => [name, fingerprint(primitive.getAttribute(name))])),
    morphTargets: primitive.listTargets().length,
  })) ?? null,
}]));
const materialSnapshot = material => ({
  base: material.getBaseColorFactor(), metal: material.getMetallicFactor(), rough: material.getRoughnessFactor(),
  emissive: material.getEmissiveFactor(), alpha: material.getAlphaMode(), cutoff: material.getAlphaCutoff(),
  doubleSide: material.getDoubleSided(), normalScale: material.getNormalScale(), occlusion: material.getOcclusionStrength(),
  extras: material.getExtras(), extensions: material.listExtensions().map(extension => extension.extensionName).sort(),
  textures: Object.fromEntries(["BaseColor", "MetallicRoughness", "Normal", "Occlusion", "Emissive"].map(channel => {
    const texture = material[`get${channel}Texture`]();
    const info = material[`get${channel}TextureInfo`]();
    return [channel, texture ? { hash: hash(texture.getImage()), texCoord: info.getTexCoord(), wrapS: info.getWrapS(),
      wrapT: info.getWrapT(), min: info.getMinFilter(), mag: info.getMagFilter() } : null];
  })),
});

if (process.argv.includes("--promote")) {
  const [bytes, original] = await Promise.all([readFile(runtime), readFile(production)]);
  const metrics = JSON.parse(await readFile(metricsFile, "utf8"));
  const parity = JSON.parse(await readFile(parityFile, "utf8"));
  if (!metrics.passed || metrics.errors.length || metrics.zoneColliders.length !== 50 || metrics.payloadBytes !== bytes.length
      || (await stat(metricsFile)).mtimeMs < (await stat(runtime)).mtimeMs || parity.runtimeSHA256 !== hash(bytes)
      || parity.productionSHA256 !== hash(original) || !parity.passed) throw new Error("Missing/stale validation or changed production baseline");
  const result = await validateBytes(new Uint8Array(bytes), { ignoredIssues: ["MESH_PRIMITIVE_GENERATED_TANGENT_SPACE"] });
  if (result.issues.numErrors) throw new Error("glTF validation failed");
  const backup = path.join(staging, `pre-fleet-rp03-${hash(original).slice(0, 12)}.glb`);
  await writeFile(backup, original, { flag: "wx" }).catch(error => { if (error.code !== "EEXIST") throw error; });
  await writeFile(production, bytes);
  await copyFile(metricsFile, production.replace(/\.glb$/, ".metrics.json"));
  await writeFile(path.join(staging, "promotion.json"), JSON.stringify({ backup, production, sha256: hash(bytes), bytes: bytes.length }, null, 2));
  console.log("Promoted validated material-only fleet; previous GLB retained.");
} else {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(candidate);
  const original = await io.read(production);
  const beforeQuantize = geometrySnapshot(doc);
  await doc.transform(quantize({ pattern: /^COLOR_\d+$/, quantizeColor: 8 }));
  const afterQuantize = geometrySnapshot(doc);
  for (const [name, data] of Object.entries(beforeQuantize)) {
    const after = afterQuantize[name];
    for (const primitive of data.primitives ?? []) delete primitive.attributes.COLOR_0;
    for (const primitive of after.primitives ?? []) delete primitive.attributes.COLOR_0;
    if (canonical(data) !== canonical(after)) throw new Error(`Non-colour geometry changed while quantizing ${name}`);
  }
  await io.write(runtime, doc);
  const written = await io.read(runtime);
  const oldNodes = geometrySnapshot(original), newNodes = geometrySnapshot(written);
  const differences = [...new Set([...Object.keys(oldNodes), ...Object.keys(newNodes)])]
    .filter(name => canonical(oldNodes[name]) !== canonical(newNodes[name]));
  if (differences.length) throw new Error(`Production geometry, vertex AO, UV, transform or rig parity failed: ${differences.join(", ")}`);
  const changedMaterials = new Set();
  const materialDifferences = [];
  const materialPairs = new Map();
  for (const node of original.getRoot().listNodes()) {
    const next = written.getRoot().listNodes().find(other => other.getName() === node.getName());
    const primitives = node.getMesh()?.listPrimitives() ?? [];
    primitives.forEach((primitive, index) => {
      const material = primitive.getMaterial();
      const nextMaterial = next.getMesh().listPrimitives()[index].getMaterial();
      if (material) {
        if (!materialPairs.has(material)) materialPairs.set(material, new Set());
        materialPairs.get(material).add(nextMaterial);
      }
    });
  }
  // Blender emits several same-named variants for UV0/UV1. Compare materials
  // through their unchanged node+primitive bindings, never first-by-name.
  for (const [material, next] of [...materialPairs].flatMap(([material, nextMaterials]) =>
    [...nextMaterials].map(next => [material, next]))) {
    if (!next || next.getName() !== material.getName()) throw new Error(`Missing material ${material.getName()}`);
    const before = materialSnapshot(material), after = materialSnapshot(next);
    if (canonical(before) !== canonical(after)) {
      changedMaterials.add(material.getName());
      materialDifferences.push({ name: material.getName(), before, after });
    }
  }
  if (canonical([...changedMaterials].sort()) !== canonical(["MAT_HULL_CREAM", "MAT_HULL_NAVY"])) {
    await writeFile(path.join(staging, "material-differences.json"), JSON.stringify(materialDifferences, null, 2));
    throw new Error(`Unexpected changed materials: ${[...changedMaterials]}; inspect material-differences.json`);
  }
  for (const name of changedMaterials) {
    const material = written.getRoot().listMaterials().find(item => item.getName() === name);
    if (material.getBaseColorTexture() || material.getMetallicRoughnessTexture() || material.getOcclusionTexture()
        || material.getMetallicFactor() !== 0 || !material.getNormalTexture() || Math.abs(material.getNormalScale() - .12) > 1e-6)
      throw new Error(`Paint material exported incorrectly: ${name}`);
  }
  const bytes = await readFile(runtime);
  const result = await validateBytes(new Uint8Array(bytes), { ignoredIssues: ["MESH_PRIMITIVE_GENERATED_TANGENT_SPACE"] });
  await writeFile(path.join(staging, "gltf-validation.json"), JSON.stringify(result, null, 2));
  if (result.issues.numErrors) throw new Error("glTF validation failed");
  const colliderCount = Object.keys(newNodes).filter(name => name.startsWith("COL_MOVE_") || name.startsWith("COL_LADDER_")).length;
  if (colliderCount !== 50) throw new Error(`Expected 50 unchanged colliders, got ${colliderCount}`);
  const report = { passed: true, nodeCount: Object.keys(newNodes).length, colliderCount, changedMaterials: [...changedMaterials].sort(),
    allNodeGeometryIndicesNormalsTangentsUVVertexAOTransformsAndExtrasUnchanged: true,
    productionSHA256: hash(await readFile(production)), runtimeSHA256: hash(bytes), payloadBytes: bytes.length,
    gltfErrors: result.issues.numErrors, gltfWarnings: result.issues.numWarnings };
  await writeFile(parityFile, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}
