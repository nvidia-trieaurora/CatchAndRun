import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const [beforePath,afterPath,outPath]=process.argv.slice(2);
if(!outPath)throw Error('Usage: node tools/visual-qa/compare.mjs BEFORE/report.json AFTER/report.json OUTPUT.json');
const before=JSON.parse(readFileSync(beforePath)),after=JSON.parse(readFileSync(afterPath));
for(const key of ['headless','platform','cpu','osRelease','viewport','dpr','quality','backend','seed'])assert.deepEqual(after[key],before[key],`incomparable ${key}`);
assert.equal(after.browser.product,before.browser.product,'browser changed');
assert.ok(before.finishedAt&&!before.failure&&after.finishedAt&&!after.failure,'incomplete capture');
const rows=before.performance.map(b=>{
  const a=after.performance.find(a=>a.view===b.view);assert.ok(a,`missing ${b.view}`);
  const budget=Math.max(20,b.sample.p95Ms*1.15);
  return {view:b.view,beforeP95Ms:b.sample.p95Ms,afterP95Ms:a.sample.p95Ms,budgetP95Ms:budget,beforeMaxMs:b.sample.maxMs,afterMaxMs:a.sample.maxMs,
    beforeOver50:b.sample.over50,afterOver50:a.sample.over50,
    sceneMeshes:[b.metrics.sceneMeshes,a.metrics.sceneMeshes],sceneTriangles:[b.metrics.triangles,a.metrics.triangles],
    passed:a.sample.p95Ms<=budget&&a.sample.over50<=b.sample.over50+1};
});
const result={beforePath,afterPath,rows,performancePassed:rows.every(r=>r.passed),
  humanVisualSignoffRequired:true,readyToExpand:false,
  caveat:'Short warm local headless rAF samples, not GPU timings/device FPS or proof of every map angle. No pixel-diff auto-pass.'};
writeFileSync(outPath,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
if(!result.performancePassed)process.exitCode=1;
