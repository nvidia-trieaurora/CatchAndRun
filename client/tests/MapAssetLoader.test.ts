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

  it("honors Blender shadow exclusions even after meshes are merged into palette batches", () => {
    const root = new THREE.Group();
    const detail = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    detail.name = "MESH_OPERATIONS_AB_GRATING_LOD0";
    detail.userData.castShadow = false;
    root.add(detail);
    prepareMapAsset(root);
    expect(detail.castShadow).toBe(false);
    expect(detail.receiveShadow).toBe(true);
  });

  it("releases discarded LOD/collider resources without disposing shared surviving textures", () => {
    const root = new THREE.Group();
    const sharedMap = new THREE.Texture();
    const normalMap = new THREE.Texture();
    const material0 = new THREE.MeshStandardMaterial({ map: sharedMap, normalMap });
    const material1 = new THREE.MeshStandardMaterial({ map: sharedMap });
    const lod0 = new THREE.Mesh(new THREE.BoxGeometry(), material0);
    const lod1 = new THREE.Mesh(new THREE.BoxGeometry(), material1);
    lod0.name = "MESH_WALL_LOD0";
    lod1.name = "MESH_WALL_LOD1";
    root.add(lod0, lod1);
    const discardedGeometry = vi.spyOn(lod0.geometry, "dispose");
    const discardedMaterial = vi.spyOn(material0, "dispose");
    const discardedTexture = vi.spyOn(normalMap, "dispose");
    const sharedTexture = vi.spyOn(sharedMap, "dispose");
    prepareMapAsset(root, "low");
    expect(discardedGeometry).toHaveBeenCalledOnce();
    expect(discardedMaterial).toHaveBeenCalledOnce();
    expect(discardedTexture).toHaveBeenCalledOnce();
    expect(sharedTexture).not.toHaveBeenCalled();
    disposeMapAsset(root);
    expect(sharedTexture).toHaveBeenCalledOnce();
  });

  it("does not bind unused normal and AO maps on low tier", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ normalMap: new THREE.Texture(), aoMap: new THREE.Texture() });
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    prepareMapAsset(root, "low");
    expect(material.normalMap).toBeNull();
    expect(material.aoMap).toBeNull();
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
      first.material,
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

  it("preserves baked prop positions when Blender has applied their transforms", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    for (const x of [-18, -14, -10]) {
      const geometry = new THREE.BoxGeometry(1, 1, 0.2).translate(x, 0.15, 47.7);
      const fender = new THREE.Mesh(geometry, material);
      fender.userData.instanceKey = "fh-fender";
      root.add(fender);
    }
    prepareMapAsset(root);
    const batch = root.getObjectByName("INSTANCE_fh-fender") as THREE.InstancedMesh;
    expect(batch).toBeInstanceOf(THREE.InstancedMesh);
    const matrix = new THREE.Matrix4();
    const bounds = batch.geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(batch.geometry.getAttribute("position") as THREE.BufferAttribute);
    for (const [i, x] of [-18, -14, -10].entries()) {
      batch.getMatrixAt(i, matrix);
      const center = bounds.getCenter(new THREE.Vector3()).applyMatrix4(matrix);
      expect(center.x).toBeCloseTo(x, 5);
    }
  });

  it("does not replace distinct shapes or materials sharing an instance key", () => {
    const root = new THREE.Group();
    const first = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: "red" }));
    const second = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), first.material);
    const third = new THREE.Mesh(first.geometry, new THREE.MeshStandardMaterial({ color: "blue" }));
    for (const mesh of [first, second, third]) mesh.userData.instanceKey = "crate";
    root.add(first, second, third);
    prepareMapAsset(root);
    const red = root.children.find((object) => (object as THREE.Mesh).material === first.material) as THREE.Mesh;
    expect(red).toBeDefined();
    expect(red).not.toBeInstanceOf(THREE.InstancedMesh);
    // Both red boxes survive in one static draw; the blue box keeps its own
    // material. A differently sized variant must never reuse the first shape.
    expect(red.geometry.getAttribute("position").count).toBe(72);
    expect(new THREE.Box3().setFromObject(red).getSize(new THREE.Vector3()).x).toBe(2);
    expect(third.parent).toBe(root);
    expect(root.children).toHaveLength(2);
  });

  it("keeps instanced props attached to their moving rig parent", () => {
    const root = new THREE.Group();
    const rig = new THREE.Group();
    rig.name = "RIG_BOAT";
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    for (const x of [-1, 1]) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = x;
      mesh.userData.instanceKey = "deck-crate";
      rig.add(mesh);
    }
    root.add(rig);
    prepareMapAsset(root);
    const batch = root.getObjectByName("INSTANCE_deck-crate");
    expect(batch?.parent).toBe(rig);
    rig.position.y = 3;
    root.updateMatrixWorld(true);
    expect(batch?.getWorldPosition(new THREE.Vector3()).y).toBe(3);
  });

  it("keeps packed RGB variant batches aligned for WebGPU vertex buffers", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    for (const value of [255, 128]) {
      const geometry = new THREE.BoxGeometry();
      geometry.setAttribute("color", new THREE.Uint8BufferAttribute(new Uint8Array(geometry.getAttribute("position").count * 3).fill(value), 3, true));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.instanceKey = "paint-variant";
      root.add(mesh);
    }
    prepareMapAsset(root);
    const batch = root.children[0] as THREE.Mesh;
    expect(root.children).toHaveLength(1);
    const color = batch.geometry.getAttribute("color");
    // WebGPU requires arrayStride to be a multiple of4. Deinterleaving a
    // padded glTF RGB8 attribute otherwise produces an invalid 3-byte stride.
    expect((color.array.BYTES_PER_ELEMENT * color.itemSize) % 4).toBe(0);
    expect(color.getX(0)).toBeCloseTo(1);
    expect(color.getX(36)).toBeCloseTo(128 / 255);
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
