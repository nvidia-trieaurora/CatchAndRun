/**
 * Dump the procedural Harbor movement colliders (the gameplay contract that
 * zone GLBs must respect) to JSON so Blender zone authoring can import them
 * as locked reference volumes.
 *
 *   npx vite-node -c client/vite.config.ts tools/harbor-v2/dump_procedural_colliders.ts \
 *       -- --out art-source/harbor-v2/_staging/procedural-colliders.json
 *
 * Coordinates are Three.js Y-up world meters, identical to what
 * `buildOldHarborFortniteMap` pushes into `colliders` at runtime with the
 * cinematic V2 options (Warehouse GLB + cinematic visuals).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Minimal DOM shims: the map builder rasterises sign text through a 2D canvas
// and never touches the result in this headless dump.
const noopContext = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === "measureText") return () => ({ width: 1 });
      if (key === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined;
    },
    set: () => true,
  },
);
const fakeElement = () => ({
  width: 1,
  height: 1,
  getContext: () => noopContext,
  toDataURL: () => "",
  style: {},
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setAttribute: () => undefined,
  appendChild: () => undefined,
  set src(_value: string) { /* images never load headless */ },
});
(globalThis as unknown as { document?: unknown }).document ??= {
  createElement: fakeElement,
  createElementNS: fakeElement,
  body: { appendChild: () => undefined, removeChild: () => undefined },
};
(globalThis as unknown as { window?: unknown }).window ??= {
  devicePixelRatio: 1,
  innerWidth: 1280,
  innerHeight: 720,
  location: { search: "" },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};
(globalThis as unknown as { navigator?: unknown }).navigator ??= { userAgent: "node" };
(globalThis as unknown as { Image?: unknown }).Image ??= class {
  set src(_value: string) { /* never loaded headless */ }
  addEventListener() { /* noop */ }
};

const THREE = await import("three");
const { buildOldHarborFortniteMap } = await import(
  "../../client/src/game/world/maps/oldHarborFortnite"
);
const mapData = (await import("../../client/src/game/world/harbor-warehouse.json")).default;

const args = process.argv.slice(process.argv.indexOf("--") + 1);
const outIndex = args.indexOf("--out");
const outPath = outIndex >= 0
  ? args[outIndex + 1]
  : "art-source/harbor-v2/_staging/procedural-colliders.json";

const scene = new THREE.Scene();
const result = buildOldHarborFortniteMap(scene, mapData as never, {
  useWarehouseV2: true,
  cinematicVisuals: true,
  quality: "high",
});

const round = (value: number) => Math.round(value * 10000) / 10000;
const ferrisSet = new Set(result.ferrisCabinColliders);
const colliders = result.colliders.map((box, index) => ({
  index,
  min: { x: round(box.min.x), y: round(box.min.y), z: round(box.min.z) },
  max: { x: round(box.max.x), y: round(box.max.y), z: round(box.max.z) },
  ferrisCabin: ferrisSet.has(box),
  hunterGate: index === result.gateColliderIndex,
}));

const payload = {
  generatedFrom: "buildOldHarborFortniteMap({ useWarehouseV2: true, cinematicVisuals: true, quality: 'high' })",
  coordinateSystem: "three.js Y-up meters",
  count: colliders.length,
  colliders,
};
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`wrote ${colliders.length} colliders to ${outPath}`);
