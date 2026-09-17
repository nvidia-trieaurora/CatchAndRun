import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, unlink, utimes, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  ASSETS, REQUIRED_SOURCES, TEST_GROUPS, REPO_ROOT, assetInventory, checkReport, executeChild, parseArgs, runVerification, staticCoverage,
} from '../verify_asset_pipeline.mjs';

// Synthetic files/reports below exercise runner failure handling only. Integration
// with real GLBs/controllers is a separate actual CLI run, not mocked proof.
function glb() {
  const text = Buffer.from(JSON.stringify({ asset: { version: '2.0' } }));
  const n = Math.ceil(text.length / 4) * 4, out = Buffer.alloc(20 + n, 0x20);
  out.write('glTF', 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(n, 12); out.writeUInt32LE(0x4e4f534a, 16); text.copy(out, 20);
  return out;
}
async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'harbor runner test with spaces-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repoRoot = path.join(root, 'repository with spaces');
  for (const file of REQUIRED_SOURCES) {
    await mkdir(path.dirname(path.join(repoRoot, file)), { recursive: true });
    await writeFile(path.join(repoRoot, file), file.endsWith('StaticAssetGateCoverage.json')
      ? await readFile(path.join(REPO_ROOT, file)) : '// unit fixture');
  }
  await mkdir(path.join(repoRoot, 'shared/src'), { recursive: true });
  await mkdir(path.join(repoRoot, 'server/src'), { recursive: true });
  const assetDir = path.join(root, 'candidate assets with spaces');
  const production = path.join(repoRoot, 'client/public/assets/maps/harbor-v2');
  for (const dir of [assetDir, production]) for (const file of ASSETS) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), glb());
  }
  return { root, repoRoot, assetDir, production, outDir: path.join(root, 'report with spaces') };
}
async function fakeExecute(f, options = {}) {
  return async command => {
    f.calls ??= []; f.calls.push(command);
    const args = command.args;
    const isStatic = args.includes('--negative-controls');
    const reportPath = args[args.indexOf(isStatic ? '--report' : '--outputFile') + 1];
    const id = path.basename(reportPath, '.json');
    if (options.failChild === id) return { code: 7, stdout: '', stderr: 'injected child failure' };
    if (options.missingReport === id) return { code: 0, stdout: '', stderr: '' };
    let report;
    if (isStatic) {
      const coverage = staticCoverage(f.repoRoot);
      const tier = () => ({ passed: true, probes: coverage.probeNames.map(name => ({ name, passed: true })),
        controls: coverage.controlNames.map(name => ({ name, baselinePassed: true, detected: true, restored: true, passed: true })) });
      report = { schema: 'StaticAssetGate/v1', passed: true, changedInputs: [],
        inventory: await assetInventory(f.assetDir), qualities: { high: tier(), low: tier() },
        summary: { probes: coverage.probeNames.length * 2, controls: coverage.controlNames.length * 2, failedProbes: 0, failedControls: 0 } };
      if (options.noControls) report.qualities.low.controls = [];
      if (options.wrongAssetHash) report.inventory[0].sha256 = 'not-the-selected-bytes';
      if (options.duplicateProbe) report.qualities.high.probes[1].name = report.qualities.high.probes[0].name;
      if (options.wrongControl) report.qualities.low.controls[0].name = 'unrelated_control';
      if (options.truncatedStatic) {
        for (const tier of Object.values(report.qualities)) {
          tier.probes = tier.probes.slice(0, 1); tier.controls = tier.controls.slice(0, 1);
        }
        report.summary.probes = 2; report.summary.controls = 2;
      }
    } else {
      const group = TEST_GROUPS.find(item => item.id === id);
      const testResults = group.files.map(file => ({ name: path.join(f.repoRoot, group.workspace, file), status: 'passed',
        assertionResults: Array.from({ length: options.noTests ? 0 : (group.requiredTitles?.[file]?.length ?? (group.id === 'candidate-movement' ? 24 : 1)) }, (_, i) => ({
          title: group.requiredTitles?.[file]?.[i] ?? `fixture ${i}`, status: options.skipped && i === 0 ? 'pending' : 'passed',
          ancestorTitles: [`real asset movement verification (${f.assetDir})`],
        })) }));
      if (id === 'candidate-movement') {
        if (options.missingMarketSuite) {
          const index = testResults.findIndex(suite => suite.name.endsWith('HarborMarketMovement.test.ts'));
          if (index >= 0) testResults.splice(index, 1);
        }
        const market = testResults.find(suite => suite.name.endsWith('HarborMarketMovement.test.ts'));
        if (options.duplicateMarketCase && market?.assertionResults.length > 1) market.assertionResults[1].title = market.assertionResults[0].title;
        if (options.missingMarketCase && market) market.assertionResults.pop();
        if (options.wrongMarketRoot && market) for (const assertion of market.assertionResults) assertion.ancestorTitles = ['production only'];
        const fleet = testResults.find(suite => suite.name.endsWith('HarborFleetMovement.test.ts'));
        if (options.missingFleetSuite && fleet) testResults.splice(testResults.indexOf(fleet), 1);
        if (options.duplicateFleetCase && fleet?.assertionResults.length > 1) fleet.assertionResults[1].title = fleet.assertionResults[0].title;
        if (options.missingFleetCase && fleet) fleet.assertionResults.pop();
        if (options.wrongFleetRoot && fleet) for (const assertion of fleet.assertionResults) assertion.ancestorTitles = ['production only'];
        const chain = testResults.find(suite => suite.name.endsWith('BoatObjectSupportChain.test.ts'));
        if (options.missingChainCase && chain) chain.assertionResults.pop();
      }
      const count = testResults.reduce((sum, suite) => sum + suite.assertionResults.length, 0);
      report = { success: true, numFailedTests: 0, numFailedTestSuites: 0, numPendingTests: 0, numTodoTests: 0,
        numTotalTests: count, numPassedTests: count, testResults };
    }
    await writeFile(reportPath, JSON.stringify(report));
    if (options.staleChild === id) await utimes(reportPath, new Date(0), new Date(0));
    if (options.sourceChanges && id === 'production-regressions') await writeFile(path.join(f.repoRoot, 'client/src/game/controllers/HunterController.ts'), 'changed during run');
    return { code: 0, stdout: 'unit fixture only', stderr: '' };
  };
}

