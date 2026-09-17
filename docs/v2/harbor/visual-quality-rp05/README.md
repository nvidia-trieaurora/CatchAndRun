# RP05 — reproducible visual-quality slice

Scope: **Hunter response station**, existing Harbor/Three.js game. No engine migration,
cloud spend, character service, deployment, or map-wide replacement. Working branch
`codex/visual-quality-rp05`, based on `708d368` plus the user's pre-existing dirty work.
Baseline provenance/patch and original touched files live under
`art-source/harbor-v2/_staging/visual-qa-rp05/baseline/`. Branch isolation is on the
existing dirty checkout, **not** a clean reproduction of HEAD. Do not reset that work.

Implemented sample and measured outcomes: [results / evidence / remaining work](results.md).
The runtime GLB has been integrated locally; this is not a deployment or a whole-map
approval. All paths in commands below are relative to the repository root unless
otherwise stated. Use fresh evidence directories for another run: capture refuses
to overwrite completed runs or their original-file backups.

## Survey (source is authoritative)

| Concern | Actual implementation / evidence |
| --- | --- |
| Renderer | `client/src/game/rendering/RendererFactory.ts`: Three 0.181.0 WebGPURenderer, WebGPU default, WebGL2 fallback. Vite 6.4.1; installed versions, not old README. |
| Scene/loading | `GameManager.ts`, `world/maps/harborV2Map.ts`, `world/assets/MapAssetLoader.ts`, `world/zones/harborZones.ts`: procedural gameplay + warehouse/cinematic GLBs + seven overriding zones; cloned resources, quality-tier selection, collision carving. |
| Art | `tools/harbor-v2/zones/zone_kit.py`, zone builders, `export_zone_scene.py`: metre-based Blender Z-up to glTF Y-up; separate LOD0/LOD1; embedded WebP. |
| Lighting | `world/lighting/fortniteLighting.ts`: HDR environment, ACES, sun/shadows/fog; `harborMarketLighting.ts` already demonstrates bounded shadow-free practicals. Emissive station strips currently don't illuminate its dark soffit. |
| Camera/animation | HunterController FPS, PropController third-person, procedural `HunterModel.ts`, `PlayerEntity.ts` interpolates network transforms; no skeletal clips on this sample. Station `HunterGateState.ts` scales the whole gate to open, visibly compressing its lettering. |
| Physics | GroundCollision, collisionBroadphase, SupportSurfaces, BoatCollisionRig, WaterSwim; procedural/static AABBs + specialized moving support planes. Do not use render mesh bounding boxes as a blanket replacement. |
| Water | harborWater / harborShoreFoam / harborShoreline, quality-dependent GPU surface and CPU samples. Existing boat support regressions should stay intact. |
| Multiplayer | Colyseus server core 0.15.57/client 0.15.28, 20 Hz server simulation/patch; GameRoom, MatchStateMachine, EnvironmentalHazards, AntiCheat. Gate phase is server-owned; deformation is client-only. |
| QA | Existing station 75-ray checks per LOD; ResponseStationIntegration tests real exported geometry with HunterController; full StaticAssetGate and portable pipeline evidence. Extend these, not a second physics engine. |
| Measurement caveat | GameManager clamps dt to 50 ms before runtime metrics. New capture measures **raw rAF deltas**, keeps max/over-50ms/long tasks; screenshot/video sampling excluded from performance results. |

Fresh startup succeeded: shared/server TypeScript build, isolated server 2569, Vite
5175, real Chrome WebGPU. User server 2567 left untouched; QA server runs in its own
temporary cwd so it does not share the user's SQLite analytics database.

## Direction and finite completion contract

Working art assumption: maintained coastal response facility within a weathered
industrial harbor. Marine navy, satin aluminium, rubber seals, light matte soffit,
restrained warm/cool practicals. Preserve sunny outdoor contrast, transparent windows,
14m gate aperture, original shell/floor/roof and wide marked exit route. Add only
attached construction detail, not random clutter. No claim of full photorealism.

The first fresh 1600x900 WebGPU/High survey on this M4/24GiB machine measured
16.7–16.8ms raw p95, no >50ms frame in four short static/pan samples. Paired slice
captures use **1280x720, DPR1** and their own before/after baseline, not those numbers.

