import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document,NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS,KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions';
import { assertOriginalParity } from '../finalize_fleet_rp04.mjs';
import { assertBoatProof,assertDrowningProof } from '../promote_fleet_rp04.mjs';

// Synthetic fixtures test proof rejection only, not actual gameplay/art quality.
async function documents(){
  const before=new Document(),buffer=before.createBuffer();
  const material=before.createMaterial('lamp').setEmissiveFactor([1,1,1]);
  material.setExtension('KHR_materials_emissive_strength',before.createExtension(KHRMaterialsEmissiveStrength).createEmissiveStrength().setEmissiveStrength(3.5));
  const positions=before.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,1,0,0,0,1,0])).setBuffer(buffer);
  const mesh=before.createMesh('lamp-mesh').addPrimitive(before.createPrimitive().setAttribute('POSITION',positions).setMaterial(material));
  before.createScene('Harbor').addChild(before.createNode('lamp-node').setMesh(mesh));
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const candidate=await io.readBinary(await io.writeBinary(before));
  return {before,candidate,io};
}

test('exact original nodes/material extensions survive glTF round trip',async()=>{
  const {before,candidate,io}=await documents();
  const proof=await assertOriginalParity(before,candidate,io);
  assert.equal(proof.materialExtensionSnapshots[0].extensions.KHR_materials_emissive_strength.emissiveStrength,3.5);
});

test('parity rejects changing actual emissive strength despite identical core material factors',async()=>{
  const {before,candidate,io}=await documents();
  candidate.getRoot().listMaterials()[0].getExtension('KHR_materials_emissive_strength').setEmissiveStrength(1);
  await assert.rejects(assertOriginalParity(before,candidate,io),/material changed/);
});

test('parity rejects duplicate names rather than silently overwriting a node map',async()=>{
  const {before,candidate,io}=await documents();
  candidate.createNode('lamp-node');
  await assert.rejects(assertOriginalParity(before,candidate,io),/unique/);
});

test('parity rejects detaching an unchanged original node from its scene',async()=>{
  const {before,candidate,io}=await documents();
  candidate.getRoot().listScenes()[0].removeChild(candidate.getRoot().listNodes()[0]);
  await assert.rejects(assertOriginalParity(before,candidate,io),/scene roots/);
});

