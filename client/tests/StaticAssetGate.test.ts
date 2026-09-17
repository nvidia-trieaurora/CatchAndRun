import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { assertStaticAssetGateCoverage, evaluateStaticAssetProbe, parseStaticAssetGateArgs } from "../../tools/harbor-v2/StaticAssetGate";
import coverage from "../../tools/harbor-v2/StaticAssetGateCoverage.json";
import { STATIC_ASSET_PROBES } from "../../tools/harbor-v2/StaticAssetGateContracts";
import type { StaticAssetProbe } from "../../tools/harbor-v2/StaticAssetGateContracts";

const open: StaticAssetProbe = {
  name: "fixture_open_door", zone: "fixture", source: "unit fixture: empty 2m doorway",
  origin: [0, 1, 0], direction: [1, 0, 0], far: 2, expectation: "open",
};
const floor: StaticAssetProbe = {
  name: "fixture_floor", zone: "fixture", source: "unit fixture: slab top y=0",
  origin: [0, 1, 0], direction: [0, -1, 0], far: 1.5, expectation: "surface",
  visualCoordinate: 0, collisionCoordinate: 0, tolerance: .001,
};
function slab() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, .2, 2), new THREE.MeshBasicMaterial());
  mesh.position.y = -.1; mesh.name = "fixture_floor_mesh";
  const scene = new THREE.Scene(); scene.add(mesh); scene.updateMatrixWorld(true);
  return { scene, mesh, colliders: [{ name: "fixture_floor_collider", source: "fixture.glb", box: new THREE.Box3().setFromObject(mesh) }] };
}

describe("StaticAssetGate fail-closed evaluator", () => {
  it("keeps the machine-readable coverage contract aligned with actual named probes", () => {
    expect(coverage.schema).toBe("StaticAssetGateCoverage/v1");
    expect(coverage.probeNames).toHaveLength(43);
    expect(coverage.controlNames).toEqual(["missing_floor", "invisible_blocker", "visible_seal"]);
    expect([...STATIC_ASSET_PROBES.map(probe => probe.name)].sort()).toEqual([...coverage.probeNames].sort());
    expect(() => assertStaticAssetGateCoverage()).not.toThrow();
  });
  it("rejects partial, duplicate and renamed probes or negative controls", () => {
    expect(() => assertStaticAssetGateCoverage(coverage.probeNames.slice(0, 1), coverage.controlNames)).toThrow("probe");
    expect(() => assertStaticAssetGateCoverage([...coverage.probeNames.slice(1), coverage.probeNames[1]], coverage.controlNames)).toThrow("probe");
    expect(() => assertStaticAssetGateCoverage(coverage.probeNames, coverage.controlNames.slice(0, 1))).toThrow("control");
    expect(() => assertStaticAssetGateCoverage(coverage.probeNames, ["missing_floor", "invisible_blocker", "replacement"])).toThrow("control");
  });
  it("accepts a genuinely open route and matched support", () => {
    expect(evaluateStaticAssetProbe(open, new THREE.Scene(), []).passed).toBe(true);
    const world = slab();
    expect(evaluateStaticAssetProbe(floor, world.scene, world.colliders).passed).toBe(true);
  });
  it("detects missing visible floor instead of passing on collider alone", () => {
    const world = slab(); world.mesh.visible = false;
    expect(evaluateStaticAssetProbe(floor, world.scene, world.colliders).failures).toContain("missing_visual_surface");
  });
  it("detects invisible blockers even when the ray starts inside the collider", () => {
    const blockers = [{ name: "mutation_invisible_blocker", source: "mutation", box: new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(4, 2, 1)) }];
    const result = evaluateStaticAssetProbe(open, new THREE.Scene(), blockers);
    expect(result.failures).toContain("invisible_blocker");
    expect(result.collisionHits[0].distance).toBe(0);
  });
  it("detects visible seals and reports the mesh name without adding collision", () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.1, 2, 2), new THREE.MeshBasicMaterial());
    mesh.position.set(1, 1, 0); mesh.name = "mutation_visible_seal"; scene.add(mesh); scene.updateMatrixWorld(true);
    const result = evaluateStaticAssetProbe(open, scene, []);
    expect(result.failures).toContain("visible_seal");
    expect(result.visibleHits[0].name).toBe("mutation_visible_seal");
  });
  it("rejects mismatched support height and a missing physical floor", () => {
    const world = slab(); world.colliders[0].box.max.y = .2;
    expect(evaluateStaticAssetProbe(floor, world.scene, world.colliders).failures).toContain("collision_coordinate_mismatch");
    expect(evaluateStaticAssetProbe(floor, world.scene, []).failures).toContain("missing_collision_surface");
  });
  it("rejects misspelled CLI arguments and non-json report targets", () => {
    expect(() => parseStaticAssetGateArgs(["--asset-dr", "/tmp/a"], "/repo")).toThrow("Unknown");
    expect(() => parseStaticAssetGateArgs(["--report", "/tmp/asset.glb"], "/repo")).toThrow(".json");
  });
});
