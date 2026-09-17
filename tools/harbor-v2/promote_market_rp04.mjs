/** Explicit final step, after native budgets, exact-candidate movement and browser QA.
 * Usage: node tools/harbor-v2/promote_market_rp04.mjs --gate <summary.json> --review <visual-review.json>
 * Only Market is replaced; rollback is content-addressed and never overwritten.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkReport, assetInventory, sourceFingerprint } from './verify_asset_pipeline.mjs';
import { validateBytes } from 'gltf-validator';

const root=fileURLToPath(new URL('../../',import.meta.url));
const stage=path.join(root,'art-source/harbor-v2/_staging/market-rp04');
const reportRoot=path.join(root,'docs/v2/harbor/market-rp04');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(condition,message)=>{if(!condition)throw new Error(message);};
const arg=name=>{const i=process.argv.indexOf(name);fail(i>0 && process.argv[i+1],`Required ${name}`);return path.resolve(process.argv[i+1]);};
const gate=arg('--gate'),reviewPath=arg('--review');
await checkReport(gate,{assetDir:path.join(stage,'assets')});
const inventory=await assetInventory(path.join(stage,'assets'));
const bytes=await readFile(path.join(stage,'assets/zones/container-bd.glb'));
const digest=hash(bytes);
fail(hash(await readFile(path.join(stage,'container-bd-runtime.glb')))===digest,'Finalized candidate differs from tested inventory');
const metricPath=path.join(stage,'container-bd-runtime.metrics.json');
const metrics=JSON.parse(await readFile(metricPath,'utf8'));
fail(metrics.passed && metrics.errors.length===0 && metrics.sha256===digest && metrics.payloadBytes===bytes.length,'Native budget/geometry validation missing or stale');
const review=JSON.parse(await readFile(reviewPath,'utf8'));
fail(review.reviewedBy==='Codex visual QA' && review.visualPassed===true && review.candidateSHA256===digest,'Explicit visual review missing or for different candidate');
fail(Array.isArray(review.reports)&&review.reports.length>=4,'Expected High/Low browser reviews on both backends');
const combinations=new Set();
const sourceSHA256=(await sourceFingerprint(root)).sha256;
for(const entry of review.reports) {
  const report=JSON.parse(await readFile(path.resolve(root,entry),'utf8'));
  fail(report.consoleErrors.length===0 && report.candidateRequests?.length===9,'Browser errors or incomplete candidate loading');
  fail(report.boats?.passed!==false && report.water?.passed!==false,'An auxiliary browser audit explicitly failed');
  fail(report.sourceSHA256===sourceSHA256,'Browser review source changed; rerun the capture');
  fail(report.presets.every(item=>item.rendererStats?.quality===report.quality),'Reported quality does not match the live renderer');
  for(const asset of inventory) fail(report.candidateRequests.some(item=>item.relative===asset.relative && item.sha256===asset.sha256),'Browser used different asset: '+asset.relative);
  fail(report.presets.some(item=>item.preset==='harborMarketFront') && report.presets.some(item=>item.preset==='harborMarketInterior'),'Missing exterior/interior browser inspection');
  for(const shot of report.presets) fail((await stat(path.resolve(root,shot.file))).size>0,'Missing browser screenshot');
  combinations.add(`${report.backend}:${report.quality}`);
}
for(const backend of ['webgpu','webgl2'])for(const quality of ['high','low'])fail(combinations.has(`${backend}:${quality}`),'Missing browser/backend/tier combination');
const validation=await validateBytes(new Uint8Array(bytes),{ignoredIssues:['MESH_PRIMITIVE_GENERATED_TANGENT_SPACE']});
fail(validation.issues.numErrors===0,'glTF validation failed');
const production=path.join(root,'client/public/assets/maps/harbor-v2/zones/container-bd.glb');
const previous=await readFile(production);
const backup=path.join(stage,`pre-rp04-${hash(previous).slice(0,12)}.glb`);
await writeFile(backup,previous,{flag:'wx'}).catch(async error=>{
  if(error.code!=='EEXIST')throw error;
  fail(hash(await readFile(backup))===hash(previous),'Rollback path collision');
});
await writeFile(production,bytes);
await writeFile(production.replace(/\.glb$/,'.metrics.json'),JSON.stringify(metrics,null,2)+'\n');
await mkdir(reportRoot,{recursive:true});
await writeFile(path.join(reportRoot,'promotion.json'),JSON.stringify({promotedAt:new Date().toISOString(),sha256:digest,
  beforeSHA256:hash(previous),bytes:bytes.length,backup:path.relative(root,backup),gate:path.relative(root,gate),
  review:path.relative(root,reviewPath),nativeValidation:path.relative(root,metricPath),
  scope:'Only container-bd Market asset. Other eight map GLBs unchanged. Bounded QA, not an exhaustive world proof.'},null,2)+'\n');
console.log('Promoted exact reviewed Market bytes. Rollback: '+backup);