async function proofDirectory(t){
  const dir=await mkdtemp(path.join(os.tmpdir(),'fleet-proof-unit-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await writeFile(path.join(dir,'proof.png'),'synthetic screenshot existence fixture');
  return dir;
}
function boats(quality='high'){
  const tracks=[['WORKBOAT','workboat',9.05,49.9],['LAUNCH','launch',-9.8,49.4],['BARGE','barge',.4,56.5],['SKIFF_RED','skiff-red',-15.5,48.6],['SKIFF_GREEN','skiff-green',17.5,48.7]];
  const dimensions={
    high:{WORKBOAT:[[-4.6,.66,-1.45],[4.7,.72,1.45]],LAUNCH:[[-3.2,.52,-1.05],[3.3,.57,1.05]],BARGE:[[-5.9,.70,-2.2],[5.9,.74,2.2]],SKIFF_RED:[[-1.5,.04,-.45],[1.6,.08,.45]],SKIFF_GREEN:[[-1.5,.04,-.45],[1.6,.08,.45]]},
    low:{WORKBOAT:[[-4.95,-.6,-1.55],[4.95,.75,1.55]],LAUNCH:[[-3.45,-.6,-1.15],[3.45,.60,1.15]],BARGE:[[-5.95,-.6,-2.25],[5.95,.70,2.25]],SKIFF_RED:[[-2.05,-.6,-.70],[2.05,.42,.70]],SKIFF_GREEN:[[-2.05,-.6,-.70],[2.05,.42,.70]]},
  };
  const meshPart=name=>quality==='high'?'DECK_TIMBER_LOD0':name==='SKIFF_RED'?'PLANK_RED_LOD1':name==='SKIFF_GREEN'?'PLANK_GREEN_LOD1':'HULL_NAVY_LOD1';
  return {passed:true,role:'hunter',protocol:'designated-deck-v2',file:'proof.png',results:tracks.map(([name,id,x,z])=>({
    name:'RIG_FERRIS_HARBOR_BOAT_'+name,passed:true,alive:true,serverAlive:true,wetSamples:0,contactSamples:40,serverSamples:40,
    maxDeckContactError:.01,minFeet:-1,maxFeet:-1,lowDeckThresholdExercised:true,outOfDeckSamples:0,contactSurface:'designated-deck',serverMatchedSpanMs:3900,
    plannedTrack:{id,x,z,source:'client/tests/helpers/candidateHarborFleet.ts:FLEET_TRACKS'},
    selectedDeck:{selectionRule:'audited-local-deck-bounds',sourceMeshName:`MESH_FERRIS_HARBOR_BOAT_${name}_${meshPart(name)}`,localBounds:{min:dimensions[quality][name][0],max:dimensions[quality][name][1]},boxIndex:0,boundsAtSelection:{min:[x-1,-1.2,z-1],max:[x+1,-1,z+1]},heightAtSelection:-1.01,spawn:{x,feetY:-.81,z},spawnDrop:.2},
    deckSamples:Array.from({length:40},(_,i)=>({elapsedMs:1900+i*100,x,z,feetY:-1,deckHeight:-1.01,contactError:.01,deckBoxIndex:0,onDesignatedDeck:true,inWater:false,serverPositionMatched:true,serverPosition:{x,y:-1,z},serverRole:'hunter',serverAlive:true,serverPhase:'active'})),
  }))};
}
function water(){
  const start={x:7,feetY:8,z:50};
  const sample=(elapsedMs,wet,alive,jumpHeld)=>({elapsedMs,jumpHeld,client:{inWater:wet,isAlive:alive,role:alive?'hunter':'spectator'},server:{z:50,feetY:wet?-1:8,isAlive:alive,role:alive?'hunter':'spectator',health:alive?20:0}});
  const samples=[sample(0,false,true,false),sample(1000,true,true,true),sample(4500,true,false,true)];
  return {passed:true,setup:{sessionId:'unit-hunter',phase:'active',localRole:'hunter',serverRole:'hunter',localAlive:true,serverAlive:true},file:'proof.png',startPosition:start,waterCandidates:[{position:start,blockingColliders:[]}],samples,events:[{elapsedMs:4300,payload:{victimSessionId:'unit-hunter'}}],clientEnteredMs:1000,serverEnteredMs:1000,clientEntryToEventMs:3300,serverObservedEntryToEventMs:3300,final:structuredClone(samples[2])};
}

test('live proof guards accept complete bounded evidence fixtures',async t=>{
  const dir=await proofDirectory(t);
  await assertBoatProof(boats(),'high',dir);
  await assertDrowningProof(water(),dir);
});

test('captured spectator terminal contract stays valid after a living Hunter entry',async t=>{
  // Terminal roles/health mirror the 2026-09-10 real capture. Keep the unit test
  // portable rather than dependent on ignored screenshots or a mutable report.
  const dir=await proofDirectory(t),proof=water();
  assert.equal(proof.final.client.role,'spectator');
  assert.equal(proof.final.server.role,'spectator');
  assert.equal(proof.final.server.health,0);
  await assertDrowningProof(proof,dir);
});

test('Low accepts its designated decks but not living feet on a cabin roof',async t=>{
  const dir=await proofDirectory(t),proof=boats('low');
  await assertBoatProof(proof,'low',dir);
  const workboat=proof.results[0];
  for(const sample of workboat.deckSamples){sample.feetY+=1.9;sample.contactError=0;}
  workboat.minFeet+=1.9;workboat.maxFeet+=1.9;workboat.maxDeckContactError=0;
  await assert.rejects(assertBoatProof(proof,'low',dir),/selected low deck plane/);
});

test('native local bounds allow only small float GLB round-trip tolerance',async t=>{
  const dir=await proofDirectory(t),proof=boats();
  proof.results[2].selectedDeck.localBounds.max[1]+=5e-5;
  await assertBoatProof(proof,'high',dir);
  proof.results[2].selectedDeck.localBounds.max[1]+=.001;
  await assert.rejects(assertBoatProof(proof,'high',dir),/audited walking deck/);
});

for(const [label,mutate] of [
  ['insufficient contact',b=>b.results[0].contactSamples=25],
  ['insufficient server samples',b=>b.results[0].serverSamples=10],
  ['invalid exact-plane error',b=>b.results[0].maxDeckContactError=.061],
  ['never submerged low deck',b=>b.results[3].minFeet=-.8],
  ['false threshold summary',b=>b.results[3].lowDeckThresholdExercised=false],
  ['wrong role',b=>b.role='prop'],
  ['duplicate boat',b=>b.results[4].name=b.results[3].name],
  ['missing screenshot',b=>b.file='missing.png'],
  ['legacy any-support protocol',b=>delete b.protocol],
  ['v1 lowest-plane protocol',b=>b.protocol='designated-deck-v1'],
  ['buried High barge hull plane',b=>{b.results[2].selectedDeck.localBounds.min[1]=-.6;b.results[2].selectedDeck.localBounds.max[1]=.17;}],
  ['wrong source mesh',b=>b.results[2].selectedDeck.sourceMeshName='MESH_FERRIS_HARBOR_BOAT_BARGE_HULL_NAVY_LOD0'],
  ['missing local bounds',b=>delete b.results[2].selectedDeck.localBounds],
  ['wrong local footprint',b=>b.results[0].selectedDeck.localBounds.min[0]-=.5],
  ['local-bound NaN',b=>b.results[0].selectedDeck.localBounds.max[0]=NaN],
  ['unbound free-form track',b=>b.results[0].plannedTrack.x=12],
  ['roof selection',b=>b.results[0].selectedDeck.heightAtSelection=2.8],
  ['support fallback selection',b=>b.results[0].selectedDeck.selectionRule='any-support'],
  ['spawn above cabin',b=>b.results[0].selectedDeck.spawn.feetY=3.4],
  ['different sample deck identity',b=>b.results[0].deckSamples[1].deckBoxIndex=1],
  ['off-track contact',b=>b.results[0].deckSamples[1].x+=2],
  ['roof feet with falsely zero summary error',b=>{const r=b.results[0];for(const s of r.deckSamples){s.feetY=3;s.contactError=0;}r.minFeet=3;r.maxFeet=3;r.maxDeckContactError=0;}],
  ['roof plane chosen as any support',b=>{const r=b.results[0];for(const s of r.deckSamples){s.feetY=3;s.deckHeight=3;s.contactError=0;}r.minFeet=3;r.maxFeet=3;r.maxDeckContactError=0;}],
  ['null designated support',b=>b.results[0].deckSamples[1].deckHeight=null],
  ['out-of-deck sample',b=>b.results[0].deckSamples[1].onDesignatedDeck=false],
  ['inflated server summary',b=>b.results[0].deckSamples[1].serverPositionMatched=false],
  ['forged server match for far position',b=>b.results[0].deckSamples[1].serverPosition.x+=10],
  ['forged server match without position',b=>b.results[0].deckSamples[1].serverPosition=null],
  ['matched dead server player',b=>b.results[0].deckSamples[1].serverAlive=false],
  ['matched wrong server role',b=>b.results[0].deckSamples[1].serverRole='spectator'],
  ['matched inactive room',b=>b.results[0].deckSamples[1].serverPhase='waiting'],
  ['inflated matched observation span',b=>b.results[0].serverMatchedSpanMs=10000],
  ['only late server convergence',b=>{const r=b.results[0];for(const s of r.deckSamples.slice(0,25)){s.serverPosition.x+=10;s.serverPositionMatched=false;}r.serverSamples=15;r.serverMatchedSpanMs=1400;}],
  ['brief contact shorter than drowning grace',b=>b.results[0].deckSamples.forEach((s,i)=>s.elapsedMs=1900+i*10)],
])test(`boat proof rejects ${label} even when passed=true`,async t=>{
  const dir=await proofDirectory(t),proof=boats();mutate(proof);
  await assert.rejects(assertBoatProof(proof,'high',dir));
});

for(const [label,mutate] of [
  ['wrong setup',w=>w.setup.serverAlive=false],
  ['different victim',w=>w.events[0].payload.victimSessionId='someone-else'],
  ['no actual client entry',w=>w.samples[1].client.inWater=false],
  ['no actual server entry',w=>w.samples.forEach(s=>s.server.feetY=8)],
  ['missing held jump',w=>w.samples.forEach(s=>s.jumpHeld=false)],
  ['duplicate event',w=>w.events.push(structuredClone(w.events[0]))],
  ['event before entry',w=>w.events[0].elapsedMs=1],
  ['live authoritative final sample',w=>w.samples.at(-1).server.isAlive=true],
  ['dead Hunter instead of terminal spectator',w=>{w.final.client.role='hunter';w.final.server.role='hunter';}],
  ['arbitrary terminal role',w=>w.final.server.role='prop'],
  ['nonzero terminal health',w=>w.final.server.health=1],
  ['live-role entry replaced by spectator',w=>w.samples[1].client.role='spectator'],
  ['dry deck fall column',w=>w.waterCandidates[0].blockingColliders.push({})],
  ['missing screenshot',w=>w.file='missing.png'],
])test(`drowning proof rejects ${label} even when passed=true`,async t=>{
  const dir=await proofDirectory(t),proof=water();mutate(proof);
  await assert.rejects(assertDrowningProof(proof,dir));
});
