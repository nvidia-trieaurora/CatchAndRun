/** Explicit Fleet promotion after exact-byte native/headless/browser checks.
 * --check-only performs all checks but no production writes.
 */
import { readFile,writeFile,stat,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateBytes } from 'gltf-validator';
import { checkReport,assetInventory,sourceFingerprint } from './verify_asset_pipeline.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const stage=path.join(root,'art-source/harbor-v2/_staging/fleet-rp04');
const reportRoot=path.join(root,'docs/v2/harbor/fleet-rp04');
const hash=b=>createHash('sha256').update(b).digest('hex');
const ensure=(ok,message)=>{if(!ok)throw new Error(message);};
const readJSON=async p=>JSON.parse(await readFile(p,'utf8'));
const arg=name=>{const i=process.argv.indexOf(name);ensure(i>0&&process.argv[i+1],`Required ${name}`);return path.resolve(process.argv[i+1]);};

async function requireScreenshot(file,repoRoot){
  ensure(typeof file==='string'&&file.length>0,'Missing proof screenshot path');
  const info=await stat(path.resolve(repoRoot,file));
  ensure(info.isFile()&&info.size>0,'Missing proof screenshot');
}
const countAbove=(value,min)=>Number.isInteger(value)&&value>min;
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-7;
// Independently audited standing tracks, also used by candidateHarborFleet.ts.
// A changed track requires an explicit proof-contract review, not a free-form
// camera/controller point or a cabin roof selected from all available supports.
const deckTracks={
  WORKBOAT:{id:'workboat',x:9.05,z:49.9},
  LAUNCH:{id:'launch',x:-9.8,z:49.4},
  SKIFF_RED:{id:'skiff-red',x:-15.5,z:48.6},
  SKIFF_GREEN:{id:'skiff-green',x:17.5,z:48.7},
  BARGE:{id:'barge',x:.4,z:56.5},
};
// Native local mesh bounds identify the walking skin independently of world
// wave pose. "Lowest" can select a buried hull; "highest" can select a roof.
const deckBounds={
  high:{
    WORKBOAT:[[-4.6,.66,-1.45],[4.7,.72,1.45]],
    LAUNCH:[[-3.2,.52,-1.05],[3.3,.57,1.05]],
    SKIFF_RED:[[-1.5,.04,-.45],[1.6,.08,.45]],
    SKIFF_GREEN:[[-1.5,.04,-.45],[1.6,.08,.45]],
    BARGE:[[-5.9,.70,-2.2],[5.9,.74,2.2]],
  },
  low:{
    WORKBOAT:[[-4.95,-.6,-1.55],[4.95,.75,1.55]],
    LAUNCH:[[-3.45,-.6,-1.15],[3.45,.60,1.15]],
    SKIFF_RED:[[-2.05,-.6,-.70],[2.05,.42,.70]],
    SKIFF_GREEN:[[-2.05,-.6,-.70],[2.05,.42,.70]],
    BARGE:[[-5.95,-.6,-2.25],[5.95,.70,2.25]],
  },
};

