# Harbor V2 Warehouse Validation

Date: 2026-09-06  
Decision: Warehouse slice is integrated into the default Harbor cinematic V2 environment.

## Fidelity benchmark pass — 2026-09-07

- Replaced generated flat Warehouse surfaces with compressed CC0 concrete,
  rusty corrugated-iron, wood and asphalt-derived PBR maps.
- Added a dark weathered panel roof with seams and vents, loading-door casing,
  canopy, practical lamps, side windows, downspouts, bollards and exterior
  cargo dressing.
- Completed handrails on both exterior roof routes without changing their
  verified movement colliders.
- Added deterministic overview, loading-bay, stair and interior Blender
  snapshots plus runtime Warehouse and whole-island camera presets.
- Current snapshots: `snapshots/11-warehouse-overview-after.png`,
  `snapshots/12-warehouse-loading-after.png`,
  `snapshots/13-warehouse-stairs-after.png`,
  `snapshots/14-warehouse-interior-after.png` and
  `snapshots/31-runtime-warehouse-final.png`.

## Automated checks

- `npm run version:check`: passed at v1.1.0.
- `npm run lint -- --quiet`: passed with zero errors.
- `npm run build`: passed for shared, server, and client workspaces.
- Client tests: 40/40 passed.
  - GLB collider and marker extraction.
  - Geometry/material teardown.
  - Texture cloning keeps the cached GLB template reusable after teardown.
  - Low-quality runtime selection removes LOD0 and activates LOD1.
  - V1 fallback when GLB loading fails.
  - Bullet miss, wall-mark persistence, and ground-debris cleanup.
  - Bullet marks remain attached to moving geometry.
  - Grenade projectiles do not duplicate the authoritative explosion.
  - Hunter aiming and boosted-aiming speed caps.
  - Swept ground collision for both roles and horizontal anti-tunneling for Props.
  - Ferris-wheel cabin colliders stay independent from appended GLB colliders.
  - TSL Gerstner water across quality tiers and GPU resource disposal.
  - Tree impacts shed temporary leaves and water impacts create disposable splashes/ripples without bullet holes.
- Harbor client/server map parity: passed.
- Harbor hazard, map parity, anti-cheat and hit-validation tests: 31/31 passed.
- Full server tests: 85/95 passed.
  - The same 10 pre-existing baseline failures remain visible in RoleAssigner, GameplayFlow, ScoringSystem, and MatchStateMachine.
  - No test was skipped or masked.

## Exported asset measurements

Source: Blender 5.1.1 GLB re-import validation in `tools/harbor-v2/validate_warehouse.py`.

- GLB payload: 2,960,432 bytes.
- LOD0 (medium/high): 10 render meshes, 34,816 triangles, 10 estimated draw calls.
- LOD1 (low/mobile): 16 render meshes, 192 triangles, 16 estimated draw calls.
- Movement colliders: 86, including 12 stepped gable-roof sections, 42 exterior
  stair steps and 2 roof landings.
- Gameplay markers: 7.
- Mobile static budgets: passed.
- Detailed machine-readable result: `warehouse-v2-metrics.json`.

## Runtime checks

- Local client: `http://localhost:5173`.
- Local server: `http://localhost:2567`.
- Warehouse GLB request: HTTP 200 on localhost.
- Warm local page load: 349 ms.
- Headed Chromium console after menu, room join, match start, and responsive resize: zero errors.
- The active match rendered the V2 rust-red Warehouse shell, right-side route, roof structure, and existing Harbor context.
- A live Colyseus check joined two clients to one room while a third client remained in a separate room.
  - Active room listing: 2 clients, `active`.
  - Isolated room listing: 1 client, `waiting`.
- Desktop evidence: `runtime-warehouse.png`.
- Responsive 390 x 844 evidence: `runtime-mobile-viewport.png`.
- Post-fix runtime evidence: `runtime-roof-collision-fix.png`.
- Harbor island/water evidence: `runtime-harbor-island-v2.png`.
- Harbor cinematic overview: `runtime-cinematic-overview.png`.
- Lobby lifecycle fix: `runtime-lobby-clean.png`.
- Menu evidence: `runtime-menu.png`.

The headless browser could not create a WebGL context, so runtime visual checks were repeated successfully in headed Chromium. The 390 x 844 responsive pass verifies layout and rendering at a mobile viewport, but it is not a physical-device GPU benchmark because the headed browser would not accept a mobile user-agent change.

## Gameplay and lifecycle checks

- The async loader starts during `GameManager` construction.
- If loading succeeds before map build, the procedural Warehouse and catwalk are omitted and the V2 asset is attached.
- The V2 path also omits the procedural Warehouse floor, rooftop decor, wall-run ledges, and suspended platforms while retaining exterior roof-access stairs.
- If loading fails or is not ready, the complete V1 Harbor remains available.
- A V1 room upgrades only on the next safe map-build boundary, not in the middle of active play.
- GLB movement colliders are extracted before collision meshes are removed from visual raycasts.
- Medium/high quality tiers keep LOD0; the low quality tier removes LOD0 and keeps LOD1.
- Render geometry, materials, and textures are disposed when the map is torn down.
- Existing Hunter gate and Ferris wheel references remain owned by the V1 Harbor adapter.
- Ferris cabin colliders are now passed by explicit reference; appended Warehouse colliders can no longer be overwritten by the wheel animation.
- The Warehouse gable slopes now rise toward the center ridge, with matching shallow stepped movement and server occlusion volumes instead of a flat roof volume.
- Falling movement checks sweep from the previous vertical position, and Prop horizontal movement uses substeps to prevent thin-surface tunneling.
- Interior gameplay coordinates and spawn points are unchanged. Outer map bounds now extend beyond the seawall to host four server-authoritative ocean hazard regions.
- The right-side Warehouse route remains open in both the GLB collision set and server wall-occlusion data.
- Client and server Harbor JSON now carry identical bounds, spawns, props, and wall-occlusion volumes.
- Bullet marks and ground debris continue to clear at the round boundary through the existing HIDING-phase cleanup.
- Wall marks use hit-mesh local coordinates, so marks on moving Ferris parts travel with those parts.
- Grenade projectiles, including the thrower's own projectile, use the server-provided flight time and wait for the server explosion event; translucent smoke no longer writes a large dark depth region.
- Hunter scope movement is capped at 30% of normal speed on desktop and mobile, including during an authorized boost; the server owns boost activation and enforces the same movement limit.
- Harbor now renders as an authored GLB/PBR seawall island over tiered TSL Gerstner water.
- The residential house has a pitched coastal roof, trees use clustered low-poly canopies, and the construction, container, road, and pier-market districts have denser master-plan dressing.
- Bullet impact tags are resolved through the hit object's parent chain, so all parts of a tree shed leaves and all ocean/pond/waterfall surfaces splash without persistent marks.
- Crossing the Harbor seawall into any surrounding ocean region eliminates either role on the server, broadcasts a dedicated drowning event, and transitions the local player to spectator.
- Fourteen of fifteen MatchStateMachine transition tests pass; the remaining final-reset failure is part of the documented pre-existing server-test baseline.

## Remaining device gate

- Run a physical iOS/Android frame-time pass and a two-client water-entry walkthrough.
