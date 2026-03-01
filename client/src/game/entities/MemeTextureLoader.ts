import * as THREE from "three";

export interface MemeEntry {
  id: string;
  name: string;
  file: string;
}

const PLACEHOLDER_CONFIGS: Record<string, { bg: string; fg: string; face: string }> = {
  default: { bg: "#FFD700", fg: "#333", face: ":D" },
  troll:   { bg: "#F0F0F0", fg: "#333", face: ">:)" },
  doge:    { bg: "#E8C96A", fg: "#654321", face: "wow" },
  pepe:    { bg: "#5B8C3E", fg: "#FFF", face: ":(" },
  chad:    { bg: "#4A90D9", fg: "#FFF", face: "B)" },
  amogus:  { bg: "#C51111", fg: "#FFF", face: "SUS" },
  nyan:    { bg: "#FF69B4", fg: "#FFF", face: "~*~" },
  stonks:  { bg: "#2E7D32", fg: "#FFF", face: "$$$" },
};

const textureCache = new Map<string, THREE.Texture>();
const gifCanvasCache = new Map<string, HTMLCanvasElement>();

function generatePlaceholderTexture(id: string, name: string): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cfg = PLACEHOLDER_CONFIGS[id] || PLACEHOLDER_CONFIGS.default;

  ctx.fillStyle = cfg.bg;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = cfg.fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);

  ctx.fillStyle = cfg.fg;
  ctx.font = "bold 60px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cfg.face, size / 2, size / 2 - 15);

  ctx.font = "bold 22px sans-serif";
  ctx.fillText(name.toUpperCase(), size / 2, size - 35);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export async function loadMemeManifest(): Promise<MemeEntry[]> {
  try {
    const resp = await fetch("/assets/memes/manifest.json");
    const data = await resp.json();
    return data.memes || [];
  } catch {
    return Object.keys(PLACEHOLDER_CONFIGS).map((id) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      file: `${id}.png`,
    }));
  }
}

let gifContainer: HTMLDivElement | null = null;

function getGifContainer(): HTMLDivElement {
  if (!gifContainer) {
    gifContainer = document.createElement("div");
    gifContainer.style.cssText = "position:fixed;bottom:0;left:0;width:64px;height:64px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1;";
    document.body.appendChild(gifContainer);
  }
  return gifContainer;
}

/**
 * Load a GIF as an animated CanvasTexture.
 * Uses a visible (but tiny/transparent) img in DOM so the browser keeps animating GIF frames.
 */
function loadGifTexture(filePath: string, memeId: string, memeName: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  gifCanvasCache.set(memeId, canvas);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const img = document.createElement("img");
  img.crossOrigin = "anonymous";
  img.style.cssText = "width:64px;height:64px;display:block;";
  getGifContainer().appendChild(img);

  let loaded = false;

  function drawFrame() {
    if (loaded) {
      try {
        ctx.drawImage(img, 0, 0, size, size);
        texture.needsUpdate = true;
      } catch {}
    }
    requestAnimationFrame(drawFrame);
  }

  img.onload = () => {
    loaded = true;
    drawFrame();
  };

  img.onerror = () => {
    img.remove();
    const ph = generatePlaceholderTexture(memeId, memeName);
    textureCache.set(memeId, ph);
  };

  img.src = filePath;
  requestAnimationFrame(drawFrame);

  return texture;
}

export function getMemeTexture(memeId: string, memeName?: string): THREE.Texture {
  if (textureCache.has(memeId)) {
    return textureCache.get(memeId)!;
  }

  const manifest = (window as any).__memeManifest as MemeEntry[] | undefined;
  const entry = manifest?.find((m) => m.id === memeId);
  const fileName = entry?.file || `${memeId}.png`;
  const filePath = `/assets/memes/${fileName}`;
  const isGif = fileName.toLowerCase().endsWith(".gif");

  if (isGif) {
    const gifTex = loadGifTexture(filePath, memeId, memeName || memeId);
    textureCache.set(memeId, gifTex);
    return gifTex;
  }

  // Create a canvas texture that we can update in-place when the image loads
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Draw placeholder first
  const cfg = PLACEHOLDER_CONFIGS[memeId] || PLACEHOLDER_CONFIGS.default;
  ctx.fillStyle = cfg.bg;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = cfg.fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);
  ctx.fillStyle = cfg.fg;
  ctx.font = "bold 60px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cfg.face, size / 2, size / 2 - 15);
  ctx.font = "bold 22px sans-serif";
  ctx.fillText((memeName || memeId).toUpperCase(), size / 2, size - 35);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(memeId, texture);

  // Load real image and draw onto the SAME canvas -> texture updates everywhere automatically
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    texture.needsUpdate = true;
  };
  img.src = filePath;

  return texture;
}

export function preloadMemeTextures(memes: MemeEntry[]) {
  (window as any).__memeManifest = memes;
  for (const meme of memes) {
    getMemeTexture(meme.id, meme.name);
  }
}

export function getMemePreviewDataURL(id: string, name: string): string {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cfg = PLACEHOLDER_CONFIGS[id] || PLACEHOLDER_CONFIGS.default;

  ctx.fillStyle = cfg.bg;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = cfg.fg;
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  ctx.fillStyle = cfg.fg;
  ctx.font = "bold 36px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cfg.face, size / 2, size / 2 - 8);

  ctx.font = "bold 14px sans-serif";
  ctx.fillText(name.toUpperCase(), size / 2, size - 18);

  // If there's a real image loaded, try to use it for preview
  const manifest = (window as any).__memeManifest as MemeEntry[] | undefined;
  const entry = manifest?.find((m) => m.id === id);
  if (entry) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `/assets/memes/${entry.file}`;
    img.onload = () => {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, size - 2, size - 2);
    };
  }

  return canvas.toDataURL();
}