test('spaces survive argument boundaries and a completed report remains explicitly non-promotable', async t => {
  const f = await fixture(t), execute = await fakeExecute(f);
  const result = await runVerification(f, { repoRoot: f.repoRoot, execute });
  assert.equal(result.passed, true, result.summary.errors.join('; ')); assert.equal(result.summary.readyToPromote, false);
  assert.match(result.summary.remaining.join(' '), /visual.*Browser/);
  assert.equal(f.calls[0].args[f.calls[0].args.indexOf('--asset-dir') + 1], f.assetDir);
  assert.equal(f.calls[1].env.HARBOR_VERIFY_ASSET_ROOT, f.assetDir);
  assert.ok(f.calls[1].args.includes('tests/HarborMarketMovement.test.ts'), 'candidate stage must actually execute the Market suite');
  const movement = TEST_GROUPS.find(group => group.id === 'candidate-movement');
  assert.equal(movement.minimumTests, 104);
  assert.ok(f.calls[1].args.includes('tests/HarborFleetMovement.test.ts'));
  assert.ok(f.calls[1].args.includes('tests/BoatObjectSupportChain.test.ts'));
  for (const vessel of ['workboat', 'launch', 'skiff-red', 'skiff-green', 'barge']) {
    const cases = movement.requiredTitles['tests/HarborFleetMovement.test.ts'].filter(title => title.includes(` ${vessel}:`));
    assert.equal(cases.length, 6, `${vessel} needs both tiers of Hunter, Prop and loose-object movement`);
  }
  assert.equal(movement.requiredTitles['tests/BoatObjectSupportChain.test.ts'].length, 10);
  const ceilingCases = movement.requiredTitles['tests/HarborMarketMovement.test.ts']
    .filter(title => title.includes('sampled ceiling details preserve jump clearance'));
  assert.deepEqual(ceilingCases.map(title => title.split(':')[0]), ['high hunter', 'high prop', 'low hunter', 'low prop']);
  assert.equal(f.calls[2].env.HARBOR_VERIFY_ASSET_ROOT, undefined);
  assert.equal(f.calls[3].cwd, path.join(f.repoRoot, 'server'));
  assert.match(result.summary.children[2].coverage, /NOT proof/);
  assert.equal((await checkReport(result.summaryPath, {}, { repoRoot: f.repoRoot })).passed, true);
});

