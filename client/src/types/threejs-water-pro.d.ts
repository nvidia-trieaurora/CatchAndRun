declare const __WATER_PRO_AVAILABLE__: boolean;

declare module "threejs-water-pro" {
  import type * as THREE from "three/webgpu";

  export type QualityLevel = "low" | "medium" | "high" | "ultra";

  export interface WaterSystemInstance {
    readonly backend: "webgpu" | "webgl";
    update(deltaTime: number): Promise<void>;
    render(): void;
    resize(width?: number, height?: number): void;
    dispose(): void;
    getHeightAt(x: number, z: number): Promise<number>;
    setPosition(x: number, z: number): void;
    loadPreset(preset: string): void;
  }

  export const WaterSystem: {
    create(
      renderer: THREE.WebGPURenderer,
      scene: THREE.Scene,
      camera: THREE.PerspectiveCamera,
      quality?: QualityLevel,
      options?: {
        deterministic?: boolean;
        seed?: number;
        stepSize?: number;
      },
    ): Promise<WaterSystemInstance>;
  };
}
