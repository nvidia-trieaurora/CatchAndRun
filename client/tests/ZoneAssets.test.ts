import { existsSync, statSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  carveGeometryInsideBox,
  prepareMapAsset,
} from "../src/game/world/assets/MapAssetLoader";
import {
  HARBOR_ZONE_ASSETS,
  activeHarborZoneAssets,
  resolveHarborZoneSource,
  zoneAssetUrl,
} from "../src/game/world/zones/harborZones";

function meshWithZone(name: string, zone: string, position: THREE.Vector3): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.name = name;
  mesh.userData.harborZone = zone;
  mesh.position.copy(position);
  return mesh;
}

describe("Harbor edge-zone overrides", () => {
  const garden = HARBOR_ZONE_ASSETS.find((asset) => asset.id === "garden-ac");
  if (!garden) throw new Error("garden-ac zone asset missing");

  it("carves only the triangles whose centroid lies inside the box", () => {
    // two unit boxes side by side, merged into one geometry
    const left = new THREE.BoxGeometry(1, 1, 1).translate(-2, 0, 0);
    const right = new THREE.BoxGeometry(1, 1, 1).translate(2, 0, 0);
    const merged = new THREE.BufferGeometry();
    const leftPos = left.toNonIndexed().getAttribute("position");
    const rightPos = right.toNonIndexed().getAttribute("position");
    const positions = new Float32Array(leftPos.array.length + rightPos.array.length);
    positions.set(leftPos.array as Float32Array, 0);
    positions.set(rightPos.array as Float32Array, leftPos.array.length);
    merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial());

    const removed = carveGeometryInsideBox(
      mesh,
      new THREE.Box3(new THREE.Vector3(-4, -2, -2), new THREE.Vector3(0, 2, 2)),
    );

    expect(removed).toBe(12);
    const remaining = mesh.geometry.getAttribute("position");
    expect(remaining.count).toBe(36);
    for (let i = 0; i < remaining.count; i++) {
      expect(remaining.getX(i)).toBeGreaterThan(0);
    }
  });

  it("drops legacy zone nodes and carves merged LOD1 batches inside the carve box", () => {
    const root = new THREE.Group();
    // (no LOD suffix on the legacy nodes so the assertion isolates the zone
    // override from the tier-based LOD filtering that follows it)
    const houseShell = meshWithZone("residential_MESH_plaster", "residential", new THREE.Vector3(-35, 4, 22));
    const pondRim = meshWithZone("garden-detail_MESH_concrete", "garden-detail", new THREE.Vector3(-48, 0.3, 38));
    const oldLawn = meshWithZone("base_MESH_foliage_LOD0", "base", new THREE.Vector3(-40, 0.1, 31));
    const seawallPost = meshWithZone("MESH_RAIL_POST_-42_47", "base", new THREE.Vector3(-42, 1.2, 47));
    // merged map-wide roof batch: one cube in the garden box, one far away
    const roofGeometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed().translate(-35, 12, 22);
    const farGeometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed().translate(40, 6, -20);
    const positions = new Float32Array(roofGeometry.getAttribute("position").array.length * 2);
    positions.set(roofGeometry.getAttribute("position").array as Float32Array, 0);
    positions.set(farGeometry.getAttribute("position").array as Float32Array, roofGeometry.getAttribute("position").array.length);
    const mergedRoof = new THREE.Mesh(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3)),
      new THREE.MeshStandardMaterial(),
    );
    mergedRoof.name = "harbor_MESH_roof_LOD1";
    mergedRoof.userData.harborZone = "residential";
    root.add(houseShell, pondRim, oldLawn, seawallPost, mergedRoof);

    // low tier keeps LOD1 batches, which is exactly where merged carving matters
    prepareMapAsset(root, "low", { zoneOverrides: [garden.override] });

    expect(houseShell.parent).toBeNull();
    expect(pondRim.parent).toBeNull();
    expect(oldLawn.parent).toBeNull();
    expect(seawallPost.parent).toBe(root);
    expect(mergedRoof.parent).toBe(root);
    expect(mergedRoof.geometry.getAttribute("position").count).toBe(36);
  });

  it("carves named cross-zone batches only above the ground threshold", () => {
    const construction = HARBOR_ZONE_ASSETS.find((asset) => asset.id === "construction-ad");
    if (!construction) throw new Error("construction-ad zone asset missing");
    // map-wide concrete LOD1: a ground slab at y 0..0.2 and an old frame floor at y 3.2 inside the zone
    const ground = new THREE.BoxGeometry(4, 0.2, 4).toNonIndexed().translate(-35, 0.1, -22);
    const floor = new THREE.BoxGeometry(4, 0.3, 4).toNonIndexed().translate(-35, 3.2, -22);
    const merged = new Float32Array(ground.getAttribute("position").array.length * 2);
    merged.set(ground.getAttribute("position").array as Float32Array, 0);
    merged.set(floor.getAttribute("position").array as Float32Array, ground.getAttribute("position").array.length);
    const batch = new THREE.Mesh(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(merged, 3)),
      new THREE.MeshStandardMaterial(),
    );
    batch.name = "harbor_MESH_concrete_LOD1";
    batch.userData.harborZone = "base";
    const root = new THREE.Group();
    root.add(batch);

    prepareMapAsset(root, "low", { zoneOverrides: [construction.override] });

    expect(batch.parent).toBe(root);
    const remaining = batch.geometry.getAttribute("position");
    expect(remaining.count).toBe(36);
    for (let i = 0; i < remaining.count; i++) {
      expect(remaining.getY(i)).toBeLessThan(0.3);
    }
  });

  it("only turns the zone's own COL_MOVE_<ZONE>_ boxes into colliders", () => {
    const root = new THREE.Group();
    const lawn = meshWithZone("MESH_GARDEN_BASE_LAWN_LOD0", "residential", new THREE.Vector3(-40, 0.06, 31));
    const canopy = meshWithZone("MESH_GARDEN_IMPACT_FOLIAGE_LEAF_CLUSTER_SWAY_CANOPY_LOD0", "residential", new THREE.Vector3(-49, 6, 24));
    // a 1.2 x 25.6 x 1.2 crane-mast collider authored beside its lattice visual
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 25.6, 1.2), new THREE.MeshStandardMaterial());
    mast.name = "COL_MOVE_CONSTRUCTION_CRANE_MAST";
    mast.userData.harborZone = "construction";
    mast.position.set(-48, 12.8, -31);
    // the crane's interior ladder: a collider that is also climbable from +z
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.6, 24.28, 0.3), new THREE.MeshStandardMaterial());
    ladder.name = "COL_LADDER_CONSTRUCTION_CRANE_LADDER";
    ladder.userData.harborZone = "construction";
    ladder.userData.ladderApproach = "+z";
    ladder.position.set(-48, 12.26, -31.38);
    root.add(lawn, canopy, mast, ladder);

    const asset = prepareMapAsset(root, "high");

    expect(asset.colliders).toHaveLength(2);
    expect(asset.colliders[0].min.x).toBeCloseTo(-48.6);
    expect(asset.colliders[0].max.y).toBeCloseTo(25.6);
    expect(asset.ladders).toHaveLength(1);
    expect(asset.ladders[0].approach).toBe("+z");
    expect(asset.ladders[0].box.max.y).toBeCloseTo(24.4);
    expect(mast.parent).toBeNull(); // collider boxes never render
    expect(ladder.parent).toBeNull();
    expect(asset.markers.size).toBe(0);
    expect(lawn.castShadow).toBe(false);
    expect(canopy.castShadow).toBe(false);
    expect(canopy.userData.weaponImpactKind).toBe("foliage");
  });

  it("resolves the staging candidate only behind the explicit query flag", () => {
    expect(resolveHarborZoneSource("")).toBe("production");
    expect(resolveHarborZoneSource("?harborZones=staging")).toBe("staging");
    expect(resolveHarborZoneSource("?harborZones=off")).toBe("off");
    expect(zoneAssetUrl(garden, "production")).toMatch(/^\/assets\/maps\/harbor-v2\/zones\/garden-ac\.glb(\?v=[\w-]+)?$/);
    expect(zoneAssetUrl(garden, "staging")).toBe("/staging-assets/garden-ac-candidate.glb");
  });

  it("requests unpromoted candidates only from staging, never in production", () => {
    expect(activeHarborZoneAssets("off")).toEqual([]);
    expect(activeHarborZoneAssets("staging").map((asset) => asset.id)).toEqual(
      HARBOR_ZONE_ASSETS.map((asset) => asset.id),
    );
    const production = activeHarborZoneAssets("production");
    expect(production.every((asset) => asset.promoted)).toBe(true);
    for (const asset of HARBOR_ZONE_ASSETS) {
      expect(production.includes(asset)).toBe(asset.promoted);
    }
  });

  it("ships a production GLB for every promoted zone", () => {
    for (const asset of HARBOR_ZONE_ASSETS.filter((zone) => zone.promoted)) {
      const file = path.resolve(__dirname, "../public", asset.url.replace(/^\//, "").replace(/\?.*$/, ""));
      expect(existsSync(file), `${asset.id} promoted but ${file} is missing`).toBe(true);
      expect(statSync(file).size).toBeLessThanOrEqual(6 * 1024 * 1024);
    }
  });
});
