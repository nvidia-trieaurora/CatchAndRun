/** Fleet staging only: exact original geometry/rig/material parity + five decorative batches. */
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
const stage=path.join(root,'art-source/harbor-v2/_staging/fleet-rp04');
const assetRoot=path.join(stage,'assets');
const production=path.join(root,'client/public/assets/maps/harbor-v2/zones/ferris-harbor.glb');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytesOf=a=>Buffer.from(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength);
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const accessor=a=>a?{type:a.getType(),component:a.getComponentType(),normalized:a.getNormalized(),count:a.getCount(),hash:sha(bytesOf(a))}:null;
const material=(m,extensions)=>m?{
  name:m.getName(),base:m.getBaseColorFactor(),metal:m.getMetallicFactor(),rough:m.getRoughnessFactor(),
  emissive:m.getEmissiveFactor(),alpha:m.getAlphaMode(),cutoff:m.getAlphaCutoff(),double:m.getDoubleSided(),
  normal:m.getNormalScale(),occlusion:m.getOcclusionStrength(),extras:m.getExtras(),extensions:extensions.get(m),
  textures:Object.fromEntries(['BaseColor','MetallicRoughness','Normal','Occlusion','Emissive'].map(key=>{
    const t=m[`get${key}Texture`](),i=m[`get${key}TextureInfo`]();
    return [key,t?{hash:sha(t.getImage()),coord:i.getTexCoord(),wrapS:i.getWrapS(),wrapT:i.getWrapT(),min:i.getMinFilter(),mag:i.getMagFilter()}:null];
  })),
}:null;
const snapshot=(n,oldNames,extensions)=>({matrix:n.getMatrix(),extras:n.getExtras(),children:n.listChildren().filter(c=>oldNames.has(c.getName())).map(c=>c.getName()).sort(),
  primitives:n.getMesh()?.listPrimitives().map(p=>({mode:p.getMode(),indices:accessor(p.getIndices()),
    attributes:Object.fromEntries(p.listSemantics().map(s=>[s,accessor(p.getAttribute(s))])),material:material(p.getMaterial(),extensions),targets:p.listTargets().length}))??null});

function uniqueNames(properties,label){
  const names=properties.map(p=>p.getName());
  if(names.some(n=>!n)||new Set(names).size!==names.length)throw new Error(`${label} names must be non-empty and unique`);
  return new Set(names);
}

/** Importable, read-only parity check. No staging/production writes during tests. */
export async function assertOriginalParity(before,written,io=new NodeIO().registerExtensions(ALL_EXTENSIONS)){
  const oldNames=uniqueNames(before.getRoot().listNodes(),'Original node');
  uniqueNames(written.getRoot().listNodes(),'Candidate node');
  uniqueNames(before.getRoot().listScenes(),'Original scene');
  uniqueNames(written.getRoot().listScenes(),'Candidate scene');
  const newMap=new Map(written.getRoot().listNodes().map(n=>[n.getName(),n]));
  const sceneRoots=d=>d.getRoot().listScenes().map(s=>({name:s.getName(),roots:s.listChildren().filter(n=>oldNames.has(n.getName())).map(n=>n.getName()).sort()})).sort((a,b)=>a.name.localeCompare(b.name));
  if(canonical(sceneRoots(before))!==canonical(sceneRoots(written))
     ||before.getRoot().getDefaultScene()?.getName()!==written.getRoot().getDefaultScene()?.getName())throw new Error('Original scene roots/default scene changed');
  // Serialize extension values (not just extension names). Full property equality
  // below additionally resolves referenced textures, including extension textures.
  const extensionSnapshots=async d=>{
    const {json}=await io.writeJSON(d);
    return new Map(d.getRoot().listMaterials().map((m,i)=>[m,json.materials?.[i]?.extensions??{}]));
  };
  const oldExtensions=await extensionSnapshots(before),newExtensions=await extensionSnapshots(written);
  const changed=before.getRoot().listNodes().filter(n=>{
    const next=newMap.get(n.getName());
    if(!next||canonical(snapshot(n,oldNames,oldExtensions))!==canonical(snapshot(next,oldNames,newExtensions)))return true;
    return (n.getMesh()?.listPrimitives()??[]).some((p,i)=>{
      const m=p.getMaterial(),other=next.getMesh().listPrimitives()[i].getMaterial();
      return Boolean(m)!==Boolean(other)||(m&&!m.equals(other));
    });
  }).map(n=>n.getName());
  if(changed.length)throw new Error('Original geometry, rig, metadata or material changed: '+changed.join(', '));
  return {oldNames,newMap,originalSceneRoots:sceneRoots(before),materialExtensionSnapshots:[...oldExtensions].filter(([,extensions])=>Object.keys(extensions).length).map(([m,extensions])=>({material:m.getName(),extensions}))};
}

