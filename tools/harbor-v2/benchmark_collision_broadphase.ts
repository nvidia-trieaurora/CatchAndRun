/** Run with npx vite-node -c client/vite.config.ts tools/harbor-v2/benchmark_collision_broadphase.ts. */
import * as THREE from "three";
import { performance } from "node:perf_hooks";
import { CollisionSpatialIndex, collectNearbyColliders } from "../../client/src/game/world/collisionBroadphase";
import { installHeadlessDom } from "../../client/tests/helpers/headlessDom";

installHeadlessDom();
const { buildOldHarborFortniteMap } = await import("../../client/src/game/world/maps/oldHarborFortnite");
const mapData = (await import("../../client/src/game/world/harbor-warehouse.json")).default;
const map = buildOldHarborFortniteMap(new THREE.Scene(), mapData as never, {
  useWarehouseV2: true, cinematicVisuals: true, quality: "high",
});

const positions = Array.from({ length: 240 }, (_, i) => new THREE.Vector3(
  -51 + (i * 17) % 110, 1.6, -39 + (i * 13) % 82,
));
// A 60 FPS walk across the island and back, not a teleport every frame. The
// separate parity sweep above still checks district/cell boundaries exhaustively.
const walkingPositions = Array.from({ length: 24000 }, (_, i) => {
  const phase = i / 600;
  return new THREE.Vector3(Math.sin(phase) * 50, 1.6, Math.sin(phase * 0.61) * 37);
});
const index = new CollisionSpatialIndex();
const output: THREE.Box3[] = [];
index.rebuild(map.colliders, map.ferrisCabinColliders);
let candidates = 0;
for (const position of positions) {
  const expected = collectNearbyColliders(map.colliders, position, 16);
  const actual = index.collectNearby(position, 16, output);
  if (actual.length !== expected.length || actual.some((box, i) => box !== expected[i])) throw new Error("Index parity failed");
  candidates += index.lastCandidateCount;
}

let checksum = 0;
const time = (indexed: boolean): number => {
  const start = performance.now();
  for (const position of walkingPositions) {
    checksum += (indexed ? index.collectNearby(position, 16, output) : collectNearbyColliders(map.colliders, position, 16)).length;
  }
  return performance.now() - start;
};
time(false); time(true);
const linear: number[] = [], indexed: number[] = [];
for (let run = 0; run < 7; run++) {
  if (run % 2) { indexed.push(time(true)); linear.push(time(false)); }
  else { linear.push(time(false)); indexed.push(time(true)); }
}
const median = (times: number[]) => times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
console.log(JSON.stringify({
  scope: "Headless CPU microbenchmark: current procedural Harbor collision contract, not end-to-end GPU/FPS",
  colliders: map.colliders.length,
  dynamicColliders: map.ferrisCabinColliders.length,
  queryCountPerSample: walkingPositions.length,
  averageCandidateTests: Math.round(candidates / positions.length),
  fullScanMedianMs: median(linear),
  spatialMedianMs: median(indexed),
  checksum,
}, null, 2));
