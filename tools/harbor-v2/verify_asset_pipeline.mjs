#!/usr/bin/env node
/** Bounded, read-only asset gate. Never promotes assets or substitutes for visual/performance QA. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ASSETS = ['warehouse.glb', 'cinematic/harbor-cinematic.glb', ...[
  'garden-ac', 'construction-ad', 'ferris-harbor', 'container-bd', 'operations-ab', 'response-station', 'rescue-quay',
].map(zone => `zones/${zone}.glb`)];
export const REQUIRED_SOURCES = [
  'package.json', 'package-lock.json', 'client/package.json', 'client/vite.config.ts', 'client/vitest.config.ts',
  'server/package.json', 'server/vitest.config.ts',
  'server/tests/systems/BoatWaterIntegration.test.ts', 'server/tests/systems/WaterMovementIntegration.test.ts',
  'server/tests/systems/EnvironmentalHazards.test.ts',
  'tools/harbor-v2/verify_asset_pipeline.mjs', 'tools/harbor-v2/audit_structural_routes.ts',
  'tools/harbor-v2/StaticAssetGateCoverage.json',
  'client/tests/AssetMovementVerification.test.ts', 'client/tests/HarborMarketMovement.test.ts',
  'client/tests/MapAssetGroupedLod.test.ts', 'client/tests/helpers/assetMovementProbe.ts',
  'client/tests/HarborFleetMovement.test.ts', 'client/tests/BoatObjectSupportChain.test.ts',
  'client/tests/BoatCollisionDetailTag.test.ts', 'client/tests/BoatSupportSurface.test.ts',
  'client/tests/helpers/candidateHarborFleet.ts',
  'client/src/game/controllers/HunterController.ts', 'client/src/game/controllers/PropController.ts',
  'client/src/game/controllers/GroundCollision.ts', 'client/src/game/controllers/WaterSwim.ts',
  'client/src/game/world/SupportSurfaces.ts', 'client/src/game/world/zones/BoatCollisionRig.ts', 'client/src/game/GameManager.ts',
  'client/src/game/world/assets/MapAssetLoader.ts', 'client/src/game/world/zones/harborZones.ts',
  'client/public/assets/maps/harbor-v2/warehouse.manifest.json',
];
// Named coverage prevents a passing total made from duplicate/easier scenarios.
// Additional tests may run, but every bounded contract below must execute once
// for each quality/body combination against the selected candidate asset root.
const movementTitles = names => ['high hunter', 'high prop', 'low hunter', 'low prop']
  .flatMap(subject => names.map(name => `${subject}: ${name}`));
const fleetNames = ['workboat', 'launch', 'skiff-red', 'skiff-green', 'barge'];
export const TEST_GROUPS = [
  { id: 'candidate-movement', workspace: 'client', files: ['tests/AssetMovementVerification.test.ts', 'tests/HarborMarketMovement.test.ts',
    'tests/HarborFleetMovement.test.ts', 'tests/BoatObjectSupportChain.test.ts'], minimumTests: 104,
    requiredTitles: {
      'tests/AssetMovementVerification.test.ts': movementTitles([
        'visible wall blocks a long movement frame; removing its collider is detected',
        'real side doorway is traversable; an invisible blocker is detected',
        'roof top catches a fall; removing the physical roof is detected',
        'roof underside stops a jump; a raised collider that allows clipping is detected',
        'a real boat deck supports the actor; removing dynamic colliders is detected',
        'assembled rescue lane stays walkable; a leftover old tree collider is detected',
      ]),
      'tests/HarborMarketMovement.test.ts': movementTitles([
        'front door admits the body on three tracks; an invisible door blocker fails',
        'all five shop aisles stay walkable; a hidden shelf in the centre aisle fails',
        'stockroom and office doors admit the actor; a closed invisible room box fails',
        'front glazing blocks a 200 ms movement frame; removing its physical owner fails',
        'grocery shelving is solid; deleting its gameplay box exposes clipping',
        'the roof catches a fall on the exported surface; a missing roof collider fails',
        'jumping from a shelf cannot pierce the suspended ceiling; a raised proxy fails',
        'sampled ceiling details preserve jump clearance; lowered trim is detected',
        'the roof hatch is open for a falling body; an invisible hatch cap fails',
        'the authored stockroom ladder reaches the roof; missing ladder metadata fails',
      ]),
      'tests/HarborFleetMovement.test.ts': [
        ...['high hunter', 'high prop', 'low hunter', 'low prop'].flatMap(subject => fleetNames.map(boat =>
          `${subject} ${boat}: moving deck and dry jump stay safe; leaving or deleting support drowns`)),
        ...['high', 'low'].flatMap(tier => fleetNames.map(boat =>
          `${tier} object ${boat}: real duplicate rides the deck; deleting vessel supports exposes the fall`)),
      ],
      'tests/BoatObjectSupportChain.test.ts': [
        ...['high', 'low'].flatMap(tier => [false, true].map(reverse =>
          `'${tier}' keeps stacked duplicates separate (reverse creation: ${reverse}), never self-supported`)),
        ...["'high' 'hunter'", "'high' 'prop'", "'low' 'hunter'", "'low' 'prop'"].map(subject =>
          `${subject} rides a carried duplicate exactly once but an airborne actor is not carried`),
        ...['hunter', 'prop'].map(role =>
          `high ${role} stays dry and can jump from a thin ring supported by the actual lowered skiff`),
      ],
    },
    coverage: 'Selected asset root: bounded High/Low Hunter/Prop Market routes and all five moving vessel decks, loose objects, stack/rider carry and dry jumps with negative controls. Not exhaustive or live network proof.' },
  { id: 'production-regressions', workspace: 'client', files: ['tests/MovementCollision.test.ts', 'tests/BoatCollisionRig.test.ts',
    'tests/WaterSwim.test.ts', 'tests/harborWater.test.ts', 'tests/CollisionSpatialIndex.test.ts',
    'tests/GameManagerCollisionLifecycle.test.ts', 'tests/AssetMovementProbe.test.ts', 'tests/MapAssetGroupedLod.test.ts',
    'tests/BoatCollisionDetailTag.test.ts', 'tests/BoatSupportSurface.test.ts'], minimumTests: 10,
    coverage: 'Existing generic/default-production tests; NOT proof of the selected candidate GLBs.' },
  { id: 'server-water-regressions', workspace: 'server', files: ['tests/systems/BoatWaterIntegration.test.ts',
    'tests/systems/WaterMovementIntegration.test.ts', 'tests/systems/EnvironmentalHazards.test.ts'], minimumTests: 3,
    coverage: 'Existing server movement/hazard integration on default map contracts; NOT candidate GLB or live multiplayer-network verification.' },
];
const sha = value => createHash('sha256').update(value).digest('hex');
const invariant = (condition, message) => { if (!condition) throw new Error(message); };
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function assetInventory(root) {
  const resolved = await realpath(root);
  return Promise.all(ASSETS.map(async relative => {
    const file = await realpath(path.join(resolved, relative)), bytes = await readFile(file);
    invariant(bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'glTF'
      && bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length, `Invalid GLB header: ${file}`);
    return { relative, path: file, bytes: bytes.length, sha256: sha(bytes) };
  }));
}

export async function sourceFingerprint(repoRoot) {
  for (const file of REQUIRED_SOURCES) invariant((await stat(path.join(repoRoot, file))).isFile(), `Missing source: ${file}`);
  const files = new Set(REQUIRED_SOURCES);
  async function walk(relative) {
    const directory = path.join(repoRoot, relative);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '__pycache__') continue;
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && /\.(ts|tsx|js|mjs|json|py|glsl|wgsl)$/.test(entry.name)) files.add(child);
    }
  }
  for (const directory of ['client/src', 'client/tests', 'server/src', 'server/tests', 'shared/src', 'tools/harbor-v2']) await walk(directory);
  const inventory = await Promise.all([...files].sort().map(async relative => ({
    path: relative, sha256: sha(await readFile(path.join(repoRoot, relative))),
  })));
  return { sha256: sha(JSON.stringify(inventory)), files: inventory };
}

export async function executeChild({ executable, args, cwd, env, timeoutMs = 180000 }) {
  return new Promise(resolve => {
    const child = spawn(executable, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false, spawnError;
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', error => { spawnError = error.message; });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    const hardTimer = setTimeout(() => { if (timedOut) child.kill('SIGKILL'); }, timeoutMs + 5000);
    child.once('close', (code, signal) => {
      clearTimeout(timer); clearTimeout(hardTimer);
      resolve({ code, signal, stdout, stderr, timedOut, ...(spawnError ? { spawnError } : {}) });
    });
  });
}

export function staticCoverage(repoRoot = REPO_ROOT) {
  const coverage = JSON.parse(readFileSync(path.join(repoRoot, 'tools/harbor-v2/StaticAssetGateCoverage.json'), 'utf8'));
  invariant(coverage.schema === 'StaticAssetGateCoverage/v1', 'Invalid static coverage contract');
  for (const key of ['probeNames', 'controlNames']) invariant(Array.isArray(coverage[key]) && coverage[key].length > 0
    && coverage[key].every(name => typeof name === 'string' && name.length > 0)
    && new Set(coverage[key]).size === coverage[key].length, `Invalid static coverage contract: ${key}`);
  return coverage;
}

export function validateStaticReport(report, inventory, coverage = staticCoverage()) {
  invariant(report.schema === 'StaticAssetGate/v1' && report.passed === true, 'Static audit did not pass');
  invariant(Array.isArray(report.changedInputs) && report.changedInputs.length === 0, 'Static audit inputs changed');
  invariant(Array.isArray(report.inventory) && report.inventory.length === inventory.length, 'Static audit asset inventory missing/incomplete');
  for (const expected of inventory) {
    const actual = report.inventory.find(entry => path.resolve(entry.path) === expected.path);
    invariant(actual && actual.sha256 === expected.sha256 && actual.bytes === expected.bytes,
      `Static audit did not test selected bytes: ${expected.relative}`);
  }
  let probes = 0, controls = 0;
  for (const tier of ['high', 'low']) {
    const result = report.qualities?.[tier];
    invariant(result?.passed === true && result.probes?.length > 0 && result.controls?.length > 0,
      `Missing ${tier} static probes or negative controls`);
    for (const [field, expected] of [['probes', coverage.probeNames], ['controls', coverage.controlNames]]) {
      const names = result[field].map(item => item.name);
      invariant(names.length === expected.length && new Set(names).size === names.length
        && equal([...names].sort(), [...expected].sort()), `${tier} static ${field} coverage does not match the named contract`);
    }
    invariant(result.probes.every(probe => probe.passed === true), `Failed ${tier} static probe`);
    invariant(result.controls.every(control => control.passed === true && control.baselinePassed === true
      && control.detected === true && control.restored === true), `Invalid ${tier} negative control`);
    probes += result.probes.length; controls += result.controls.length;
  }
  invariant(report.summary?.probes === probes && report.summary?.controls === controls
    && report.summary.failedProbes === 0 && report.summary.failedControls === 0, 'Static audit summary count mismatch');
  return { probes, controls };
}

export function validateTestReport(report, group, repoRoot, assetRoot) {
  invariant(report.success === true && report.numFailedTests === 0 && report.numFailedTestSuites === 0,
    `${group.id}: child tests did not pass`);
  invariant((report.numPendingTests ?? 0) === 0 && (report.numTodoTests ?? 0) === 0,
    `${group.id}: skipped/todo tests cannot pass verification`);
  const suites = report.testResults;
  invariant(Array.isArray(suites) && suites.length === group.files.length, `${group.id}: missing test suites`);
  let count = 0;
  for (const relative of group.files) {
    const suite = suites.find(item => path.resolve(item.name) === path.join(repoRoot, group.workspace, relative));
    invariant(suite?.status === 'passed' && suite.assertionResults?.length > 0, `${group.id}: unexecuted suite ${relative}`);
    invariant(suite.assertionResults.every(item => item.status === 'passed'), `${group.id}: incomplete assertions`);
    count += suite.assertionResults.length;
    if (group.id === 'candidate-movement') {
      invariant(suite.assertionResults.every(item => JSON.stringify(item.ancestorTitles).includes(assetRoot)),
        'Movement tests did not identify the selected asset root');
      const titles = suite.assertionResults.map(item => item.title);
      for (const title of group.requiredTitles[relative]) invariant(titles.filter(actual => actual === title).length === 1,
        `${group.id}: named movement coverage is missing or duplicated in ${relative}: ${title}`);
    }
  }
  invariant(count >= group.minimumTests && report.numTotalTests === count && report.numPassedTests === count,
    `${group.id}: no-test/partial-test run cannot pass (${count} assertions)`);
  return { suites: suites.length, tests: count };
}

export async function runVerification(options = {}, dependencies = {}) {
  const repoRoot = await realpath(dependencies.repoRoot ?? REPO_ROOT), execute = dependencies.execute ?? executeChild;
  let outDir;
  if (options.outDir) {
    outDir = path.resolve(options.outDir); await mkdir(outDir, { recursive: true });
    invariant((await readdir(outDir)).length === 0, `Output directory must be empty to prevent stale reports: ${outDir}`);
  } else outDir = await mkdtemp(path.join(os.tmpdir(), 'harbor-asset-verify-'));
  const summary = {
    schema: 'HarborAssetVerification/v1', startedAt: new Date().toISOString(), status: 'failed', headlessPassed: false,
    readyToPromote: false, remaining: ['Manual visual review in the actual game', 'Browser/backend and performance QA'],
    scope: 'Bounded static probes and controller scenarios; not exhaustive island verification.',
    repoRoot, outDir, assetRoot: path.resolve(options.assetDir ?? path.join(repoRoot, 'client/public/assets/maps/harbor-v2')),
    productionRoot: path.join(repoRoot, 'client/public/assets/maps/harbor-v2'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch }, children: [], errors: [],
  };
  const summaryPath = path.join(outDir, 'summary.json');
  try {
    summary.assetRoot = await realpath(summary.assetRoot);
    summary.productionRoot = await realpath(summary.productionRoot);
    summary.assets = await assetInventory(summary.assetRoot);
    // Legacy tests may ignore a candidate root. Record the actual production bytes separately.
    summary.productionAssets = await assetInventory(summary.productionRoot);
    summary.sources = await sourceFingerprint(repoRoot);
    async function runChild(id, args, cwd, env) {
      const startedAt = Date.now(), reportPath = path.join(outDir, `${id}.json`);
      const command = { executable: process.execPath, args: args(reportPath), cwd, env };
      const result = await execute(command);
      await writeFile(path.join(outDir, `${id}.stdout.log`), result.stdout ?? '');
      await writeFile(path.join(outDir, `${id}.stderr.log`), result.stderr ?? '');
      const child = { id, executable: command.executable, args: command.args, cwd, startedAt,
        endedAt: Date.now(), code: result.code, signal: result.signal ?? null, timedOut: !!result.timedOut, reportPath };
      summary.children.push(child);
      invariant(result.code === 0 && !result.timedOut && !result.spawnError, `${id}: subprocess failed (${result.code ?? result.spawnError ?? result.signal})`);
      const reportBytes = await readFile(reportPath);
      invariant((await stat(reportPath)).mtimeMs >= startedAt - 5, `${id}: stale child report`);
      child.reportSHA256 = sha(reportBytes);
      return { child, report: JSON.parse(reportBytes.toString()) };
    }
    const cleanEnv = { ...process.env };
    delete cleanEnv.HARBOR_VERIFY_ASSET_ROOT; delete cleanEnv.HARBOR_STRUCTURAL_STAGING;
    const audit = await runChild('static-audit', output => [path.join(repoRoot, 'node_modules/vite-node/vite-node.mjs'),
      '--config', path.join(repoRoot, 'client/vite.config.ts'), path.join(repoRoot, 'tools/harbor-v2/audit_structural_routes.ts'),
      '--asset-dir', summary.assetRoot, '--report', output, '--negative-controls'], repoRoot, cleanEnv);
    audit.child.coverage = 'Selected asset root, both quality tiers with in-memory negative controls.';
    audit.child.verified = validateStaticReport(audit.report, summary.assets, staticCoverage(repoRoot));
    for (const group of TEST_GROUPS) {
      const env = group.id === 'candidate-movement' ? { ...cleanEnv, HARBOR_VERIFY_ASSET_ROOT: summary.assetRoot } : cleanEnv;
      const child = await runChild(group.id, output => [path.join(repoRoot, 'node_modules/vitest/vitest.mjs'),
        'run', '--maxWorkers=2', '--config', path.join(repoRoot, group.workspace, 'vitest.config.ts'), ...group.files, '--reporter=json', '--outputFile', output],
      path.join(repoRoot, group.workspace), env);
      child.child.coverage = group.coverage;
      child.child.verified = validateTestReport(child.report, group, repoRoot, summary.assetRoot);
    }
    invariant(equal(summary.assets, await assetInventory(summary.assetRoot)), 'Selected asset hashes changed during verification');
    invariant(equal(summary.productionAssets, await assetInventory(summary.productionRoot)), 'Production/default-test asset hashes changed during verification');
    invariant(summary.sources.sha256 === (await sourceFingerprint(repoRoot)).sha256, 'Source fingerprint changed during verification');
    summary.headlessPassed = true; summary.status = 'bounded-headless-pass';
  } catch (error) { summary.errors.push(error.message); }
  summary.finishedAt = new Date().toISOString();
  await writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n');
  return { passed: summary.headlessPassed, summaryPath, summary };
}

/** Read-only freshness check: never upgrades a failed report or runs missing tests. */
export async function checkReport(file, options = {}, dependencies = {}) {
  const summary = await json(path.resolve(file));
  invariant(summary.schema === 'HarborAssetVerification/v1' && summary.headlessPassed === true
    && summary.status === 'bounded-headless-pass' && summary.readyToPromote === false && summary.errors?.length === 0,
  'Report is not a completed bounded headless pass');
  const repoRoot = await realpath(dependencies.repoRoot ?? REPO_ROOT);
  invariant(await realpath(summary.repoRoot) === repoRoot, 'Report belongs to a different checkout');
  const assetRoot = await realpath(options.assetDir ?? summary.assetRoot);
  invariant(assetRoot === summary.assetRoot, 'Report belongs to a different asset root');
  invariant(equal(summary.assets, await assetInventory(assetRoot)), 'Stale report: selected asset hashes changed');
  invariant(equal(summary.productionAssets, await assetInventory(summary.productionRoot)), 'Stale report: production/default-test assets changed');
  invariant(summary.sources.sha256 === (await sourceFingerprint(repoRoot)).sha256, 'Stale report: source fingerprint changed');
  invariant(summary.children?.length === 1 + TEST_GROUPS.length, 'Missing child verification reports');
  for (const id of ['static-audit', ...TEST_GROUPS.map(group => group.id)]) {
    const child = summary.children.find(item => item.id === id);
    invariant(child?.code === 0 && child.verified && child.timedOut === false, `Missing successful ${id} run`);
    const bytes = await readFile(child.reportPath);
    invariant(sha(bytes) === child.reportSHA256, `Changed child report: ${id}`);
    const report = JSON.parse(bytes.toString());
    if (id === 'static-audit') validateStaticReport(report, summary.assets, staticCoverage(repoRoot));
    else validateTestReport(report, TEST_GROUPS.find(group => group.id === id), repoRoot, assetRoot);
  }
  return { passed: true, summaryPath: path.resolve(file), status: 'fresh-bounded-headless-pass', readyToPromote: false, remaining: summary.remaining };
}

export function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') { result.help = true; continue; }
    const key = { '--asset-dir': 'assetDir', '--out-dir': 'outDir', '--check-report': 'checkReport' }[flag];
    invariant(key && args[i + 1] && !args[i + 1].startsWith('--'), `Unknown option or missing value: ${flag}`);
    invariant(!result[key], `Duplicate option: ${flag}`); result[key] = args[++i];
  }
  invariant(!(result.checkReport && result.outDir), '--check-report is read-only; do not pass --out-dir');
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log('Usage: node tools/harbor-v2/verify_asset_pipeline.mjs [--asset-dir <complete harbor-v2 root>] [--out-dir <empty report directory>]\nFreshness only: --check-report <summary.json> [--asset-dir <same root>]\nDefault asset root is production; default output is a unique temporary directory. No asset writes/promotion.');
    else {
      const result = options.checkReport ? await checkReport(options.checkReport, options) : await runVerification(options);
      console.log(JSON.stringify({ passed: result.passed, report: result.summaryPath,
        status: result.status ?? result.summary.status, errors: result.summary?.errors,
        readyToPromote: false, remaining: result.remaining ?? result.summary.remaining }, null, 2));
      if (!result.passed) process.exitCode = 1;
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
