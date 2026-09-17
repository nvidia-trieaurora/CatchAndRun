# RP04 — first-visibility shader warmup

10 September 2026. This change addresses the first camera rotation into previously unseen map materials. It does **not** claim that initial map loading, every device, every quality/backend or all remaining game lag has been optimized.

## Evidence and root cause

The original production baseline repeatedly stalled on its first Front 360° pan: 433.4 ms, then 433.3 ms in a new browser. Repeating the same pan in the same session reduced the maximum to 33.4 ms. Geometry/texture counts increased as new map areas first became visible. See [before baseline](../before/README.md).

Further browser-only timing traced the expensive path to Three's `Nodes.getForRender()` → `nodeBuilder.build()`, with individual previously unseen material variants taking tens of milliseconds. Existing map preload downloads/parses assets, but does not prepare all those shader variants. `WeaponSystem.prepareVisualEffects` prepares only pooled effects. `Renderer.compileAsync` still frustum-culls, so simply calling it at the spawn camera would miss the unseen geometry. High quality also renders the world into a postprocessing scene-pass target, not the canvas; attachment format/state must match when preparing those pipelines.

## Implemented behavior

- `MapRenderWarmup` collects only current-tier renderables that are visible through their ancestor chain and camera layers. Collider/disabled-LOD visibility is not changed.
- Isolated, non-frustum-culled proxies share the actual geometry, materials, textures and instanced buffers. Live objects are never reparented or revealed.
- Compilation follows an actual world render, so the current HDR/PMREM is initialized. It is sequenced after weapon-effect preparation and uses the real High scene-pass target (canvas for direct rendering).
- The active renderer target is restored synchronously before awaiting pipeline completion. Proxies are then cleared without disposing map-owned resources.
- Map teardown invalidates queued work; queued preparation also refuses stale map/HDR/fog snapshots. This is one preparation at map build/HDR change, not per-frame work.

Runtime files:

- [MapRenderWarmup.ts](../../../../../client/src/game/rendering/MapRenderWarmup.ts)
- [GameManager.ts](../../../../../client/src/game/GameManager.ts)
- [PostProcessing.ts](../../../../../client/src/game/effects/PostProcessing.ts)

## Controlled diagnosis and loading tradeoff

The comparison below used the same production GLBs and the same fixed grouped-LOD loader. The disabled case replaces only the new map-warmup method in the isolated browser before map creation; weapon preparation remains enabled. Both profiles instrument shader construction and entry timing, so these diagnostic figures should not be treated as a normal uninstrumented performance benchmark. Background machine load was not externally controlled.

| Diagnostic run | Front first-pan max | Front pan frames >50 ms | New map preparation cost |
| --- | ---: | ---: | --- |
| [Map warmup disabled](disabled-webgpu-high-report.json) | 583.3 ms | 4 | None |
| [One-shot warmup](enabled-webgpu-high-report.json) | 33.4 ms | 0 | 1,561.1 ms synchronous / 1,635.4 ms total |
| [Rejected singleton batching experiment](batched-webgpu-high-report.json) | 33.5 ms | 0 | 9,464.8 ms elapsed; individual batches up to 154.8 ms |

Batching made the initial preparation period worse: the Front static sample overlapped this work and recorded 18 frames over 50 ms. It was therefore removed, not presented as a successful optimization. The final implementation uses one-shot preparation and explicitly accepts additional initial loading cost to remove the first-turn surprise later in play.

Even with this new map preparation disabled, the first visible world render in the instrumented run already produced an approximately 8.2-second entry frame gap. Other instrumented runs observed approximately 5.3–7.6 seconds. That pre-existing first-render cost remains; this change does not implement a server readiness barrier or a new loading-screen architecture. The early entry sample can include a slightly negative first requestAnimationFrame delta from event/frame timestamp ordering; it is not a physical negative frame time and is not used as the reported maximum.

A future loading flow should visibly report graphics preparation and finish it before granting competitive movement/start time. This requires coordinating presentation and match readiness rather than hiding the cost by increasing QA settle time.

## Verification

6 focused helper tests cover offscreen/shared resources, real render-target restoration, instancing/transforms, failure recovery, stale queued work, one-load batching policy and cleanup ownership. Together with 10 real GameManager lifecycle tests and 27 weapon tests: **43/43 pass**. Targeted ESLint is clean. Full client typecheck still reports only the four already-known test typing errors in `HarborIslandSurfaces.test.ts` and `harborWater.test.ts`; it is not claimed globally clean.

The final normal capture uses the unchanged helper settings: fresh Chrome profile, WebGPU High, 1600 × 900, 16-second map settle, 4-second static sample and 4-second 360° pan. No additional profiling hooks or longer timers are used for that final run. Audio remains muted and only Front/Interior are sampled here; the full candidate visual/backend matrix is a separate root-owned review.

[Final normal capture report](final-webgpu-high-report.json), `2026-09-10T09:48:43.661Z`:

| View | Static FPS / p95 | First pan FPS / p95 | Pan max / frames >50 ms | Renderer draw calls |
| --- | --- | --- | --- | ---: |
| [Front](final-webgpu-high-harborMarketFront.png) | 59.5 / 16.8 ms | 59.0 / 16.8 ms | 33.3 ms / 0 | 197 |
| [Interior](final-webgpu-high-harborMarketInterior.png) | 60.0 / 16.8 ms | 58.8 / 16.8 ms | 33.4 ms / 0 | 190 |

Neither static sample has a frame over 50 ms. Zero renderer/application errors and no prewarm failure warning. Microphone access denial is expected in this muted isolated browser. Visual comparison retains the original production scene/material appearance; no black-HDR regression is visible. These final screenshots intentionally use the original production Market, not the separate RP04 art candidate.
