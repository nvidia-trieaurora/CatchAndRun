/** Guarded local asset integration after manual review. No deployment/commit. */
import assert from 'node:assert/strict';
import {readFileSync,copyFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const stage='art-source/harbor-v2/_staging/visual-qa-rp05';
const source=`${stage}/asset/response-station.glb`;
const target='client/public/assets/maps/harbor-v2/zones/response-station.glb';
const sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
assert.ok(process.argv.includes('--reviewed'),'Open export/runtime/frame evidence first, then pass --reviewed');
const baseline=JSON.parse(readFileSync(`${stage}/baseline/provenance.json`));
const validation=JSON.parse(readFileSync(`${stage}/asset/validation.json`));
const comparison=JSON.parse(readFileSync(`${stage}/candidate-final-comparison.json`));
const capture=JSON.parse(readFileSync(`${stage}/candidate-final/report.json`));
assert.equal(sha(target),baseline.assetHashes[target],'Production changed since baseline: stop, do not overwrite');
assert.ok(validation.passed&&comparison.performancePassed&&!capture.failure&&capture.finishedAt);
assert.equal(sha(source),validation.sha256,'Candidate changed since validation');
assert.equal(capture.servedCandidates.length,2,'Both clients must have rendered candidate');
assert.ok(capture.servedCandidates.every(r=>r.sha256===validation.sha256),'Candidate differs from rendered bytes');
const oldHash=sha(target);copyFileSync(source,target);
writeFileSync(`${stage}/promotion.json`,JSON.stringify({localOnly:true,target,oldHash,newHash:sha(target),
  recoverableOriginal:`${stage}/baseline/original/${target}`,reviewedAt:new Date().toISOString(),
  limitations:['Not a deployment or full-map approval. Existing unrelated server test failures remain.']},null,2));
console.log('Locally integrated',target,sha(target));