Targets (not measured results):

- Exposed slats/lettering translate without scaling; fully retracted portion hidden
  by a headbox; closing restores exact source vertices. No new blocking decoration.
- Ceiling structure and window construction legible in real game lighting; no added
  light casts dynamic shadows. Low remains usable without new local lights.
- <=12 primitives per station LOD, <=16k triangles per LOD, <2MB GLB.
- Same-camera raw p95 <= max(20ms, baseline x1.15); no more than one additional
  >50ms frame in each 4s sample. This is a local headless regression gate, not a
  shipping-device target. Desired 60FPS on desktop is **unverified**.
- Existing floor/gate/roof/lane checks + collision/gameplay regressions pass; two
  real browser clients observe HIDING closed and ACTIVE open from the same server.
- Review five standalone export views + game context + gate time sequence + real
  controller movement. Log limits (foot sliding/whole-island coverage cannot be
  certified by station tests). Stop after the bounded sample passes or document an
  exact remaining blocker; no endless polish.

## Commands / prerequisites

Requires installed workspace dependencies, local Chrome, ffmpeg and Blender 5.2.1.
Original texture derivatives in `tools/harbor-v2/textures/container-bd-pbr/_derived`
must exist. No API key required. Set `CHROME_PATH` if Chrome is elsewhere.

```sh
npm run build:shared
npm run build -w server
# Terminal 1; use a new temporary cwd to isolate analytics.db:
QA_SERVER_DIR=$(mktemp -d /tmp/catchandrun-rp05-server.XXXXXX)
cd "$QA_SERVER_DIR"
PORT=2569 node /Users/tlle/Documents/PersonalProject/CatchAndRun/server/dist/index.js
# Terminal 2, from client/:
VITE_SERVER_URL=ws://localhost:2569 ../node_modules/.bin/vite --host 127.0.0.1 --port 5175 --strictPort
# Repository root; BEFORE source/production asset changes:
node tools/visual-qa/capture.mjs --out art-source/harbor-v2/_staging/visual-qa-rp05/baseline --backup true
# Build/export/validate candidate (no production writes):
node tools/visual-qa/build.mjs
# Inspect exported candidate, not just its native authoring source:
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python tools/visual-qa/render_asset.py -- --glb art-source/harbor-v2/_staging/visual-qa-rp05/asset/response-station.glb --out art-source/harbor-v2/_staging/visual-qa-rp05/asset-after
# Capture candidate bytes through CDP, without replacing the production GLB:
node tools/visual-qa/capture.mjs --station-candidate art-source/harbor-v2/_staging/visual-qa-rp05/asset/response-station.glb --out art-source/harbor-v2/_staging/visual-qa-rp05/candidate-final
node tools/visual-qa/compare.mjs art-source/harbor-v2/_staging/visual-qa-rp05/baseline/report.json art-source/harbor-v2/_staging/visual-qa-rp05/candidate-final/report.json art-source/harbor-v2/_staging/visual-qa-rp05/candidate-final-comparison.json
# OPEN and review native/runtime images and motion frames; document findings first.
# This RP05-specific command has already been run for the delivered asset.
# Re-running now correctly refuses: production no longer equals the old baseline.
node tools/visual-qa/promote_station.mjs --reviewed
# After integration, same config; don't run builds/renders during measurement:
node tools/visual-qa/capture.mjs --out art-source/harbor-v2/_staging/visual-qa-rp05/after
node tools/visual-qa/compare.mjs art-source/harbor-v2/_staging/visual-qa-rp05/baseline/report.json art-source/harbor-v2/_staging/visual-qa-rp05/after/report.json art-source/harbor-v2/_staging/visual-qa-rp05/comparison.json
node tools/visual-qa/capture.mjs --quality low --renderer webgl2 --out art-source/harbor-v2/_staging/visual-qa-rp05/low-webgl2
npm run test -w client -- --run tests/HunterGateState.test.ts tests/ResponseStationIntegration.test.ts
npm run harbor:v2:test-asset-gate
npm run harbor:v2:verify-assets -- --out-dir art-source/harbor-v2/_staging/visual-qa-rp05/pipeline
npm run version:check
npm test
npm run lint
npm run build
```

