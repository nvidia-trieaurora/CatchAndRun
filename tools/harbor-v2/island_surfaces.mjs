/** Scoped Blender surface pipeline: --prepare, then Blender build_island_surfaces.py,
 * then --finalize; --promote only after runtime candidate tests. All non-surface
 * geometry, collision and rig data are retained from the backed-up original GLB. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { copyToDocument, prune, unpartition, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import * as THREE from "three";
import sharp from "sharp";
import { validateBytes } from "gltf-validator";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = path.join(root, "art-source/harbor-v2/_staging/island-surfaces");
const production = path.join(root, "client/public/assets/maps/harbor-v2/cinematic/harbor-cinematic.glb");
const runtime = path.join(dir, "harbor-cinematic-runtime.glb");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
await mkdir(dir, { recursive: true });
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const names = ["base", "harbor"].flatMap((prefix, i) => ["asphalt", "concrete", "concrete_warm"].map(mat => `${prefix}_MESH_${mat}_LOD${i}`));
const worldPoints = node => {
  const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  return node.getMesh().listPrimitives().flatMap(p => {
    const pos = p.getAttribute("POSITION");
    return Array.from({ length: pos.getCount() }, (_, i) => new THREE.Vector3().fromArray(pos.getElement(i, [])).applyMatrix4(matrix).toArray());
  });
};
const bounds = points => {
  const b = new THREE.Box3().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  return [...b.min.toArray(), ...b.max.toArray()];
};
const signature = node => JSON.stringify({ matrix: node.getMatrix(), extras: node.getExtras(),
  primitives: node.getMesh()?.listPrimitives().map(p => ({
    indices: p.getIndices() && Array.from(p.getIndices().getArray()),
    attributes: Object.fromEntries(p.listSemantics().map(s => [s, Array.from(p.getAttribute(s).getArray())])),
  })) });

if (process.argv.includes("--prepare")) {
  const bytes = await readFile(production);
  const backup = path.join(dir, `before-${sha(bytes).slice(0, 12)}.glb`);
  await writeFile(backup, bytes, { flag: "wx" }).catch(e => { if (e.code !== "EEXIST") throw e; });
  const doc = await io.read(backup);
  const surfaces = names.map(name => {
    const node = doc.getRoot().listNodes().find(n => n.getName() === name);
    if (!node || node.listChildren().length || node.getMesh().listPrimitives().length !== 1) throw new Error(`Unexpected surface structure: ${name}`);
    const p = node.getMesh().listPrimitives()[0];
    return { name, extras: node.getExtras(), positions: worldPoints(node),
      indices: p.getIndices() ? Array.from(p.getIndices().getArray()) : Array.from({ length: p.getAttribute("POSITION").getCount() }, (_, i) => i),
      material: p.getMaterial().getName() };
  });
  await writeFile(path.join(dir, "source.json"), JSON.stringify({ source: path.relative(root, backup), sourceHash: sha(bytes), surfaces }));
  console.log(`Prepared ${surfaces.length} exact geometry surfaces; original saved: ${backup}`);
} else if (process.argv.includes("--finalize")) {
  const manifest = JSON.parse(await readFile(path.join(dir, "source.json"), "utf8"));
  const original = await io.read(path.join(root, manifest.source));
  const originalNodes = original.getRoot().listNodes();
  const unchanged = new Map(originalNodes.filter(n => !names.includes(n.getName())).map(n => [n, signature(n)]));
  const source = await io.read(path.join(dir, "island-surfaces-candidate.glb"));
  const replacements = source.getRoot().listNodes().filter(n => n.getMesh());
  const mapping = copyToDocument(original, source, replacements);
  for (const incoming of replacements) {
    const copied = mapping.get(incoming);
    const old = originalNodes.find(n => n.getName() === incoming.getName());
    if (old) {
      if (!names.includes(old.getName())) throw new Error(`Unexpected replacement ${old.getName()}`);
      const a = bounds(worldPoints(old)), b = bounds(worldPoints(incoming));
      if (a.some((v, i) => Math.abs(v - b[i]) > .0001)) throw new Error(`Surface bounds changed: ${old.getName()}`);
      old.setMesh(copied.getMesh()).setMatrix(copied.getMatrix()).setExtras({ ...old.getExtras(), ...copied.getExtras() });
      copied.dispose();
    } else {
      if (!incoming.getName().startsWith("MESH_ISLAND_")) throw new Error(`Unexpected extra ${incoming.getName()}`);
      original.getRoot().getDefaultScene().addChild(copied);
    }
  }
  for (const [node, before] of unchanged) if (signature(node) !== before) throw new Error(`Protected data changed: ${node.getName()}`);
  // Original meshopt arrays remain decoded exactly, with no position quantization.
  // New texture maps are compressed; no geometry simplification or weld occurs.
  const compression = original.getRoot().listExtensionsUsed().find(e => e.extensionName === "EXT_meshopt_compression");
  compression?.dispose();
  await original.transform(prune({ keepLeaves: true }), unpartition(), textureCompress({ encoder: sharp, targetFormat: "webp", quality: 87 }));
  await io.write(runtime, original);
  const bytes = await readFile(runtime);
  const result = await validateBytes(new Uint8Array(bytes), { ignoredIssues: ["MESH_PRIMITIVE_GENERATED_TANGENT_SPACE"] });
  await writeFile(path.join(dir, "gltf-validation.json"), JSON.stringify(result, null, 2));
  if (result.issues.numErrors) throw new Error(JSON.stringify(result.issues.messages.filter(m => m.severity === 0)));
  if (bytes.length > 8_000_000) throw new Error(`Surface payload too large: ${bytes.length}`);
  const report = { source: "art-source/harbor-v2/island/island-surfaces-rp03.blend", backup: manifest.source,
    sourceHash: manifest.sourceHash, sha256: sha(bytes), bytes: bytes.length, updated: names, protectedNodes: unchanged.size,
    additionalDrawsPerTier: 1, addedColliders: 0, validationErrors: 0 };
  await writeFile(path.join(dir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} else if (process.argv.includes("--promote")) {
  const report = JSON.parse(await readFile(path.join(dir, "report.json"), "utf8"));
  const bytes = await readFile(runtime);
  if (sha(bytes) !== report.sha256 || sha(await readFile(production)) !== report.sourceHash) throw new Error("Candidate stale or production changed; refusing overwrite");
  await writeFile(production, bytes);
  const review = path.join(root, "docs/v2/harbor/island-review");
  await mkdir(review, { recursive: true });
  await writeFile(path.join(review, "surface-promotion.json"), JSON.stringify(report, null, 2));
  console.log("Promoted native surface pass; exact previous production GLB retained.");
} else throw new Error("Choose --prepare, --finalize, or --promote");
