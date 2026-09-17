import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseStaticAssetGateArgs, runStaticAssetGate, snapshotStaticAssets } from "../../tools/harbor-v2/StaticAssetGate";
import { STATIC_ASSET_PROBES } from "../../tools/harbor-v2/StaticAssetGateContracts";
import coverage from "../../tools/harbor-v2/StaticAssetGateCoverage.json";

const root = path.resolve(__dirname, "../..");
const production = path.join(root, "client/public/assets/maps/harbor-v2");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Isolated candidate root. Every default input is a read-only symlink; no promotion. */
function candidateFixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "StaticAssetGate-"));
  const assetDir = path.join(directory, "assets");
  const sources = snapshotStaticAssets(parseStaticAssetGateArgs(["--asset-dir", production], root));
  for (const source of sources) {
    const target = path.join(assetDir, path.relative(production, source.path));
    mkdirSync(path.dirname(target), { recursive: true }); symlinkSync(source.path, target);
  }
  return { directory, assetDir, sources, cleanup: () => { rmSync(directory, { recursive: true, force: true }); } };
}
function withoutGardenFloor(original: Buffer): Buffer {
  const length = original.readUInt32LE(12);
  const json = JSON.parse(original.subarray(20, 20 + length).toString()) as { nodes: { name?: string; scale?: number[]; translation?: number[] }[] };
  let changed = 0;
  for (const node of json.nodes) {
    if (!node.name?.startsWith("MESH_GARDEN_WOOD_INTERIOR")) continue;
    node.translation = [0, -100, 0]; changed++;
  }
  if (changed < 2) throw new Error("Missing High/Low native floor mutation targets");
  const encoded = Buffer.from(JSON.stringify(json)); const padded = Math.ceil(encoded.length / 4) * 4;
  const bin = original.subarray(20 + length); const output = Buffer.alloc(20 + padded + bin.length, 0x20);
  original.copy(output, 0, 0, 12); output.writeUInt32LE(output.length, 8); output.writeUInt32LE(padded, 12);
  output.writeUInt32LE(0x4e4f534a, 16); encoded.copy(output, 20); bin.copy(output, 20 + padded); return output;
}

describe("StaticAssetGate real candidate integration", () => {
  it("passes all production High/Low routes and catches/restores all three negative controls", async () => {
    const report = await runStaticAssetGate(parseStaticAssetGateArgs(["--asset-dir", production, "--negative-controls"], root));
    expect(report.passed, JSON.stringify(report.qualities)).toBe(true);
    expect(report.summary).toEqual({ probes: STATIC_ASSET_PROBES.length * 2, failedProbes: 0, controls: 6, failedControls: 0 });
    expect(report.changedInputs).toEqual([]);
    for (const asset of report.inventory) expect(asset.sha256).toBe(sha(readFileSync(asset.path)));
    for (const tier of Object.values(report.qualities)) {
      expect(tier.probes.map(probe => probe.name).sort()).toEqual([...coverage.probeNames].sort());
      expect(tier.controls.map(control => control.name)).toEqual(coverage.controlNames);
      for (const control of tier.controls) expect([control.baselinePassed, control.detected, control.restored, control.passed]).toEqual([true, true, true, true]);
      expect(tier.probes.find(probe => probe.name === "house_2f_floor")?.collisionHits[0].source).toContain("oldHarborFortnite");
      expect(tier.probes.find(probe => probe.name === "rescue_watchtower_deck")?.collisionHits[0].name).not.toBe("");
    }
  }, 60_000);

  it("runs the actual CLI against a broken candidate, returns exit 1, and inventories its exact bytes without touching production", () => {
    const fixture = candidateFixture();
    try {
      const overlay = path.join(fixture.directory, "candidate"); mkdirSync(overlay);
      const garden = fixture.sources.find(asset => asset.id === "garden-ac");
      if (!garden) throw new Error("Missing garden fixture");
      const candidate = path.join(overlay, "garden-ac-runtime.glb");
      writeFileSync(candidate, withoutGardenFloor(garden.data));
      const output = path.join(fixture.directory, "report.json");
      const result = spawnSync(process.execPath, [path.join(root, "node_modules/vite-node/vite-node.mjs"), "-c", "client/vite.config.ts",
        "tools/harbor-v2/audit_structural_routes.ts", "--", "--asset-dir", fixture.assetDir, "--candidate-dir", overlay, "--report", output],
      { cwd: root, encoding: "utf8", timeout: 60_000 });
      expect(result.status, result.stderr).toBe(1);
      const report = JSON.parse(readFileSync(output, "utf8")) as Awaited<ReturnType<typeof runStaticAssetGate>>;
      expect(report.passed).toBe(false);
      const input = report.inventory.find(asset => asset.id === "garden-ac");
      expect(input).toMatchObject({ path: realpathSync(candidate), sha256: sha(readFileSync(candidate)), candidate: true });
      for (const tier of Object.values(report.qualities)) {
        expect(tier.probes.find(probe => probe.name === "house_2f_floor")?.failures).toContain("missing_visual_surface");
      }
      for (const asset of fixture.sources) expect(sha(readFileSync(asset.path))).toBe(asset.sha256);
    } finally { fixture.cleanup(); }
  }, 90_000);

  it("rejects incomplete roots and unknown/ambiguous candidate filenames instead of falling back silently", () => {
    const fixture = candidateFixture();
    try {
      const empty = path.join(fixture.directory, "empty"); mkdirSync(empty);
      expect(() => snapshotStaticAssets(parseStaticAssetGateArgs(["--asset-dir", empty], root))).toThrow();
      expect(() => snapshotStaticAssets(parseStaticAssetGateArgs(["--candidate-dir", empty], root))).toThrow("No GLB candidates");
      writeFileSync(path.join(empty, "wrong-zone.glb"), "fixture");
      expect(() => snapshotStaticAssets(parseStaticAssetGateArgs(["--candidate-dir", empty], root))).toThrow("Unrecognized");
      const ambiguous = path.join(fixture.directory, "ambiguous"); mkdirSync(ambiguous);
      writeFileSync(path.join(ambiguous, "garden-ac-runtime.glb"), "fixture");
      writeFileSync(path.join(ambiguous, "garden-ac-candidate.glb"), "fixture");
      expect(() => snapshotStaticAssets(parseStaticAssetGateArgs(["--candidate-dir", ambiguous], root))).toThrow("Ambiguous");
    } finally { fixture.cleanup(); }
  });
});
