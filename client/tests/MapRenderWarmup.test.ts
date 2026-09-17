import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { MapRenderWarmup } from "../src/game/rendering/MapRenderWarmup";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

function harness() {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  scene.environment = new THREE.Texture();
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.RenderTarget(16, 16);
  let currentTarget: THREE.RenderTarget | null = null;
  const renderer = {
    getRenderTarget: () => currentTarget,
    setRenderTarget: vi.fn((value: THREE.RenderTarget | null) => { currentTarget = value; }),
    compileAsync: vi.fn(async (_objects: THREE.Object3D, _camera: THREE.Camera, _scene: THREE.Scene) => {}),
  };
  return { scene, root, camera, target, renderer };
}

describe("MapRenderWarmup", () => {
  it("prepares offscreen visual resources with the real postprocessing target, without moving or revealing live objects", async () => {
    const h = harness();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.position.set(200, 3, -80);
    h.root.add(mesh);
    h.scene.updateMatrixWorld(true);
    const hidden = new THREE.Group();
    hidden.visible = false;
    hidden.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    h.root.add(hidden);
    const blocked = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    blocked.visible = false;
    h.root.add(blocked);
    const pending = deferred();
    h.renderer.compileAsync.mockImplementation((stage, camera, scene) => {
      expect(h.renderer.getRenderTarget()).toBe(h.target);
      expect(camera).toBe(h.camera);
      expect(scene).toBe(h.scene);
      expect(stage.children).toHaveLength(1);
      const proxy = stage.children[0] as THREE.Mesh;
      expect(proxy.geometry).toBe(mesh.geometry);
      expect(proxy.material).toBe(mesh.material);
      expect(proxy.frustumCulled).toBe(false);
      expect(proxy.matrixWorld.elements).toEqual(mesh.matrixWorld.elements);
      expect(mesh.parent).toBe(h.root);
      expect(mesh.frustumCulled).toBe(true);
      expect(blocked.visible).toBe(false);
      return pending.promise;
    });
    const warmup = new MapRenderWarmup();
    const work = warmup.prepare(h.renderer, h.scene, h.camera, [h.root], h.target);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.renderer.compileAsync).toHaveBeenCalledOnce();
    expect(h.renderer.getRenderTarget()).toBeNull();
    pending.resolve();
    await work;
    expect(h.renderer.compileAsync.mock.calls[0][0].children).toHaveLength(0);
  });

  it("shares instance buffers and keeps layer, shadow and transform state", async () => {
    const h = harness();
    const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 2);
    instances.castShadow = true;
    instances.receiveShadow = true;
    instances.layers.enable(2);
    h.root.position.set(2, 4, 6);
    h.root.add(instances);
    h.renderer.compileAsync.mockImplementation((stage) => {
      const proxy = stage.children[0] as THREE.InstancedMesh;
      expect(proxy.isInstancedMesh).toBe(true);
      expect(proxy.instanceMatrix).toBe(instances.instanceMatrix);
      expect(proxy.layers.mask).toBe(instances.layers.mask);
      expect(proxy.castShadow).toBe(true);
      expect(proxy.receiveShadow).toBe(true);
      expect(proxy.matrixWorld.elements).toEqual(instances.matrixWorld.elements);
      return Promise.resolve();
    });
    await new MapRenderWarmup().prepare(h.renderer, h.scene, h.camera, [h.root], null);
  });

  it("restores renderer state after compile failure and permits later work", async () => {
    const h = harness();
    h.root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    h.renderer.compileAsync.mockRejectedValueOnce(new Error("compile failed"));
    const warmup = new MapRenderWarmup();
    await expect(warmup.prepare(h.renderer, h.scene, h.camera, [h.root], h.target)).rejects.toThrow("compile failed");
    expect(h.renderer.getRenderTarget()).toBeNull();
    await warmup.prepare(h.renderer, h.scene, h.camera, [h.root], h.target);
    expect(h.renderer.compileAsync).toHaveBeenCalledTimes(2);
  });

  it("serializes work and drops queued assets after invalidation or a replaced HDR", async () => {
    const h = harness();
    h.root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    const first = deferred();
    h.renderer.compileAsync.mockReturnValueOnce(first.promise);
    const warmup = new MapRenderWarmup();
    const a = warmup.prepare(h.renderer, h.scene, h.camera, [h.root], null);
    const b = warmup.prepare(h.renderer, h.scene, h.camera, [h.root], null);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.renderer.compileAsync).toHaveBeenCalledOnce();
    warmup.invalidate();
    first.resolve();
    await Promise.all([a, b]);
    expect(h.renderer.compileAsync).toHaveBeenCalledOnce();
    const c = warmup.prepare(h.renderer, h.scene, h.camera, [h.root], null);
    h.scene.environment = new THREE.Texture();
    await c;
    expect(h.renderer.compileAsync).toHaveBeenCalledOnce();
  });

  it("prepares all current-tier resources in one map-load call, not repeated gameplay batches", async () => {
    const h = harness();
    for (let i = 0; i < 3; i++) h.root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    h.renderer.compileAsync.mockImplementation((stage) => {
      expect(stage.children).toHaveLength(3);
      return Promise.resolve();
    });
    await new MapRenderWarmup().prepare(h.renderer, h.scene, h.camera, [h.root], h.target);
    expect(h.renderer.compileAsync).toHaveBeenCalledOnce();
    expect(h.renderer.getRenderTarget()).toBeNull();
  });

  it("cleans proxy references after an in-flight compile without disposing shared resources", async () => {
    const h = harness();
    const geometry = new THREE.BoxGeometry();
    const dispose = vi.spyOn(geometry, "dispose");
    h.root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
    h.root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
    const pause = deferred();
    const started = deferred();
    h.renderer.compileAsync.mockImplementation(() => { started.resolve(); return pause.promise; });
    const warmup = new MapRenderWarmup();
    const work = warmup.prepare(h.renderer, h.scene, h.camera, [h.root], null);
    await started.promise;
    warmup.invalidate();
    pause.resolve();
    await work;
    expect(h.renderer.compileAsync).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();
  });
});