Capture is development-only instrumentation of existing modules in a fresh private
browser/room. Seed, viewport, quality, camera, gate fixture times are fixed. Explicit
map/zone and shader warm-up completion precede measurement. Static gate fixture
uses dt=0; ocean phase, network/HUD clock remain uncontrolled and are reported.
Never interpret every changed pixel as a bug. Expected differences are soffit,
metal response, attached frame details and shutter motion; compare gameplay routes
and silhouettes separately. The 8x gate video is a fixed-time review sequence, not a
real-time frame-rate benchmark. Raw measurements occur before captures/multiplayer.

Performance views are named review cameras in the real game renderer. Movement
frames switch back to the actual Hunter camera/controller, FOV 75, and feed synthetic
keys without teleporting. Headless pointer-lock permission errors are recorded and
allowlisted only in this harness; other browser errors fail the capture. It does not
prove manual mouse feel or real device input. Two clients join one private Colyseus
room; phase callbacks and actual collider state are recorded on both clients.

The original baseline movement capture inherited review FOV 60; final movement uses
gameplay FOV 75. Compare their telemetry/behavior, **not** motion pixels. All four
paired static performance cameras retain the same poses and FOV. The first baseline
entry screenshot contains a transient round banner; don't treat that HUD difference
as an art regression. No fully deterministic lockstep/network replay is claimed.

`ready.loadMs` is elapsed navigation-to-QA-ready, including phase waits, **not** a
standalone asset load benchmark. Per-resource transfer times/bytes are recorded.
`renderer.info.render.drawCalls` includes render passes; the game's `metrics.drawCalls`
is a scene estimate, so these counters must not be conflated. Texture memory is an
estimate, not measured GPU residency. No GPU timestamp query has been enabled.

## Asset policy and workflow

Architecture and rigid props: existing procedural Blender recipes, bevel/UV/PBR,
export staging, validate, multi-angle preview, runtime candidate, route tests, review,
then explicit local promotion. Vegetation: existing instanced/cards assets; check
alpha overdraw first. Characters: inspect real HunterModel poses/interpolation before
buying/replacing rigs. Interactive assets: visual mesh + simple physics contract,
server phase unchanged unless a separately tested gameplay change is intended.
Effects/water: isolated temporal/performance scenario first, not a map-wide shader swap.

Keep native source, recipe, input hashes, tool version, units/pivot and source/license
manifest. RP05 uses existing CC0 derivatives attributed in `textures/ATTRIBUTION.md`;
new coating factors and attached details are procedural. System font outlines require
the same installed font to rebuild identical signage; no font binary is redistributed.
No Meshy/external character service required for this slice. Never infer permission
or licenses for new downloaded assets. GLB skin/animation absence is expected here.

Build detail: mesh triangulation, then only 8-bit COLOR quantization; non-color
accessors are hashed and must remain unchanged. The explicit-tangent trial exceeded
the 2MB payload budget (2.35MB). Final GLB keeps the existing runtime-generated
tangent convention, with ten portability warnings preserved in validation. Native
and both tested browser backends were reviewed; Unreal/other renderer parity is not
certified. No new 4K texture, geometry-wide simplification, or blanket instancing.

Evidence is intentionally under the existing ignored `_staging` directory. Archive
that complete directory with its hashes before cleanup or handoff to another machine;
Git alone will not carry the images/videos/backup patch. Never blindly apply the
whole pre-existing patch or replace the entire working tree to roll back this slice.
The original station GLB is separately preserved; compare touched source snapshots
before reverting individual hunks. The existing server on port 2567 is not part of QA.

Release gate is **all** of asset validation, route/interaction tests, runtime
readiness, actual image review and before/after measurement. Pixel diff alone is not
an art sign-off. Preserve input hashes in the report; rebuild/re-capture after edits.
Do not expand across the island until this sample's evidence has been reviewed.
The full repository server suite currently fails ten unrelated expectations; see
results.md. This remains a release/expansion blocker, even though the bounded asset,
movement, water and browser checks pass. Do not weaken gates to label it all green.
