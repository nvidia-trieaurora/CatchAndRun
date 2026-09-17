/** Prepare before Blender: node tools/harbor-v2/prepare_realism.mjs
 * Finalize after Blender/validators: node tools/harbor-v2/prepare_realism.mjs --quantize
 * Promote only validated files (backup first): add --promote after validation.
 * Neither source .blends nor the base cinematic map are overwritten.
 */
import { mkdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, quantize } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";

const root = fileURLToPath(new URL("../../", import.meta.url));
const staging = path.join(root, "art-source/harbor-v2/_staging/realism");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const names = ["garden-ac", "construction-ad", "container-bd", "operations-ab", "ferris-harbor", "warehouse-v2"];
const zoneFlag = process.argv.indexOf("--zone");
const zone = zoneFlag >= 0 ? process.argv[zoneFlag + 1] : null;
if (zoneFlag >= 0 && (!process.argv.includes("--quantize") || !names.includes(zone))) {
  throw new Error("--zone requires --quantize and one of: " + names.join(", "));
}
const runtimePath = (name) => path.join(staging, `${name}-runtime.glb`);
const productionPath = (name) => path.join(root, "client/public/assets/maps/harbor-v2",
  name === "warehouse-v2" ? "warehouse.glb" : `zones/${name}.glb`);
const hash = (data) => createHash("sha256").update(data).digest("hex");
await mkdir(staging, { recursive: true });

if (process.argv.includes("--quantize")) {
  for (const name of zone ? [zone] : names) {
    const doc = await io.read(path.join(staging, `${name}-candidate.glb`));
    // Do not quantize position/UV/normal: preserve collision and rig precision.
    const positions = new Map(doc.getRoot().listMeshes().flatMap(m => m.listPrimitives())
      .flatMap(p => [p.getAttribute("POSITION"),p.getAttribute("NORMAL"),p.getAttribute("TANGENT")]).filter(Boolean)
      .map(a => [a, hash(Buffer.from(a.getArray().buffer, a.getArray().byteOffset, a.getArray().byteLength))]));
    await doc.transform(quantize({ pattern: /^COLOR_\d+$/, quantizeColor: 8 }));
    for (const [accessor, before] of positions) {
      const array = accessor.getArray();
      if (before !== hash(Buffer.from(array.buffer, array.byteOffset, array.byteLength))) {
        throw new Error(`${name}: non-colour accessor changed`);
      }
    }
    await io.write(runtimePath(name), doc);
    console.log(`Quantized colours only: ${name}`);
  }
} else if (process.argv.includes("--promote")) {
  // Validate every file before writing ANY production file; refuse stale reports.
  const pending = [];
  for (const name of names) {
    const metricFile = path.join(staging, `${name}-runtime.metrics.json`);
    const metrics = JSON.parse(await readFile(metricFile, "utf8"));
    const bytes = await readFile(runtimePath(name));
    const sourceStat = await stat(runtimePath(name));
    if (!metrics.passed || metrics.errors?.length || (await stat(metricFile)).mtimeMs < sourceStat.mtimeMs
      || metrics.payloadBytes !== bytes.length) throw new Error(`Missing/stale/failed validation: ${name}`);
    // Layout checks alone cannot catch malformed UV/material references. Run
    // glTF validation on the exact bytes before any production file is touched.
    const validation = await validateBytes(new Uint8Array(bytes), {
      ignoredIssues: ["MESH_PRIMITIVE_GENERATED_TANGENT_SPACE"],
    });
    if (validation.issues.numErrors > 0) {
      const errors = validation.issues.messages.filter(issue => issue.severity === 0);
      throw new Error(`${name}: glTF validation failed: ${JSON.stringify(errors.slice(0, 4))}`);
    }
    pending.push({ name, bytes, metrics });
  }
  const backup = path.join(staging, "pre-rl01");
  await mkdir(backup, { recursive: true });
  const output = path.join(root,"docs/v2/harbor/realism-review/promotion.json");
  const previous = await readFile(output, "utf8").then(JSON.parse).catch(error => {
    if (error.code !== "ENOENT") throw error;
    return [];
  });
  const report = [];
  for (const { name, bytes, metrics } of pending) {
    const production = productionPath(name);
    const old = await readFile(production);
    // Keep the first pre-pass revision; later promotions must not destroy rollback.
    const initial = previous.find(entry => entry.name === name);
    const backupFile = initial ? path.join(root, initial.backup) : path.join(backup, `${name}-${hash(old).slice(0,12)}.glb`);
    if (initial) await stat(backupFile);
    else await writeFile(backupFile, old, { flag: "wx" }).catch(error => { if (error.code !== "EEXIST") throw error; });
    await writeFile(production, bytes);
    const outMetrics = name === "warehouse-v2"
      ? path.join(root, "docs/v2/harbor/realism-review/warehouse.metrics.json")
      : production.replace(/\.glb$/, ".metrics.json");
    await copyFile(path.join(staging, `${name}-runtime.metrics.json`), outMetrics);
    report.push({ name, beforeBytes: initial?.beforeBytes ?? old.length, afterBytes:bytes.length,
      sha256:hash(bytes), backup:path.relative(root,backupFile),
      lod0:metrics.lod0, lod1:metrics.lod1, validated:true });
  }
  await writeFile(output,JSON.stringify(report,null,2)+"\n");
  console.log(`Promoted ${report.length} validated assets. Bump runtime URL version tokens together.`);
} else {
  const doc = await io.read(productionPath("warehouse-v2"));
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getName().startsWith("MESH_WAREHOUSE_SC04_SIGN_")) node.dispose();
  }
  if (doc.getRoot().listNodes().length !== 3) throw new Error("Expected the three shipped SC04 sign nodes");
  await doc.transform(prune());
  await io.write(path.join(staging,"shipped-warehouse-sign.glb"),doc);
  console.log("Prepared existing SC04 sign; original warehouse .blend remains untouched.");
}
