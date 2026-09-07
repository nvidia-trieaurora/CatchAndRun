import * as THREE from "three/webgpu";

export type RendererBackend = "webgpu" | "webgl2";
export type GameRenderer = THREE.WebGPURenderer;

export interface RendererContext {
  renderer: GameRenderer;
  backend: RendererBackend;
}

function forceWebGLFromUrl(): boolean {
  return new URLSearchParams(window.location.search).get("renderer") === "webgl2";
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
): Promise<RendererContext> {
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    samples: 4,
    forceWebGL: forceWebGLFromUrl(),
    powerPreference: "high-performance",
  });
  renderer.onDeviceLost = (info) => {
    console.error(`[Renderer] ${info.api} device lost: ${info.message}`);
  };
  await renderer.init();

  const backend = "isWebGPUBackend" in renderer.backend
    && renderer.backend.isWebGPUBackend === true
    ? "webgpu"
    : "webgl2";

  return { renderer, backend };
}
