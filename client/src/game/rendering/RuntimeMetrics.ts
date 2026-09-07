import * as THREE from "three";
import type {
  GameRenderer,
  RendererBackend,
} from "./RendererFactory";

export interface HarborRuntimeMetrics {
  backend: RendererBackend;
  visualVersion: "v1" | "v2";
  fpsAverage: number;
  frameTimeP95Ms: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  sceneMeshes: number;
  instancedMeshes: number;
  colliderCount: number;
  estimatedTextureMemoryBytes: number;
  environmentTransferBytes: number;
}

/** Resolved development camera pose (see GameManager dev view presets). */
export interface DevViewPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** Vertical field of view in degrees; defaults to the gameplay 75. */
  fov?: number;
  /** Multiplier on the scene FogExp2 density (top-down shots use < 1). */
  fogScale?: number;
}

/** Plain-data pose accepted from the console / snapshot tooling. */
export interface DevViewPoseInput {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
  fogScale?: number;
}

declare global {
  interface Window {
    __catchAndRunMetrics?: HarborRuntimeMetrics;
    __catchAndRunOverview?: () => void;
    __catchAndRunView?: (preset: string | DevViewPoseInput) => void;
    __catchAndRunViewPresets?: () => string[];
  }
}

interface RendererInfoShape {
  memory?: { geometries?: number; textures?: number };
}

type RenderMesh = THREE.Object3D & {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
};

function isRenderMesh(object: THREE.Object3D): object is RenderMesh {
  return object instanceof THREE.Mesh;
}

function isEffectivelyVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

export class RuntimeMetricsCollector {
  private frameTimesMs: number[] = [];

  recordFrame(dt: number) {
    this.frameTimesMs.push(dt * 1000);
    if (this.frameTimesMs.length > 300) this.frameTimesMs.shift();
  }

  collect(
    renderer: GameRenderer,
    scene: THREE.Scene,
    backend: RendererBackend,
    visualVersion: "v1" | "v2",
    colliderCount: number,
  ): HarborRuntimeMetrics {
    const info = renderer.info as unknown as RendererInfoShape;
    const sortedFrames = [...this.frameTimesMs].sort((a, b) => a - b);
    const totalFrameTime = this.frameTimesMs.reduce((sum, value) => sum + value, 0);
    const averageFrameTime = this.frameTimesMs.length > 0
      ? totalFrameTime / this.frameTimesMs.length
      : 0;
    const p95Index = Math.max(
      0,
      Math.ceil(sortedFrames.length * 0.95) - 1,
    );

    let sceneMeshes = 0;
    let instancedMeshes = 0;
    let drawCalls = 0;
    let triangles = 0;
    const textures = new Set<THREE.Texture>();
    scene.traverse((object) => {
      if (!isRenderMesh(object) || !isEffectivelyVisible(object)) return;
      sceneMeshes++;
      const geometry = object.geometry;
      const material = object.material;
      const instanceCount = object instanceof THREE.InstancedMesh
        ? object.count
        : 1;
      if (object instanceof THREE.InstancedMesh) instancedMeshes++;
      drawCalls += Array.isArray(material)
        ? Math.max(1, geometry.groups.length)
        : 1;
      // Prop wrappers are Meshes with an empty BufferGeometry (no position
      // attribute); they must not abort the whole metrics pass.
      const positionAttribute = geometry.getAttribute("position") as
        | THREE.BufferAttribute
        | THREE.InterleavedBufferAttribute
        | undefined;
      const vertexCount = geometry.getIndex()?.count
        ?? positionAttribute?.count
        ?? 0;
      triangles += Math.floor(vertexCount / 3) * instanceCount;
      const materials = Array.isArray(material) ? material : [material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    });

    let estimatedTextureMemoryBytes = 0;
    for (const texture of textures) {
      const image = texture.image as
        | { width?: number; height?: number }
        | undefined;
      estimatedTextureMemoryBytes +=
        (image?.width ?? 0) * (image?.height ?? 0) * 4;
    }

    const environmentTransferBytes = performance
      .getEntriesByType("resource")
      .filter((entry) => (
        entry.name.includes("/assets/maps/harbor-v2/")
        || entry.name.includes("/assets/environment/")
      ))
      .reduce((sum, entry) => {
        const resource = entry as PerformanceResourceTiming;
        return sum + (resource.transferSize || resource.encodedBodySize || 0);
      }, 0);

    return {
      backend,
      visualVersion,
      fpsAverage: averageFrameTime > 0 ? 1000 / averageFrameTime : 0,
      frameTimeP95Ms: sortedFrames[p95Index] ?? 0,
      drawCalls,
      triangles,
      geometries: info.memory?.geometries ?? 0,
      textures: info.memory?.textures ?? textures.size,
      sceneMeshes,
      instancedMeshes,
      colliderCount,
      estimatedTextureMemoryBytes,
      environmentTransferBytes,
    };
  }
}
