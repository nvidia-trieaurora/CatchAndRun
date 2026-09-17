import * as THREE from "three";

interface MapShaderCompiler {
  compileAsync(objects: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): Promise<unknown>;
  getRenderTarget(): THREE.RenderTarget | null;
  setRenderTarget(target: THREE.RenderTarget | null): void;
}

/** Prepare the current tier's offscreen map resources, not just the spawn frustum. */
export class MapRenderWarmup {
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();

  invalidate(): void {
    this.generation++;
  }

  /**
   * Call after an actual world render: the renderer and the current HDR/PMREM
   * must already be initialized. High uses the actual scene-pass target so its
   * pipelines match gameplay, while Low compiles for the canvas target.
   */
  prepare(
    renderer: MapShaderCompiler,
    scene: THREE.Scene,
    camera: THREE.Camera,
    roots: readonly THREE.Object3D[],
    target: THREE.RenderTarget | null,
  ): Promise<void> {
    const generation = this.generation;
    const environment = scene.environment;
    const fog = scene.fog;
    this.queue = this.queue.catch(() => {}).then(async () => {
      if (generation !== this.generation || environment !== scene.environment || fog !== scene.fog) return;
      const staging = new THREE.Scene();
      staging.name = "MapRenderWarmup";
      staging.environment = environment;
      staging.environmentIntensity = scene.environmentIntensity;
      staging.environmentRotation.copy(scene.environmentRotation);
      staging.fog = fog;
      const seen = new Set<THREE.Object3D>();
      for (const root of roots) {
        let ancestor: THREE.Object3D | null = root;
        let visible = true;
        while (ancestor) {
          if (!ancestor.visible) { visible = false; break; }
          ancestor = ancestor.parent;
        }
        if (!visible) continue;
        root.updateWorldMatrix(true, true);
        root.traverseVisible((object) => {
          if (seen.has(object)) return;
          seen.add(object);
          if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite)) return;
          if (!object.layers.test(camera.layers)) return;
          const proxy = object.clone(false);
          proxy.matrix.copy(object.matrixWorld);
          proxy.matrixWorld.copy(object.matrixWorld);
          proxy.matrixAutoUpdate = false;
          proxy.frustumCulled = false;
          // InstancedMesh.copy clones these attributes by default. Warm the live
          // buffers, not throwaway GPU allocations belonging only to the proxy.
          if (object instanceof THREE.InstancedMesh && proxy instanceof THREE.InstancedMesh) {
            proxy.instanceMatrix = object.instanceMatrix;
            proxy.instanceColor = object.instanceColor;
          }
          staging.add(proxy);
        });
      }
      if (staging.children.length === 0) return;
      const previousTarget = renderer.getRenderTarget();
      try {
        let compilation: Promise<unknown>;
        try {
          renderer.setRenderTarget(target);
          // Initialized Three builds the render list synchronously, then awaits
          // pipeline completion. Restore the live target before yielding; never
          // leave a postprocessing target active across an animation frame.
          // This deliberately pays the node-builder cost once at map load. It is
          // not a promise that initial loading is non-blocking; see RP04 timings.
          compilation = renderer.compileAsync(staging, camera, scene);
        } finally {
          renderer.setRenderTarget(previousTarget);
        }
        await compilation;
      } finally {
        // Shared geometry, material and texture ownership stays with the map.
        staging.clear();
      }
    });
    return this.queue;
  }
}
