import type * as THREE from "three/webgpu";
import {
  WaterSystem,
  type QualityLevel,
  type WaterSystemInstance,
} from "threejs-water-pro";
import type { GameRenderer } from "../../rendering/RendererFactory";

export class WaterProOceanBackend {
  readonly kind = "water-pro";

  private constructor(private system: WaterSystemInstance) {}

  static isAvailable(): boolean {
    return __WATER_PRO_AVAILABLE__;
  }

  static async create(
    renderer: GameRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    quality: QualityLevel,
  ): Promise<WaterProOceanBackend | null> {
    if (!this.isAvailable()) return null;

    const system = await WaterSystem.create(
      renderer,
      scene,
      camera,
      quality,
      {
        deterministic: true,
        seed: 20260906,
        stepSize: 1 / 60,
      },
    );
    system.setPosition(4, 2);
    system.loadPreset("sunset");
    return new WaterProOceanBackend(system);
  }

  update(dt: number) {
    void this.system.update(dt);
  }

  render() {
    this.system.render();
  }

  resize(width: number, height: number) {
    this.system.resize(width, height);
  }

  sampleHeight(x: number, z: number): Promise<number> {
    return this.system.getHeightAt(x, z);
  }

  dispose() {
    this.system.dispose();
  }
}
