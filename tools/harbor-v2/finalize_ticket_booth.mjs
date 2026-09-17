/** Quantize colours, validate native export, and promote only a checked candidate. */
import { mkdir, readFile, writeFile, stat, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { quantize } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";

const root = fileURLToPath(new URL("../../", import.meta.url));
const staging = path.join(root, "art-source/harbor-v2/_staging/ticket-repair");
const candidate = path.join(staging, "ferris-harbor-candidate.glb");
const runtime = path.join(staging, "ferris-harbor-runtime.glb");
const metricsFile = path.join(staging, "ferris-harbor-runtime.metrics.json");
const production = path.join(root, "client/public/assets/maps/harbor-v2/zones/ferris-harbor.glb");
const hash = (data) => createHash("sha256").update(data).digest("hex");
if (!process.argv.includes("--promote")) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(candidate);
  // Quantization is explicitly limited to COLOR_0: collision and animation
  // transforms, indices, positions, UVs and normals remain unchanged.
  const positions = new Map(doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).flatMap(p => [p.getAttribute("POSITION"), p.getAttribute("NORMAL"), p.getAttribute("TANGENT")]).filter(Boolean).map(a => [a, hash(Buffer.from(a.getArray().buffer, a.getArray().byteOffset, a.getArray().byteLength))]));
  await doc.transform(quantize({ pattern: /^COLOR_\d+$/, quantizeColor: 8 }));
  for (const [accessor, before] of positions) {
    const array = accessor.getArray();
    if (before !== hash(Buffer.from(array.buffer, array.byteOffset, array.byteLength))) throw new Error("Non-colour attribute changed");
  }
  await io.write(runtime, doc);
  const bytes = await readFile(runtime);
  const result = await validateBytes(new Uint8Array(bytes), { ignoredIssues: ["MESH_PRIMITIVE_GENERATED_TANGENT_SPACE"] });
  await writeFile(path.join(staging, "gltf-validation.json"), JSON.stringify(result, null, 2));
  if (result.issues.numErrors) throw new Error(JSON.stringify(result.issues.messages.filter(m => m.severity === 0)));
  console.log(`Runtime GLB: ${bytes.length} bytes, glTF errors: ${result.issues.numErrors}`);
} else {
  const bytes = await readFile(runtime);
  const metrics = JSON.parse(await readFile(metricsFile, "utf8"));
  if (!metrics.passed || metrics.errors.length || metrics.payloadBytes !== bytes.length || (await stat(metricsFile)).mtimeMs < (await stat(runtime)).mtimeMs) throw new Error("Native validation is missing, stale or failed");
  const result = await validateBytes(new Uint8Array(bytes), { ignoredIssues: ["MESH_PRIMITIVE_GENERATED_TANGENT_SPACE"] });
  if (result.issues.numErrors) throw new Error("glTF validation failed");
  const original = await readFile(production);
  const backup = path.join(staging, `pre-rp02-${hash(original).slice(0, 12)}.glb`);
  await writeFile(backup, original, { flag: "wx" }).catch(error => { if (error.code !== "EEXIST") throw error; });
  await writeFile(production, bytes);
  await copyFile(metricsFile, production.replace(/\.glb$/, ".metrics.json"));
  const review = path.join(root, "docs/v2/harbor/repair-review");
  await mkdir(review, { recursive: true });
  await writeFile(path.join(review, "ticket-promotion.json"), JSON.stringify({ source: "art-source/harbor-v2/ferris-harbor/ferris-harbor-ticket-repair.blend", backup: path.relative(root, backup), production: path.relative(root, production), sha256: hash(bytes), beforeBytes: original.length, afterBytes: bytes.length, lod0: metrics.lod0, lod1: metrics.lod1, zoneColliders: metrics.zoneColliders.length, validationErrors: result.issues.numErrors }, null, 2) + "\n");
  console.log("Promoted validated native Blender ticket office; previous production asset retained.");
}