function assertDesignatedDeck(r,quality){
  const rigName=r.name.replace('RIG_FERRIS_HARBOR_BOAT_','');
  const expected=deckTracks[rigName];
  const track=r.plannedTrack,deck=r.selectedDeck,bounds=deck?.boundsAtSelection;
  ensure(expected&&r.contactSurface==='designated-deck'&&track?.source==='client/tests/helpers/candidateHarborFleet.ts:FLEET_TRACKS'
    &&track.id===expected.id&&close(track.x,expected.x)&&close(track.z,expected.z),'Missing or changed independent deck track: '+r.name);
  ensure(deck?.selectionRule==='audited-local-deck-bounds'&&Number.isInteger(deck.boxIndex)&&deck.boxIndex>=0
    &&Number.isFinite(deck.heightAtSelection)&&deck.heightAtSelection<.75,'Missing designated low deck identity: '+r.name);
  const expectedBounds=deckBounds[quality][rigName];
  const part=quality==='high'?'DECK_TIMBER_LOD0':rigName==='SKIFF_RED'?'PLANK_RED_LOD1':rigName==='SKIFF_GREEN'?'PLANK_GREEN_LOD1':'HULL_NAVY_LOD1';
  ensure(deck.sourceMeshName===`MESH_FERRIS_HARBOR_BOAT_${rigName}_${part}`
    &&['min','max'].every((key,i)=>Array.isArray(deck.localBounds?.[key])&&deck.localBounds[key].length===3
      &&deck.localBounds[key].every((value,j)=>Number.isFinite(value)&&Math.abs(value-expectedBounds[i][j])<=1e-4)),
    'Selected mesh/local bounds are not the audited walking deck: '+r.name);
  ensure([bounds?.min,bounds?.max].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))
    &&bounds.min.every((v,i)=>v<=bounds.max[i])
    &&(bounds.max[0]-bounds.min[0])*(bounds.max[2]-bounds.min[2])>.8
    &&track.x>=bounds.min[0]&&track.x<=bounds.max[0]&&track.z>=bounds.min[2]&&track.z<=bounds.max[2]
    &&deck.heightAtSelection>=bounds.min[1]-1e-7&&deck.heightAtSelection<=bounds.max[1]+1e-7,'Selected deck bounds do not contain the planned contact: '+r.name);
  ensure(close(deck.spawnDrop,.2)&&close(deck.spawn?.x,track.x)&&close(deck.spawn?.z,track.z)
    &&close(deck.spawn?.feetY,deck.heightAtSelection+.2),'Spawn did not target the designated deck: '+r.name);
  const samples=r.deckSamples;
  ensure(Array.isArray(samples)&&samples.length>25&&samples.every((s,i)=>Number.isFinite(s.elapsedMs)&&s.elapsedMs>1800
    &&(i===0||s.elapsedMs>=samples[i-1].elapsedMs))&&samples.at(-1).elapsedMs-samples[0].elapsedMs>=3000,'Insufficient designated-deck observation duration: '+r.name);
  for(const s of samples){
    ensure(s.deckBoxIndex===deck.boxIndex&&s.onDesignatedDeck===true
      &&Number.isFinite(s.x)&&Number.isFinite(s.z)&&Math.abs(s.x-track.x)<.6&&Math.abs(s.z-track.z)<.6
      &&Number.isFinite(s.feetY)&&Number.isFinite(s.deckHeight)&&s.deckHeight<.75
      &&close(s.contactError,Math.abs(s.feetY-s.deckHeight))&&s.contactError<.06
      &&typeof s.inWater==='boolean'&&typeof s.serverPositionMatched==='boolean','Sample is not on the selected low deck plane: '+r.name);
    const server=s.serverPosition;
    const matched=!!server&&[server.x,server.y,server.z].every(Number.isFinite)
      &&Math.abs(server.x-s.x)<.7&&Math.abs(server.z-s.z)<.7&&Math.abs(server.y-s.feetY)<.3;
    ensure(s.serverPositionMatched===matched&&(!matched||(s.serverRole==='hunter'&&s.serverAlive===true&&s.serverPhase==='active')),
      'Authoritative match flag/state disagrees with raw server position: '+r.name);
  }
  const matchedSamples=samples.filter(s=>s.serverPositionMatched);
  ensure(matchedSamples.length>=30&&close(r.serverMatchedSpanMs,matchedSamples.at(-1).elapsedMs-matchedSamples[0].elapsedMs)
    &&r.serverMatchedSpanMs>=3000,'Authoritative deck contact did not span three seconds: '+r.name);
  ensure(r.outOfDeckSamples===0&&r.contactSamples===samples.filter(s=>s.contactError<.06).length
    &&r.wetSamples===samples.filter(s=>s.inWater).length
    &&r.serverSamples===samples.filter(s=>s.serverPositionMatched).length
    &&close(r.minFeet,Math.min(...samples.map(s=>s.feetY)))&&close(r.maxFeet,Math.max(...samples.map(s=>s.feetY)))
    &&close(r.maxDeckContactError,Math.max(...samples.map(s=>s.contactError))),'Deck summary differs from its specific-plane samples: '+r.name);
}

/** Recompute the bounded live Hunter deck proof, not merely its passed flag. */
export async function assertBoatProof(boats,quality,repoRoot=root){
  ensure(boats?.passed===true&&boats.role==='hunter'&&boats.protocol==='designated-deck-v2','Boat proof needs the designated-deck-v2 living Hunter scenario');
  ensure(['high','low'].includes(quality),'Unexpected boat proof quality');
  const results=boats.results;
  const names=new Set(results?.map(r=>r.name));
  ensure(results?.length===5&&names.size===5&&['WORKBOAT','LAUNCH','BARGE','SKIFF_RED','SKIFF_GREEN'].every(b=>names.has('RIG_FERRIS_HARBOR_BOAT_'+b)),'Incomplete boat roster');
  for(const r of results){
    assertDesignatedDeck(r,quality);
    ensure(r.passed===true&&r.alive===true&&r.serverAlive===true&&r.wetSamples===0
      &&countAbove(r.contactSamples,25)&&countAbove(r.serverSamples,29)
      &&Number.isFinite(r.maxDeckContactError)&&r.maxDeckContactError>=0&&r.maxDeckContactError<.06
      &&Number.isFinite(r.minFeet)&&Number.isFinite(r.maxFeet)&&r.minFeet<=r.maxFeet
      &&r.lowDeckThresholdExercised===true,'Insufficient deck contact/alive samples: '+r.name);
    if(quality==='high'&&r.name.includes('SKIFF_'))ensure(r.minFeet<-.9,'High skiff never crossed the low-deck water threshold: '+r.name);
  }
  await requireScreenshot(boats.file,repoRoot);
}