async function main(){
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(path.join(stage,'ferris-harbor-candidate.glb'));
const originalBytes=await readFile(production),before=await io.readBinary(new Uint8Array(originalBytes));
const colors=new Set(doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).flatMap(p=>p.listSemantics().filter(s=>s.startsWith('COLOR_')).map(s=>p.getAttribute(s))));
const locked=new Map(doc.getRoot().listAccessors().filter(a=>!colors.has(a)).map(a=>[a,sha(bytesOf(a))]));
await doc.transform(quantize({pattern:/^COLOR_\d+$/,quantizeColor:8}));
for(const [a,digest] of locked) if(sha(bytesOf(a))!==digest)throw new Error('Non-colour quantization changed geometry');
const runtime=path.join(stage,'ferris-harbor-runtime.glb');
await io.write(runtime,doc);
const written=await io.read(runtime);
const {oldNames,newMap,originalSceneRoots,materialExtensionSnapshots}=await assertOriginalParity(before,written,io);
const added=written.getRoot().listNodes().filter(n=>!oldNames.has(n.getName()));
const boats=['WORKBOAT','LAUNCH','BARGE','SKIFF_GREEN','SKIFF_RED'];
if(added.length!==5)throw new Error('Expected exactly five new detail batches');
for(const boat of boats){
  const name=`MESH_FERRIS_HARBOR_RP04_${boat}_FITTINGS_LOD0`,node=newMap.get(name);
  const owner=newMap.get(`RIG_FERRIS_HARBOR_BOAT_${boat}`);
  if(!node||!owner?.listChildren().includes(node)||node.getExtras().boatDetailOnly!==true||node.getExtras().zoneLod!=='LOD0'
     ||node.getMesh()?.listPrimitives().length!==1)throw new Error('Invalid attached decorative batch: '+boat);
}
const bytes=await readFile(runtime);
const validation=await validateBytes(new Uint8Array(bytes),{ignoredIssues:['MESH_PRIMITIVE_GENERATED_TANGENT_SPACE']});
await writeFile(path.join(stage,'gltf-validation.json'),JSON.stringify(validation,null,2)+'\n');
if(validation.issues.numErrors)throw new Error(JSON.stringify(validation.issues));
const manifest=[];
for(const relative of ASSETS){
  const source=relative==='zones/ferris-harbor.glb'?runtime:path.join(root,'client/public/assets/maps/harbor-v2',relative);
  const dest=path.join(assetRoot,relative); await mkdir(path.dirname(dest),{recursive:true}); await copyFile(source,dest);
  const data=await readFile(dest);manifest.push({relative,bytes:data.length,sha256:sha(data)});
}
await writeFile(path.join(stage,'candidate-manifest.json'),JSON.stringify({assetRoot,assets:manifest},null,2)+'\n');
const report={passed:true,originalNodeCount:oldNames.size,allOriginalGeometryRigMetadataMaterialsUnchanged:true,
  paritySchemaVersion:2,uniqueNodeNames:true,originalSceneRoots,materialExtensionSnapshots,
  addedNodes:added.map(n=>n.getName()),productionSHA256:sha(originalBytes),runtimeSHA256:sha(bytes),bytes:bytes.length,gltfErrors:validation.issues.numErrors};
if(sha(await readFile(production))!==report.productionSHA256)throw new Error('Production changed during finalization');
await writeFile(path.join(stage,'parity-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,assetRoot}));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
