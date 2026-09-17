/** Quantize only colour; validate and promote the independently reviewed RP03 shop. */
import { readFile, writeFile, stat, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { validateBytes } from 'gltf-validator';

const root = fileURLToPath(new URL('../../', import.meta.url));
const staging = path.join(root, 'art-source/harbor-v2/_staging/market-rp03');
const runtime = path.join(staging, 'container-bd-runtime.glb');
const metricsPath = path.join(staging, 'container-bd-runtime.metrics.json');
const production = path.join(root, 'client/public/assets/maps/harbor-v2/zones/container-bd.glb');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validate = async bytes => {
  const result = await validateBytes(new Uint8Array(bytes), { ignoredIssues: ['MESH_PRIMITIVE_GENERATED_TANGENT_SPACE'] });
  if (result.issues.numErrors) throw new Error(JSON.stringify(result.issues));
  return result;
};

if (!process.argv.includes('--promote')) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(path.join(staging, 'container-bd-candidate.glb'));
  const geometry = new Map(doc.getRoot().listAccessors().filter(a => a.getType() === 'VEC3').map(a => [a, hash(Buffer.from(a.getArray().buffer, a.getArray().byteOffset, a.getArray().byteLength))]));
  await doc.transform(quantize({ pattern: /^COLOR_\d+$/, quantizeColor: 8 }));
  for (const [a, digest] of geometry) if (hash(Buffer.from(a.getArray().buffer, a.getArray().byteOffset, a.getArray().byteLength)) !== digest) throw new Error('Non-colour geometry changed');
  await io.write(runtime, doc);
  const bytes = await readFile(runtime);
  const result = await validate(bytes);
  await writeFile(path.join(staging, 'gltf-validation.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ runtime, bytes: bytes.length, errors: result.issues.numErrors, sha256: hash(bytes) }));
} else {
  const bytes = await readFile(runtime);
  const metrics = JSON.parse(await readFile(metricsPath, 'utf8'));
  if (!metrics.passed || metrics.errors.length || metrics.payloadBytes !== bytes.length || (await stat(metricsPath)).mtimeMs < (await stat(runtime)).mtimeMs) throw new Error('Native validation missing, stale or failed');
  const result = await validate(bytes);
  const original = await readFile(production);
  const backup = path.join(staging, `pre-rp03-${hash(original).slice(0, 12)}.glb`);
  await writeFile(backup, original, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  await writeFile(production, bytes);
  await copyFile(metricsPath, production.replace(/\.glb$/, '.metrics.json'));
  await writeFile(path.join(staging, 'promotion.json'), JSON.stringify({ production: path.relative(root, production), backup: path.relative(root, backup), bytes: bytes.length, sha256: hash(bytes), gltfErrors: result.issues.numErrors }, null, 2));
  console.log('Promoted validated RP03 native market; old production file retained at ' + backup);
}
