import { readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { validateBytes } from 'gltf-validator';

const stage = path.resolve('art-source/harbor-v2/_staging/structural-rp03');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const zone of ['garden-ac', 'construction-ad', 'operations-ab']) {
  const runtime = path.join(stage, `${zone}-runtime.glb`);
  const metricsPath = path.join(stage, `${zone}-runtime.metrics.json`);
  if (!process.argv.includes('--promote')) {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const doc = await io.read(path.join(stage, `${zone}-candidate.glb`));
    const geometry = new Map(doc.getRoot().listAccessors().filter(a => a.getType() === 'VEC3').map(a => [a, hash(Buffer.from(a.getArray().buffer, a.getArray().byteOffset, a.getArray().byteLength))]));
    await doc.transform(quantize({ pattern: /^COLOR_\d+$/, quantizeColor: 8 }));
    for (const [a, digest] of geometry) if (hash(Buffer.from(a.getArray().buffer, a.getArray().byteOffset, a.getArray().byteLength)) !== digest) throw new Error('Non-colour geometry changed');
    await io.write(runtime, doc);
  }
  const bytes = await readFile(runtime);
  const validation = await validateBytes(new Uint8Array(bytes), { ignoredIssues: ['MESH_PRIMITIVE_GENERATED_TANGENT_SPACE'] });
  await writeFile(path.join(stage, `${zone}-gltf-validation.json`), JSON.stringify(validation, null, 2));
  if (validation.issues.numErrors) throw new Error(JSON.stringify(validation.issues));
  if (process.argv.includes('--promote')) {
    const metrics = JSON.parse(await readFile(metricsPath, 'utf8'));
    if (!metrics.passed || metrics.errors.length || metrics.payloadBytes !== bytes.length || (await stat(metricsPath)).mtimeMs < (await stat(runtime)).mtimeMs) throw new Error('Native validation missing, stale or failed');
    const production = path.resolve(`client/public/assets/maps/harbor-v2/zones/${zone}.glb`);
    const original = await readFile(production); const backup = path.join(stage, `${zone}-pre-rp03-${hash(original).slice(0, 12)}.glb`);
    await writeFile(backup, original, { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
    await copyFile(runtime, production); await copyFile(metricsPath, production.replace(/\.glb$/, '.metrics.json'));
    await writeFile(path.join(stage, `${zone}-promotion.json`), JSON.stringify({ production, backup, sha256: hash(bytes), bytes: bytes.length }, null, 2));
  }
  console.log(JSON.stringify({ zone, errors: validation.issues.numErrors, sha256: hash(bytes), bytes: bytes.length, promoted: process.argv.includes('--promote') }));
}