test('missing staged GLB fails before starting children; never falls back to production', async t => {
  const f = await fixture(t); await unlink(path.join(f.assetDir, ASSETS[1]));
  const result = await runVerification(f, { repoRoot: f.repoRoot, execute: await fakeExecute(f) });
  assert.equal(result.passed, false); assert.equal(result.summary.children.length, 0);
  assert.match(result.summary.errors[0], /ENOENT/);
});

test('malformed staged GLB fails the inventory gate', async t => {
  const f = await fixture(t); await writeFile(path.join(f.assetDir, ASSETS[0]), 'not a GLB');
  const result = await runVerification(f, { repoRoot: f.repoRoot, execute: await fakeExecute(f) });
  assert.equal(result.passed, false); assert.match(result.summary.errors[0], /Invalid GLB/);
});

for (const [name, injected, expected] of [
  ['subprocess failure', { failChild: 'candidate-movement' }, /subprocess failed/],
  ['missing child report', { missingReport: 'candidate-movement' }, /ENOENT/],
  ['stale child report', { staleChild: 'candidate-movement' }, /stale child report/],
  ['no tests executed', { noTests: true }, /unexecuted suite/],
  ['skipped assertions', { skipped: true }, /incomplete assertions/],
  ['negative controls omitted', { noControls: true }, /negative controls/],
  ['audit ran different bytes', { wrongAssetHash: true }, /did not test selected bytes/],
  ['duplicate probe substitutes for a required probe', { duplicateProbe: true }, /coverage/],
  ['unrelated control substitutes for a required control', { wrongControl: true }, /coverage/],
  ['sources change during run', { sourceChanges: true }, /Source fingerprint changed/],
  ['Market candidate suite omitted', { missingMarketSuite: true }, /missing test suites/],
  ['Market movement case duplicated instead of running another', { duplicateMarketCase: true }, /named movement coverage/],
  ['Market movement case omitted with adjusted total counts', { missingMarketCase: true }, /named movement coverage/],
  ['Market suite silently tests production instead of candidate', { wrongMarketRoot: true }, /selected asset root/],
  ['Fleet candidate suite omitted', { missingFleetSuite: true }, /missing test suites/],
  ['Fleet boat case duplicated', { duplicateFleetCase: true }, /named movement coverage/],
  ['Fleet boat case omitted with adjusted counts', { missingFleetCase: true }, /named movement coverage/],
  ['Fleet suite silently tests production', { wrongFleetRoot: true }, /selected asset root/],
  ['Fleet support-chain case omitted', { missingChainCase: true }, /named movement coverage/],
]) test(`${name} cannot produce a passing summary`, async t => {
  const f = await fixture(t);
  const result = await runVerification(f, { repoRoot: f.repoRoot, execute: await fakeExecute(f, injected) });
  assert.equal(result.passed, false); assert.match(result.summary.errors[0], expected);
  await assert.rejects(checkReport(result.summaryPath, {}, { repoRoot: f.repoRoot }), /not a completed/);
});

