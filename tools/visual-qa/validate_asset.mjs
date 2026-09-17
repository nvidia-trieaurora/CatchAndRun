/** Structural/render-data checks complement, never replace, contact-route + visual QA. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {validateBytes} from 'gltf-validator';
const file=process.argv[2];if(!file)throw Error('Usage: node tools/visual-qa/validate_asset.mjs FILE.glb [REPORT.json]');
const bytes=readFileSync(file), hash=createHash('sha256').update(bytes).digest('hex');
// A failed rebuild must not leave an older successful report looking current.
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify({file,sha256:hash,passed:false,status:'validation-incomplete'},null,2));
const result=await validateBytes(bytes,{uri:file});assert.equal(result.issues.numErrors,0);
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file),root=doc.getRoot();
const lods=[];
for(const lod of ['LOD0','LOD1']){
  const nodes=root.listNodes().filter(n=>n.getName().endsWith(lod));let triangles=0,primitives=0,vertices=0;
  for(const n of nodes){assert.ok(n.getWorldMatrix().every(Number.isFinite));assert.ok(n.getScale().every(s=>s>0));
    for(const p of n.getMesh()?.listPrimitives()??[]){primitives++;const pos=p.getAttribute('POSITION'),norm=p.getAttribute('NORMAL'),uv=p.getAttribute('TEXCOORD_0');
      assert.ok(pos&&norm&&uv,n.getName()+' position/normal/UV required');
      for(const accessor of [pos,norm,uv])assert.ok(accessor.getArray().every(Number.isFinite));
      for(let i=0;i<norm.getCount();i++){const v=norm.getElement(i,[]),len=Math.hypot(...v);assert.ok(Math.abs(len-1)<.02,'unit normals');}
      vertices+=pos.getCount();triangles+=(p.getIndices()?.getCount()??pos.getCount())/3;
      assert.ok(p.getMaterial(),'assigned material');
    }
  }
  assert.ok(primitives>0&&primitives<=12,'station draw-call budget');assert.ok(triangles<=16000,'station triangle budget');
  const gate=nodes.filter(n=>n.getExtras().gameplayRole==='hunterGate');assert.equal(gate.length,1);
  assert.ok(gate[0].getTranslation().every((v,i)=>Math.abs(v-[-35,5,0][i])<1e-5),'top-edge metre pivot');
  lods.push({lod,primitives,triangles,vertices});
}
assert.equal(root.listSkins().length,0,'static architectural sample, no skeleton expected');
assert.ok(bytes.length<2_000_000,'2MB sample payload cap');
const report={file,sha256:hash,bytes:bytes.length,passed:true,lods,skins:root.listSkins().length,animations:root.listAnimations().map(a=>a.getName()),
  materials:root.listMaterials().map(m=>({name:m.getName(),roughness:m.getRoughnessFactor(),metalness:m.getMetallicFactor(),alpha:m.getAlphaMode()})),
  textures:root.listTextures().map(t=>({name:t.getName(),size:t.getSize(),mime:t.getMimeType()})),
  warnings:result.issues.messages.filter(m=>m.severity===1),
  limitations:['Unit/pivot checks are specific to station contract.','UV presence/finite values do not prove good unwrap or texel density; inspect close views.','Normals are finite/unit, but visual inspection still required for winding and shading.','No automatic claim about style, clipping, foot sliding or runtime routes.']};
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
