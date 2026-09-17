// Validate exact new asset bytes before promotion; keep a recoverable old version.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { validateBytes } from 'gltf-validator';
const names = process.argv.slice(2);
const allowed = ['rescue-quay', 'response-station'];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const pending = [];
for (const name of names) {
  if (!allowed.includes(name)) throw new Error(`Unknown rescue asset: ${name}`);
  const input = `art-source/harbor-v2/_staging/${name === 'response-station' ? 'response-station/' : ''}${name}-candidate.glb`;
  const bytes = await readFile(input);
  const result = await validateBytes(new Uint8Array(bytes), {ignoredIssues:['MESH_PRIMITIVE_GENERATED_TANGENT_SPACE']});
  if (result.issues.numErrors) throw new Error(JSON.stringify(result.issues));
  const doc = await io.readBinary(bytes);
  const nodes = doc.getRoot().listNodes();
  const lod = tier => {
    const meshes = nodes.filter(n => n.getMesh() && n.getName().endsWith(`_${tier}`));
    return {meshes:meshes.length,drawCalls:meshes.reduce((n,m)=>n+m.getMesh().listPrimitives().length,0),
      triangles:meshes.reduce((n,m)=>n+m.getMesh().listPrimitives().reduce((t,p)=>t+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0)};
  };
  const report={name,payloadBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
    lod0:lod('LOD0'),lod1:lod('LOD1'),colliders:nodes.filter(n=>n.getName().startsWith('COL_MOVE_')).length,gltfErrors:result.issues.numErrors};
  if(!report.lod0.meshes||!report.lod1.meshes||report.lod0.drawCalls>25||bytes.length>6*1024*1024) throw new Error(JSON.stringify(report));
  pending.push({name,bytes,report});
}
await mkdir('docs/v2/harbor/repair-review',{recursive:true});
await mkdir('art-source/harbor-v2/_staging/pre-rp02',{recursive:true});
for(const {name,bytes,report} of pending) {
  const dest=`client/public/assets/maps/harbor-v2/zones/${name}.glb`;
  try {
    const old=await readFile(dest);
    const hash=createHash('sha256').update(old).digest('hex').slice(0,12);
    await copyFile(dest,`art-source/harbor-v2/_staging/pre-rp02/${name}-${hash}.glb`);
  } catch(e) {if(e.code!=='ENOENT') throw e;}
  await writeFile(dest,bytes);
  await writeFile(`docs/v2/harbor/repair-review/${name}.metrics.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}