/** Drowning only. This does not certify a climb-out/escape scenario. */
export async function assertDrowningProof(water,repoRoot=root){
  ensure(water?.passed===true,'Water proof did not pass');
  const setup=water.setup;
  ensure(setup?.phase==='active'&&setup.localRole==='hunter'&&setup.serverRole==='hunter'
    &&setup.localAlive===true&&setup.serverAlive===true&&typeof setup.sessionId==='string'&&setup.sessionId.length>0,'Water setup is not a living active Hunter');
  const samples=water.samples,events=water.events;
  ensure(Array.isArray(samples)&&samples.length>=3&&samples.every((s,i)=>Number.isFinite(s.elapsedMs)&&s.elapsedMs>=0&&(i===0||s.elapsedMs>=samples[i-1].elapsedMs)),'Water samples missing or unordered');
  const clientEntry=samples.find(s=>s.client?.inWater===true);
  const serverEntry=samples.find(s=>s.server&&s.server.z>=47.01&&s.server.feetY<=-.9);
  ensure(clientEntry&&serverEntry&&water.clientEnteredMs===clientEntry.elapsedMs&&water.serverEnteredMs===serverEntry.elapsedMs,'Water entry timestamps do not match raw samples');
  ensure(clientEntry.client.isAlive===true&&clientEntry.client.role==='hunter'
    &&serverEntry.server.isAlive===true&&serverEntry.server.role==='hunter','Water entry must precede the Hunter death transition');
  ensure(samples.some(s=>s.jumpHeld===true&&s.client?.isAlive===true),'Held-jump drowning scenario was not exercised');
  ensure(Array.isArray(events)&&events.length===1&&events[0].payload?.victimSessionId===setup.sessionId,'Expected exactly one drowning event for this Hunter');
  const event=events[0],final=water.final,last=samples.at(-1);
  ensure(Number.isFinite(event.elapsedMs)&&event.elapsedMs>=clientEntry.elapsedMs&&event.elapsedMs>=serverEntry.elapsedMs
    &&event.elapsedMs<=15000&&water.clientEntryToEventMs===event.elapsedMs-clientEntry.elapsedMs
    &&water.serverObservedEntryToEventMs===event.elapsedMs-serverEntry.elapsedMs,'Drowning event does not follow both observed water entries');
  // Normal elimination changes the dead player to SPECTATOR on the server and
  // then the client; requiring a dead Hunter would reject the real death flow.
  const terminal=s=>s?.client?.isAlive===false&&s?.server?.isAlive===false
    &&s.client.role==='spectator'&&s.server.role==='spectator'&&s.server.health===0;
  ensure(terminal(final)&&terminal(last)&&final.elapsedMs===last.elapsedMs&&final.elapsedMs>=event.elapsedMs,'Final client/server spectator death state is missing or inconsistent');
  const start=water.startPosition;
  ensure(start&&water.waterCandidates?.some(c=>c.position?.x===start.x&&c.position?.z===start.z&&c.position?.feetY===start.feetY&&c.blockingColliders?.length===0),'Drowning fall column was not shown to be free of dry support');
  await requireScreenshot(water.file,repoRoot);
}

