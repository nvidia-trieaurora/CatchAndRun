# Harbor Cinematic Migration Validation

Date: 2026-09-06  
Target tracker: v1.2.0 `[Unreleased]`

## Result

The Harbor client now defaults to an authored cinematic V2 visual layer while
retaining the existing server map data, spawn points, movement colliders,
Hunter/Prop rules, weapons, round flow, and Colyseus messages.

The legacy procedural Harbor remains available with `?harbor=v1`. In V2, it is
built only in a detached scene to reproduce the established collision volumes;
its render meshes are never attached to the live scene or weapon raycasts.

## Lobby lifecycle fix

- `WAITING`, `COUNTDOWN`, match-result continuation, and leave-room paths share
  one lobby-presentation reset.
- The reset hides the minimap and gameplay controls, exits pointer lock/scope/
  grenade state, tears down map resources, and restores the menu background.
- Regression tests: 2/2 passed.
- Runtime evidence: `runtime-lobby-clean.png`.

## Hunter spawn gate repair

- The cinematic cage now matches the gameplay contract: north/south/west are
  permanent walls and the east face at `x = -35` is the dynamic gate.
- ACTIVE removes only the east gate collider and hides the matching GLB mesh;
  the permanent walls remain collidable.
- HIDING restores the same collider and visual gate on every subsequent round.
- Harbor Hunter spawns face east toward the exit instead of facing a permanent
  wall.
- Runtime evidence: `runtime-hunter-gate-open.png`.

## Rendering

- Three.js: 0.181.0.
- Default renderer: `WebGPURenderer`.
- Compatibility path: WebGPU renderer WebGL2 backend, forced with
  `?renderer=webgl2`.
- Tone mapping: ACES Filmic with restrained exposure.
- High quality: TSL bloom pipeline.
- Medium/low: direct render path with reduced DPR and shadow cost.
- Bundles are split into application, networking, and Three.js vendor chunks.

## Ocean

- Active public backend: TSL Gerstner waves with vertex displacement,
  procedural moving normals, physical clearcoat/specular response, depth tint,
  and continuous shoreline foam.
- Bullet impacts inject renderer-neutral ripple waves into the actual ocean
  displacement instead of only drawing a temporary ring on top.
- Ripple capacity is tiered at 8/6/4 concurrent waves for high/medium/low.
- High quality adds analytic shoreline caustics; medium and low omit that pass.
- Fresnel response, limited physical transmission, attenuation and refraction
  are handled by the shared `MeshPhysicalNodeMaterial`.
- The implementation adapts concepts from the MIT-licensed
  `jeantimex/threejs-water`; the complete notice is in
  `THIRD_PARTY_NOTICES.md`. Its WebGL pool renderer is not vendored.
- Low/medium/high tiers use 32/64/96 surface segments and 2/3/4 directional
  Gerstner wave components.
- Existing water-hit splashes, ripples, and lethal server ocean regions remain.
- Approaching within 3.2 m of the seawall displays a persistent warning; the
  final 1.2 m switches to a critical warning and audio cue.
- Drowning remains server-authoritative and now broadcasts a 2.4-second camera
  pullback target. The local client plays a splash, synthesized drowning audio,
  death banner and eased spectator-camera arc.
- `OceanBackend` and `WaterProOceanBackend` are implemented.
- Water Pro is loaded only when `WATER_PRO_PATH` points to its licensed compiled
  artifact. Its ZIP, source, source map, and build are excluded from this public
  repository. Without it, the Gerstner backend remains fully functional.

## Lighting and environment

- CC0 Poly Haven `Industrial Sunset` 1K HDRI: 1,640,864 bytes.
- HDRI attribution is stored with the runtime asset.
- Late-afternoon directional sun, limited soft shadows, maritime haze, cool
  fill, warm practical lights, and emissive cyan/violet accents replace the
  previous bright ambient look.
- If the HDRI finishes loading after a fast match start, it replaces the
  fallback sky safely without rebuilding gameplay geometry.

## Authored environment asset

`harbor-cinematic.glb` includes:

- island base, concrete seawall, dock and road network;
- east container yard, office and forklift;
- construction frame, scaffolding and tower crane;
- worker house, pitched roof and garden;
- Hunter spawn architecture;
- Dockside Bar, Neon Mart, working pier, four distinct animated boats and buoys;
- authored Ferris support structure while the wheel/cabins remain code-driven;
- restored Warehouse fire escapes, watchtower, gazebo, construction silo,
  garden pond, pier market, safety ladders and dock hardware;
- street lights, railings, crates, pallets, barrels, tires, cones, rope,
  puddles and surface dressing.

All 26 materials use base-color, normal and ORM texture inputs. Concrete,
asphalt, wood and rusty corrugated metal use 512 px derivatives of CC0 Poly
Haven PBR sources; the remaining stylized materials use generated maps.
Repeated assets carry instance metadata and collapse into `InstancedMesh`
groups at load time.

