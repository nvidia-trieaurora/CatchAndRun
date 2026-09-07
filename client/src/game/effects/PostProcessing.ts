import * as THREE from "three";
import { PostProcessing as WebGPUPostProcessing } from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import type { GameRenderer } from "../rendering/RendererFactory";

/**
 * Bloom post-processing pipeline. Only used on the HIGH quality tier;
 * when `enabled` is false GameManager renders directly instead.
 */
export class PostProcessing {
  enabled = false;
  private pipeline: WebGPUPostProcessing;

  constructor(renderer: GameRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.pipeline = new WebGPUPostProcessing(renderer);
    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode("output");
    const bloomPass = bloom(sceneColor, 0.22, 0.28, 0.92);
    this.pipeline.outputNode = sceneColor.add(bloomPass);
  }

  setSize(_width: number, _height: number) {}

  render() {
    this.pipeline.render();
  }

  dispose() {
    this.pipeline.dispose();
  }
}
