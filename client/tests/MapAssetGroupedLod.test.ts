import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";
import { prepareMapAsset } from "../src/game/world/assets/MapAssetLoader";
import { resolveWeaponImpactKind } from "../src/game/world/weaponImpactSurfaces";

/** Real glTF: multiple material primitives force GLTFLoader to create a Group.
 * Node extras live on that Group, NOT on the generated primitive meshes. */
async function groupedGltf() {
  const vertices = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]);
  const model = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0, 1] }],
    nodes: [0, 1].map((lod) => ({
      name: `MESH_MARKET_PALETTE_LOD${lod}`, mesh: lod,
      extras: { zoneLod: `LOD${lod}`, harborZone: "container-bd", castShadow: false,
        weaponImpactKind: "foliage", ignoreWeaponRaycast: true, dynamicWeaponRaycast: true },
    })),
    // Deliberately unrelated names, as happens after a glTF material palette
    // rewrite; filtering generated primitive names is not a valid LOD oracle.
    meshes: [0, 1].map((lod) => ({ name: `palette_${lod}`, primitives: [0, 1].map((p) => ({
      attributes: { POSITION: 0 }, material: lod * 2 + p,
    })) })),
    materials: [0, 1, 2, 3].map((i) => ({ name: `slot_${i}` })),
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteLength: vertices.byteLength }],
    buffers: [{ byteLength: vertices.byteLength }],
  };
  const json = Buffer.from(JSON.stringify(model)), padded = Math.ceil(json.length / 4) * 4;
  const glb = Buffer.alloc(28 + padded + vertices.byteLength, 0x20);
  glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded, 12); glb.writeUInt32LE(0x4e4f534a, 16); json.copy(glb, 20);
  glb.writeUInt32LE(vertices.byteLength, 20 + padded); glb.writeUInt32LE(0x004e4942, 24 + padded);
  Buffer.from(vertices.buffer).copy(glb, 28 + padded);
  return (await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), "")).scene;
}

describe("multi-material glTF node LOD selection", () => {
  it.each(["high", "medium", "low"] as const)("%s keeps one entire authored LOD and its primitive render/weapon metadata", async (quality) => {
    const root = await groupedGltf();
    const selectedLod = quality === "low" ? "LOD1" : "LOD0";
    const rejectedLod = quality === "low" ? "LOD0" : "LOD1";
    const kept = root.getObjectByName(`MESH_MARKET_PALETTE_${selectedLod}`);
    const rejected = root.getObjectByName(`MESH_MARKET_PALETTE_${rejectedLod}`);
    if (!kept || !rejected) throw new Error("Missing authored LOD group in fixture");
    expect(kept).toBeInstanceOf(THREE.Group);
    expect(kept.children).toHaveLength(2);
    expect(kept.children.every((part) => part instanceof THREE.Mesh && part.userData.zoneLod === undefined)).toBe(true);
    const rejectedMaterial = vi.spyOn((rejected.children[0] as THREE.Mesh).material as THREE.Material, "dispose");
    const keptMaterial = vi.spyOn((kept.children[0] as THREE.Mesh).material as THREE.Material, "dispose");
    prepareMapAsset(root, quality);
    expect(root.getObjectByName(`MESH_MARKET_PALETTE_${rejectedLod}`) === undefined).toBe(true);
    expect(kept.parent).toBe(root);
    expect(kept.userData.zoneLod).toBe(selectedLod);
    const survivors: THREE.Mesh[] = [];
    root.traverse((object) => { if (object instanceof THREE.Mesh) survivors.push(object as THREE.Mesh); });
    expect(survivors).toHaveLength(2);
    for (const mesh of survivors) {
      expect(mesh.userData.zoneLod).toBe(selectedLod);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.userData.ignoreWeaponRaycast).toBe(true);
      expect(mesh.userData.dynamicWeaponRaycast).toBe(true);
      expect(mesh.userData.weaponImpactKind).toBe("foliage");
      expect(resolveWeaponImpactKind(mesh)).toBe("foliage");
    }
    expect(rejectedMaterial).toHaveBeenCalledOnce();
    expect(keptMaterial).not.toHaveBeenCalled();
  });

  it("selects an untagged LOD Group by its authored name and skips its whole descendant tree", () => {
    const root = new THREE.Group(), high = new THREE.Group(), low = new THREE.Group();
    high.name = "MESH_SIGN_LOD0"; low.name = "MESH_SIGN_LOD1";
    const highPart = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const lowPart = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    highPart.name = "generated_primitive_7";
    // An independently named/tagged descendant cannot survive a rejected parent.
    lowPart.name = "MESH_INTERNAL_LOD0";
    lowPart.userData.zoneLod = "LOD0";
    const incorrectCollider = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    incorrectCollider.name = "COL_MOVE_ONLY_REJECTED_LOD";
    high.add(highPart); low.add(lowPart, incorrectCollider); root.add(high, low);
    const result = prepareMapAsset(root, "high");
    expect(low.parent === null).toBe(true);
    expect(highPart.parent).toBe(high);
    expect(highPart.userData.zoneLod).toBe("LOD0");
    expect(result.colliders).toHaveLength(0);
  });

  it("honors semantic LOD metadata after names are rewritten and preserves explicit child tags", () => {
    const root = new THREE.Group(), kept = new THREE.Group(), rejected = new THREE.Group();
    kept.name = "optimized_palette_17"; kept.userData = { zoneLod: "LOD1", ignoreWeaponRaycast: true, castShadow: false };
    rejected.name = "optimized_palette_18"; rejected.userData.zoneLod = "LOD0";
    const child = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    child.userData.ignoreWeaponRaycast = false;
    child.userData.weaponImpactKind = "water";
    kept.add(child); rejected.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    root.add(kept, rejected);
    prepareMapAsset(root, "low");
    expect(rejected.parent === null).toBe(true);
    expect(child.userData.ignoreWeaponRaycast).toBe(false);
    expect(child.userData.weaponImpactKind).toBe("water");
    expect(child.userData.zoneLod).toBe("LOD1");
    expect(child.castShadow).toBe(false);
  });
});
