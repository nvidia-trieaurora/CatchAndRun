import * as THREE from "three";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";
import {
  anisotropyForQuality,
  disposeMapAsset,
  MapAssetLoader,
  prepareMapAsset,
} from "../src/game/world/assets/MapAssetLoader";

describe("MapAssetLoader", () => {
  it("clamps texture anisotropy per quality tier and renderer limit", () => {
    expect(anisotropyForQuality("low", 16)).toBe(1);
    expect(anisotropyForQuality("medium", 16)).toBe(4);
    expect(anisotropyForQuality("high", 16)).toBe(16);
    expect(anisotropyForQuality("high", 8)).toBe(8);
    expect(anisotropyForQuality("high")).toBe(1);

    const root = new THREE.Group();
    const map = new THREE.Texture();
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 });
    const wall = new THREE.MeshStandardMaterial({ map, aoMap: new THREE.Texture() });
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(), wall);
    wallMesh.name = "MESH_WAREHOUSE_WALL_LOD0";
    const glassMesh = new THREE.Mesh(new THREE.BoxGeometry(), glass);
    glassMesh.name = "MESH_WAREHOUSE_SC02_ROOF_GLASS_LOD0";
    root.add(wallMesh, glassMesh);

    prepareMapAsset(root, "high", { maxAnisotropy: 8 });

    expect(map.anisotropy).toBe(8);
    expect(wall.aoMapIntensity).toBeCloseTo(0.85);
    expect(glass.depthWrite).toBe(false);
  });

  it("extracts movement colliders and markers while preserving render meshes", () => {
    const root = new THREE.Group();
    const renderMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial(),
    );
    renderMesh.name = "MESH_WAREHOUSE_WALL";

    const collisionMesh = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2, 6),
      new THREE.MeshBasicMaterial(),
    );
    collisionMesh.name = "COL_MOVE_WALL";
    collisionMesh.position.set(3, 1, -2);

    const marker = new THREE.Object3D();
    marker.name = "MARKER_PROP_SPAWN_00";
    marker.position.set(1, 2, 3);

    root.add(renderMesh, collisionMesh, marker);
    root.updateMatrixWorld(true);

    const asset = prepareMapAsset(root);

    expect(asset.colliders).toHaveLength(1);
    expect(asset.colliders[0].min.toArray()).toEqual([1, 0, -5]);
    expect(asset.colliders[0].max.toArray()).toEqual([5, 2, 1]);
    expect(asset.markers.get("MARKER_PROP_SPAWN_00")?.toArray()).toEqual([1, 2, 3]);
    expect(collisionMesh.visible).toBe(false);
    expect(marker.visible).toBe(false);
    expect(renderMesh.castShadow).toBe(true);
    expect(renderMesh.receiveShadow).toBe(true);
  });

  it("keeps tiny emissive and ground-detail meshes out of the shadow pass", () => {
    const root = new THREE.Group();
    const structure = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    structure.name = "MESH_WAREHOUSE_WALL_LOD0";
    const sign = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    sign.name = "MESH_WAREHOUSE_SC04_SIGN_LETTERS";
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(), new THREE.MeshStandardMaterial());
    puddle.name = "MESH_PUDDLE_00";
    const lampGlow = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    lampGlow.name = "MESH_LAMP_LIGHT_00";
    root.add(structure, sign, puddle, lampGlow);

    prepareMapAsset(root);

    expect(structure.castShadow).toBe(true);
    expect(sign.castShadow).toBe(false);
    expect(puddle.castShadow).toBe(false);
    expect(lampGlow.castShadow).toBe(false);
  });

  it("disposes cloned geometry and materials during map teardown", () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    root.add(new THREE.Mesh(geometry, material));

    disposeMapAsset(root);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("selects simplified LOD1 meshes for the low quality tier", () => {
    const root = new THREE.Group();
    const lod0 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    lod0.name = "MESH_WAREHOUSE_STEEL_LOD0";
    const lod1 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    lod1.name = "MESH_WAREHOUSE_STEEL_LOD1";
    root.add(lod0, lod1);

    prepareMapAsset(root, "low");

    expect(lod0.parent).toBeNull();
    expect(lod1.parent).toBe(root);
    expect(lod1.castShadow).toBe(true);
  });

  it("collapses repeated authored meshes into an InstancedMesh", () => {
    const root = new THREE.Group();
    const first = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial(),
    );
    first.userData.instanceKey = "cargo-crate";
    first.position.x = 2;
    const second = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial(),
    );
    second.userData.instanceKey = "cargo-crate";
    second.position.x = 8;
    root.add(first, second);

    prepareMapAsset(root);

    const instances = root.getObjectByName("INSTANCE_cargo-crate");
    expect(instances).toBeInstanceOf(THREE.InstancedMesh);
    expect((instances as THREE.InstancedMesh).count).toBe(2);
    expect(first.parent).toBeNull();
    expect(second.parent).toBeNull();
  });

  it("keeps the V1 fallback available when GLB loading fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loader = {
      loadAsync: vi.fn().mockRejectedValue(new Error("offline")),
    } as unknown as GLTFLoader;
    const mapAssetLoader = new MapAssetLoader("/missing.glb", loader);

    await expect(mapAssetLoader.preload()).resolves.toBe(false);

    expect(mapAssetLoader.isReady()).toBe(false);
    expect(mapAssetLoader.createInstance()).toBeNull();
    warning.mockRestore();
  });

  it("clones textures so teardown does not invalidate the cached template", async () => {
    const template = new THREE.Group();
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    template.add(
      new THREE.Mesh(new THREE.BoxGeometry(), material),
      new THREE.Mesh(new THREE.BoxGeometry(), material),
    );
    const loader = {
      loadAsync: vi.fn().mockResolvedValue({ scene: template }),
    } as unknown as GLTFLoader;
    const mapAssetLoader = new MapAssetLoader("/warehouse.glb", loader);
    await mapAssetLoader.preload();

    const instance = mapAssetLoader.createInstance();
    if (!instance) throw new Error("Expected a loaded Warehouse instance");
    const firstMesh = instance.root.children[0] as THREE.Mesh;
    const secondMesh = instance.root.children[1] as THREE.Mesh;
    const instanceMaterial = firstMesh.material as THREE.MeshStandardMaterial;

    expect(instanceMaterial.map).not.toBe(texture);
    expect(secondMesh.material).toBe(instanceMaterial);
    disposeMapAsset(instance.root);
    expect(material.map).toBe(texture);
  });
});
