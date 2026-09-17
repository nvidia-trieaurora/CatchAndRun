/**
 * Fail-closed static asset gate. Never writes production assets.
 * npx vite-node -c client/vite.config.ts tools/harbor-v2/audit_structural_routes.ts --
 *   --asset-dir client/public/assets/maps/harbor-v2 --negative-controls --report /tmp/static-gate.json
 * --candidate-dir optionally overlays flat, named zone runtime GLBs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseStaticAssetGateArgs, runStaticAssetGate } from "./StaticAssetGate";

let output: string | undefined;
try {
  const options = parseStaticAssetGateArgs(process.argv.slice(2), process.cwd());
  output = options.report;
  const report = await runStaticAssetGate(options);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ passed: report.passed, report: output, ...report.summary,
    failures: Object.entries(report.qualities).flatMap(([quality, tier]) => tier.probes.filter(probe => !probe.passed).map(probe => ({ quality, name: probe.name, source: probe.source, failures: probe.failures }))),
    changedInputs: report.changedInputs,
  }, null, 2));
  process.exitCode = report.passed ? 0 : 1;
} catch (error) {
  const report = { schema: "StaticAssetGate/v1", passed: false, generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
  if (output) {
    mkdirSync(path.dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  }
  console.error(JSON.stringify(report)); process.exitCode = 1;
}
