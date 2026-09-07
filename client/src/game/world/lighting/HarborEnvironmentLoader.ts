import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

const HARBOR_HDR_URL =
  "/assets/environment/industrial_sunset_1k.hdr";

export class HarborEnvironmentLoader {
  private texture: THREE.DataTexture | null = null;
  private loading: Promise<boolean> | null = null;

  preload(): Promise<boolean> {
    if (this.texture) return Promise.resolve(true);
    if (this.loading) return this.loading;

    this.loading = new HDRLoader()
      .loadAsync(HARBOR_HDR_URL)
      .then((texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this.texture = texture;
        return true;
      })
      .catch((error: unknown) => {
        console.warn("[HarborEnvironment] HDRI load failed; using sky fallback.", error);
        return false;
      });
    return this.loading;
  }

  getTexture(): THREE.DataTexture | null {
    return this.texture;
  }

  dispose() {
    this.texture?.dispose();
    this.texture = null;
    this.loading = null;
  }
}