for (const [name, mutate, expected] of [
  ['changed asset', async f => { const file = path.join(f.assetDir, ASSETS[0]); const bytes = await readFile(file); bytes[bytes.length - 1] ^= 1; await writeFile(file, bytes); }, /selected asset hashes/],
  ['missing asset', async f => unlink(path.join(f.assetDir, ASSETS[0])), /ENOENT/],
  ['changed source', async f => writeFile(path.join(f.repoRoot, 'client/src/game/controllers/HunterController.ts'), 'new code'), /source fingerprint/],
  ['changed Market movement verification', async f => writeFile(path.join(f.repoRoot, 'client/tests/HarborMarketMovement.test.ts'), 'new Market tests'), /source fingerprint/],
  ['changed Fleet movement verification', async f => writeFile(path.join(f.repoRoot, 'client/tests/HarborFleetMovement.test.ts'), 'new Fleet tests'), /source fingerprint/],
  ['changed exact boat surface sampler', async f => writeFile(path.join(f.repoRoot, 'client/src/game/world/SupportSurfaces.ts'), 'new sampler'), /source fingerprint/],
  ['changed production-only fixture', async f => { const file = path.join(f.production, ASSETS[0]); const bytes = await readFile(file); bytes[bytes.length - 1] ^= 1; await writeFile(file, bytes); }, /production\/default-test assets/],
  ['missing child report', async f => unlink(path.join(f.outDir, 'candidate-movement.json')), /ENOENT/],
  ['modified child report', async f => writeFile(path.join(f.outDir, 'candidate-movement.json'), '{}'), /Changed child report/],
]) test(`freshness rejects ${name}`, async t => {
  const f = await fixture(t), result = await runVerification(f, { repoRoot: f.repoRoot, execute: await fakeExecute(f) });
  assert.equal(result.passed, true); await mutate(f); await assert.rejects(checkReport(result.summaryPath, {}, { repoRoot: f.repoRoot }), expected);
});

test('reusing a nonempty output directory cannot borrow old reports', async t => {
  const f = await fixture(t); await mkdir(f.outDir); await writeFile(path.join(f.outDir, 'static-audit.json'), '{}');
  await assert.rejects(runVerification(f, { repoRoot: f.repoRoot }), /must be empty/);
});

test('no CLI skip/no-test option exists, and malformed CLI exits nonzero', () => {
  assert.throws(() => parseArgs(['--no-test-run']), /Unknown option/);
  assert.throws(() => parseArgs(['--asset-dir']), /missing value/);
  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, 'tools/harbor-v2/verify_asset_pipeline.mjs'), '--no-test-run'], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /Unknown option/);
});

test('real subprocess preserves a space-containing path as one literal argument', async t => {
  const f = await fixture(t);
  const result = await executeChild({ executable: process.execPath,
    args: ['-e', 'process.stdout.write(JSON.stringify({cwd:process.cwd(),arg:process.argv[1]}))', '--', f.assetDir],
    cwd: f.repoRoot, env: { ...process.env }, timeoutMs: 5000 });
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), { cwd: f.repoRoot, arg: f.assetDir });
});

test('a truncated static report cannot pass even when its summary counts are adjusted', async t => {
  const f = await fixture(t);
  const result = await runVerification(f, { repoRoot: f.repoRoot, execute: await fakeExecute(f, { truncatedStatic: true }) });
  assert.equal(result.passed, false); assert.match(result.summary.errors[0], /coverage/);
});

test('freshness refuses another checkout even if that old checkout is unchanged', async t => {
  const f = await fixture(t), result = await runVerification(f, { repoRoot: f.repoRoot, execute: await fakeExecute(f) });
  assert.equal(result.passed, true);
  await assert.rejects(checkReport(result.summaryPath), /different checkout/);
});