## Production asset metrics

- Compressed payload: 1,903,088 bytes.
- LOD0-only set: 39,800 triangles, 72 render meshes.
- LOD1-only set: 14,912 triangles, 24 material/impact batches.
- Shared animated/instanced geometry: 31,528 triangles with 73 estimated
  runtime draw calls after batching.
- Runtime instance groups: 29; animated boat groups: 4.
- Cinematic shell colliders: 28, with explicit door gaps for the Bar, Mart,
  worker house and Ferris ticket booth.
- Compression: `EXT_meshopt_compression`, WebP textures and mesh quantization.
- Cinematic Blender source validation: passed.
- Optimized glTF Transform validation: passed.
- Warehouse GLB: 2,960,432 bytes, 34,816 LOD0 triangles, 86 movement
  colliders including 42 exterior stair steps, 2 roof landings, and 7 gameplay
  markers.

## Warehouse and Working Dock fidelity benchmark — 2026-09-07

- The dock now has textured wood/concrete surfaces, tables, chairs, umbrellas,
  life rings, fishing-net frames, a loading davit, ladders, fenders, cleats,
  bollards and safety rails.
- The fleet now includes a sloped-cabin hero workboat with cool windows,
  waterline trim, navigation lights, mast, radar, winch and tire fenders; two
  open skiffs with gunwales, outboards and rope coils; and a loaded cargo barge.
- Boat parts retain four shared ambient-motion roots so all details bob and
  rotate with their hull.
- Low/mobile LOD meshes are consolidated by material and impact class, reducing
  that set from 72 to 24 draw-call batches while preserving foliage and water
  impact semantics.
- Development-only camera presets provide deterministic overview, Warehouse,
  Dock and fleet snapshots without affecting production controls.

## Runtime measurement

Headed Chromium on the development Mac, WebGPU, high tier after the Warehouse
and Working Dock fidelity pass:

- average frame rate with interactive ripples and caustics: approximately 69.4 FPS;
- p95 frame time: 16.6 ms;
- estimated visible draw calls: 242;
- estimated visible triangles: 127,212;
- live scene meshes: 242;
- live `InstancedMesh` groups: 25;
- movement colliders: 615, including 28 cinematic shell colliders;
- active renderer textures: 146;
- estimated active material texture memory: 39,174,144 bytes.

Headed Chromium with the forced WebGL2 backend automatically selected medium
quality and measured approximately 83.8 FPS with a 14.6 ms p95 frame time,
239 draw calls, 117,072 triangles and 39,174,144 bytes of estimated texture
memory.

The same browser forced to `?harbor=v1&renderer=webgl2` measured approximately
60 FPS, 20.1 ms p95, 2,262 visible meshes/draw calls and 1,823 geometries.
The V2 path reduces estimated visible draw calls and scene meshes by about 93%
and geometries by about 88%, while retaining the established gameplay collider
pipeline and the validated Warehouse V2 collider set.

This is a browser validation measurement, not a physical mobile GPU benchmark.

## Automated verification

- Client tests: 42/42 passed.
- Harbor server parity, water hazard, anti-cheat and hit validation: 31/31
  passed.
- Full server regression: 85/95 passed; the same 10 documented baseline
  failures remain in RoleAssigner, ScoringSystem, MatchStateMachine and
  GameplayFlow.
- Full ESLint: zero errors; 1,082 existing/advisory warnings remain visible.
- Shared, server and client production builds: passed.
- Cinematic asset build/validation/optimization pipeline: passed.
- Version consistency: passed at v1.1.0 with work tracked under `[Unreleased]`.

## Visual evidence

- Before runtime: `runtime-harbor-island-v2.png`.
- Authored Blender overview: `harbor-cinematic-preview.png`.
- Final WebGPU runtime overview: `runtime-cinematic-overview.png`.
- Forced WebGL2 runtime: `runtime-cinematic-webgl2.png`.
- Correct lobby presentation: `runtime-lobby-clean.png`.
- Final collision, fleet and detail pass: `runtime-harbor-final-repair.png`.
- Final WebGL2 fallback: `runtime-harbor-final-webgl2.png`.
- Correct ACTIVE Hunter exit: `runtime-hunter-gate-open.png`.
- Final micro-ripple ocean and fleet: `runtime-water-fleet-final.png`.
- Warehouse/Dock baseline: `snapshots/00-overview-before.png`.
- Final runtime overview: `snapshots/30-runtime-overview-final.png`.
- Final Warehouse angle: `snapshots/31-runtime-warehouse-final.png`.
- Final Working Dock angle: `snapshots/32-runtime-dock-final.png`.
- Final fleet and water angle: `snapshots/33-runtime-fleet-final.png`.
- Final forced WebGL2 fallback: `snapshots/34-runtime-webgl2-final.png`.