async function main(){
const gate=arg('--gate'),reviewPath=arg('--review');
await checkReport(gate,{assetDir:path.join(stage,'assets')});
const inventory=await assetInventory(path.join(stage,'assets'));
const productionInventory=await assetInventory(path.join(root,'client/public/assets/maps/harbor-v2'));
const file=path.join(stage,'assets/zones/ferris-harbor.glb'),bytes=await readFile(file),digest=hash(bytes);
ensure(hash(await readFile(path.join(stage,'ferris-harbor-runtime.glb')))===digest,'Candidate differs from finalized GLB');
for(const asset of inventory.filter(a=>a.relative!=='zones/ferris-harbor.glb'))
  ensure(productionInventory.some(p=>p.relative===asset.relative&&p.sha256===asset.sha256),'Unrelated zone changed: '+asset.relative);
const production=path.join(root,'client/public/assets/maps/harbor-v2/zones/ferris-harbor.glb');
const previous=await readFile(production),previousHash=hash(previous);
const parity=await readJSON(path.join(stage,'parity-report.json'));
ensure(parity.passed===true&&parity.runtimeSHA256===digest&&parity.productionSHA256===previousHash
  &&parity.paritySchemaVersion===2&&parity.uniqueNodeNames===true&&parity.originalSceneRoots?.length>0
  &&Array.isArray(parity.materialExtensionSnapshots)
  &&parity.allOriginalGeometryRigMetadataMaterialsUnchanged===true&&parity.addedNodes?.length===5,'Original geometry/material parity is missing or stale');
const metricsPath=path.join(stage,'ferris-harbor-runtime.metrics.json'),metrics=await readJSON(metricsPath);
ensure(metrics.passed===true&&metrics.errors?.length===0&&metrics.sha256===digest&&metrics.payloadBytes===bytes.length,'Native budget/geometry validation missing or stale');
const review=await readJSON(reviewPath),sourceSHA256=(await sourceFingerprint(root)).sha256;
ensure(review.reviewedBy==='Codex visual QA'&&review.visualPassed===true&&review.candidateSHA256===digest
  &&review.sourceSHA256===sourceSHA256,'Manual review is missing or stale');
ensure(Array.isArray(review.reports)&&review.reports.length>=4,'Four backend/tier captures required');
const combinations=new Set();let boatHigh=false,boatLow=false,waterWebGPU=false,waterWebGL=false;
for(const entry of review.reports){
  const report=await readJSON(path.resolve(root,entry));
  ensure(report.sourceSHA256===sourceSHA256&&report.consoleErrors?.length===0&&report.candidateRequests?.length===9,'Browser source/asset loading/errors failed');
  ensure(report.presets?.every(s=>s.rendererStats?.quality===report.quality),'Live quality mismatch');
  for(const asset of inventory)ensure(report.candidateRequests.some(a=>a.relative===asset.relative&&a.sha256===asset.sha256),'Browser loaded different '+asset.relative);
  for(const preset of ['workboatDetail','fleetDetail'])ensure(report.presets.some(s=>s.preset===preset),'Missing boat art camera '+preset);
  for(const shot of report.presets)await requireScreenshot(shot.file,root);
  ensure(report.boats?.passed!==false&&report.water?.passed!==false,'Auxiliary physics browser check explicitly failed');
  if(report.boats?.passed===true){
    await assertBoatProof(report.boats,report.quality);
    boatHigh ||= report.quality==='high'; boatLow ||= report.quality==='low';
  }
  if(report.water?.passed===true){await assertDrowningProof(report.water);waterWebGPU ||= report.backend==='webgpu';waterWebGL ||= report.backend==='webgl2';}
  combinations.add(`${report.backend}:${report.quality}`);
}
for(const backend of ['webgpu','webgl2'])for(const tier of ['high','low'])ensure(combinations.has(`${backend}:${tier}`),'Missing backend/tier');
ensure(boatHigh&&boatLow,'Need all-five live boat contact/alive checks on High and Low');
ensure(waterWebGPU&&waterWebGL,'Need live held-jump drowning checks on both backends; escape is not covered');
const valid=await validateBytes(new Uint8Array(bytes),{ignoredIssues:['MESH_PRIMITIVE_GENERATED_TANGENT_SPACE']});
ensure(valid.issues.numErrors===0,'Invalid glTF');
if(process.argv.includes('--check-only')){
  console.log(JSON.stringify({passed:true,checkOnly:true,sha256:digest,sourceSHA256}));
}else{
  const backup=path.join(stage,`pre-rp04-${previousHash.slice(0,12)}.glb`);
  await writeFile(backup,previous,{flag:'wx'}).catch(async error=>{if(error.code!=='EEXIST')throw error;ensure(hash(await readFile(backup))===previousHash,'Rollback collision');});
  const oldMetrics=await readFile(production.replace(/\.glb$/,'.metrics.json'));
  await writeFile(backup.replace(/\.glb$/,'.metrics.json'),oldMetrics,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  // Recheck immediately before the sole in-scope production mutation.
  ensure(hash(await readFile(production))===previousHash,'Production changed during review');
  await writeFile(production,bytes);await writeFile(production.replace(/\.glb$/,'.metrics.json'),JSON.stringify(metrics,null,2)+'\n');
  await mkdir(reportRoot,{recursive:true});
  await writeFile(path.join(reportRoot,'promotion.json'),JSON.stringify({promotedAt:new Date().toISOString(),sha256:digest,
    beforeSHA256:previousHash,bytes:bytes.length,backup:path.relative(root,backup),gate:path.relative(root,gate),
    review:path.relative(root,reviewPath),sourceSHA256,scope:'Fleet fittings only: one GLB changed, eight unchanged. Bounded physics/browser checks, not whole-island realism or stable60FPS certification.'},null,2)+'\n');
  console.log('Promoted verified Fleet GLB; rollback '+backup);
}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
