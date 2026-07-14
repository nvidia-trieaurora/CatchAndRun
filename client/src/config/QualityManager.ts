import * as THREE from "three";
import type { ClientConfig } from "./ClientConfig";
import { isMobile } from "../input/MobileDetect";

export type QualityTier = "low" | "medium" | "high";

/**
 * Resolves the effective graphics tier from config ("auto" uses device
 * heuristics) and applies renderer-level settings for that tier.
 */
export class QualityManager {
  constructor(
    private config: ClientConfig,
    private renderer: THREE.WebGLRenderer
  ) {}

  getTier(): QualityTier {
    const setting = this.config.get().graphicsQuality;
    if (setting !== "auto") return setting;
    if (isMobile()) return "low";
    const cores = navigator.hardwareConcurrency || 4;
    return cores <= 4 ? "medium" : "high";
  }

  bloomEnabled(): boolean {
    return this.getTier() === "high";
  }

  apply(scene?: THREE.Scene) {
    const tier = this.getTier();
    const dpr = window.devicePixelRatio;

    if (tier === "low") {
      this.renderer.setPixelRatio(Math.min(dpr, 1));
      this.renderer.shadowMap.enabled = false;
    } else if (tier === "medium") {
      this.renderer.setPixelRatio(Math.min(dpr, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    } else {
      this.renderer.setPixelRatio(Math.min(dpr, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // Shadow map changes only take effect after materials recompile
    if (scene) {
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => { m.needsUpdate = true; });
        }
      });
    }
  }
}
