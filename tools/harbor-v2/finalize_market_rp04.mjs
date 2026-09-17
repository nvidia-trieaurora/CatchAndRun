/** Build a complete nine-asset QA inventory. No production writes. */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { validateBytes } from 'gltf-validator';
import { ASSETS } from './verify_asset_pipeline.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const stage=path.join(root,'art-source/harbor-v2/_staging/market-rp04');
const assetRoot=path.join(stage,'assets');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(path.join(stage,'container-bd-candidate.glb'));
const colorAccessors=new Set(doc.getRoot().listMeshes().flatMap(mesh=>mesh.listPrimitives())
  .flatMap(primitive=>primitive.listSemantics().filter(name=>name.startsWith('COLOR_')).map(name=>primitive.getAttribute(name))));
const protectedAccessors=new Map(doc.getRoot().listAccessors().filter(a=>!colorAccessors.has(a))
  .map(a=>[a,sha(Buffer.from(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength))]));
// No positional quantization: wall, roof, door and movement coordinates stay exact.
await doc.transform(quantize({pattern:/^COLOR_\d+$/,quantizeColor:8}));
for(const [a,digest] of protectedAccessors) if(sha(Buffer.from(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength))!==digest)throw new Error('Non-colour geometry changed');
const runtime=path.join(stage,'container-bd-runtime.glb');
await io.write(runtime,doc);
const bytes=await readFile(runtime);
const validation=await validateBytes(new Uint8Array(bytes),{ignoredIssues:['MESH_PRIMITIVE_GENERATED_TANGENT_SPACE']});
await writeFile(path.join(stage,'gltf-validation.json'),JSON.stringify(validation,null,2)+'\n');
if(validation.issues.numErrors)throw new Error(JSON.stringify(validation.issues));
const manifest=[];
for(const relative of ASSETS) {
  const source=relative==='zones/container-bd.glb'?runtime:path.join(root,'client/public/assets/maps/harbor-v2',relative);
  const dest=path.join(assetRoot,relative);
  await mkdir(path.dirname(dest),{recursive:true});
  await copyFile(source,dest);
  const data=await readFile(dest);
  manifest.push({relative,bytes:data.length,sha256:sha(data)});
}
await writeFile(path.join(stage,'candidate-manifest.json'),JSON.stringify({assetRoot,createdAt:new Date().toISOString(),assets:manifest},null,2)+'\n');
console.log(JSON.stringify({runtime,bytes:bytes.length,sha256:sha(bytes),gltfErrors:validation.issues.numErrors,assetRoot}));
