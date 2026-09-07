import type * as THREE from "three";

export type OceanBackendKind = "gerstner" | "water-pro";

export interface OceanBackend {
  readonly kind: OceanBackendKind;
  readonly root?: THREE.Object3D;
  update(dt: number): void;
  addRipple?(x: number, z: number, strength?: number): void;
  resize?(width: number, height: number): void;
  sampleHeight(x: number, z: number): number | Promise<number>;
  dispose(): void;
}
