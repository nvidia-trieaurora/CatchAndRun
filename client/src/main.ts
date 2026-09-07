import { GameManager } from "./game/GameManager";
import { createRenderer } from "./game/rendering/RendererFactory";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;

async function bootstrap() {
  const renderer = await createRenderer(canvas);
  new GameManager(canvas, renderer);
}

void bootstrap().catch((error: unknown) => {
  console.error("[Bootstrap] Failed to initialize renderer", error);
  const message = document.createElement("div");
  message.className = "fatal-renderer-error";
  message.textContent =
    "Unable to initialize WebGPU/WebGL2. Please update your browser or graphics driver.";
  document.body.appendChild(message);
});
