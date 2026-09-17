/** Summarize measured runtime reports and fingerprint the actual shipped assets. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = path.join(root, "docs/v2/harbor/island-review/final");
const reports = readdirSync(folder).filter(name => /^rp03-web(?:gl2|gpu)-(?:high|low)-report\.json$/.test(name)).sort();
const runs = reports.map(name => {
  const report = JSON.parse(readFileSync(path.join(folder, name), "utf8"));
  const frames = report.presets.flatMap(view => [view.frameSample, view.panSample].filter(Boolean));
  const shooting = report.shooting.map(shot => ({
    target: shot.target, shots: shot.details.shots, waterImpacts: shot.details.waterImpacts,
    fps: shot.firing.fps, p95Ms: shot.firing.p95Ms, maxMs: shot.firing.maxMs,
    over50Ms: shot.firing.over50Ms, maxHoleWorldSpan: shot.details.maxHoleWorldSpan,
    maxFireCpuMs: Math.max(...shot.details.fireCpuMs), geometryCount: shot.details.geometryCount,
  }));
  return {
    report: name, backend: report.backend, quality: report.quality,
    viewport: report.viewport, audioMuted: report.audioMuted,
    views: report.presets.map(view => view.preset), samples: frames.length,
    minimumFps: Math.min(...frames.map(sample => sample.fps)),
    worstP95Ms: Math.max(...frames.map(sample => sample.p95Ms)),
    longestFrameMs: Math.max(...frames.map(sample => sample.maxMs)),
    framesOver50Ms: frames.reduce((sum, sample) => sum + sample.over50Ms, 0),
    consoleErrors: report.consoleErrors.length, shooting,
  };
});
const assets = ["cinematic/harbor-cinematic", "warehouse", ...[
  "container-bd", "garden-ac", "construction-ad", "operations-ab", "ferris-harbor", "response-station", "rescue-quay",
].map(name => "zones/" + name)].map(name => {
  const relative = `client/public/assets/maps/harbor-v2/${name}.glb`;
  const bytes = readFileSync(path.join(root, relative));
  return { path: relative, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
});
const audit = JSON.parse(readFileSync(path.join(root, "docs/v2/harbor/repair-review/market-rp03/structural-route-audit-after.json"), "utf8"));
const structural = ["high", "low"].map(tier => ({
  tier, probes: audit[tier].length,
  mismatches: audit[tier].filter(p => p.open ? (p.visibleHits.length || p.collisionHits.length) : (!p.visibleHits.length || !p.collisionHits.length)).map(p => p.name),
}));
const recheckName = "rp03-low-jank-recheck-report.json";
const recheck = JSON.parse(readFileSync(path.join(folder, recheckName), "utf8"));
const summary = {
  generatedAt: new Date().toISOString(),
  scope: "Short, isolated local Chrome runs, 1600x900 DPR1. rAF frame samples, not GPU timers or a guarantee for other devices. Audio muted. No simultaneous agent browser, Blender render or build during these final runs.",
  runs,
  lowBoatJankRecheck: {
    report: recheckName,
    note: "A single 66.7ms Low workboat frame was observed in the original pass. Repeated twice with 20s static plus 8s pan and LongTask/LoAF observers; the original cause was not reproduced or proven fixed.",
    samples: recheck.presets.flatMap(view => [view.frameSample, view.panSample]),
  },
  structural, assets,
};
writeFileSync(path.join(folder, "verification-summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
if (runs.some(run => run.consoleErrors) || structural.some(tier => tier.mismatches.length)) process.exitCode = 1;
