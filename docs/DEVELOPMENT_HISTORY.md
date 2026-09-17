# Development History

Last synchronized with `origin/main`: 2026-09-17.

## Release state

- Current stable application version: `v2.0.0`.
- Previous stable version: `v1.1.0`, tagged at `2555187`.
- V2 is based on the merged Harbor development snapshot `d796c8f` and the
  synchronized documentation in `d7117f7`.
- `CHANGELOG.md` now contains the dated `[2.0.0]` release section.
- `[Unreleased]` is open for changes after V2.

## Milestones

- **2026-03-19 - v1.0.0:** first public Prop Hunt release with the Three.js
  client, Colyseus server, Harbor map, Hunter/Prop abilities, rooms, chat,
  voice, mobile controls and Vercel/Render deployment.
- **2026-07-14 - v1.1.0 feature set:** Infection mode, Sunny School,
  UI/game-feel redesign, quality tiers, post-processing, expanded HUD and
  client feedback.
- **2026-09-05 - version governance:** npm workspace versions aligned at
  `1.1.0`; version validator, changelog gate and release workflow added.
- **2026-09-07 - Harbor V2 foundation:** Three.js upgraded to `0.181.0`;
  WebGPURenderer with WebGL2 fallback, TSL water, PBR/GLB pipeline, Warehouse
  vertical slice and authored AC/AD edge zones introduced.
- **2026-09-08 - working districts:** Ferris Harbor, BD Container Yard and
  Harbor Market authored, validated and promoted with dedicated Blender
  sources, staging gates, runtime adapters and collision contracts.
- **2026-09-09 - gameplay and service districts:** Harbor Operations, Response
  Station, Rescue Quay, climbable ladders, moving-boat support and recoverable
  water entry added with client/server regression coverage.
- **2026-09-10 - RP03/RP04 quality passes:** native island surfaces, fleet and
  Market refinements, shore foam, filtered ripples, material realism and
  reproducible visual/asset evidence expanded.
- **2026-09-17 - v2.0.0:** Harbor visual and physics improvements, Blender
  authoring sources, visual-quality RP05 and reproducible asset QA consolidated
  on `main` and promoted to the V2 application release.

## V2 validation status

At release preparation:

- Client suite: 382/382 tests passed.
- Harbor asset gate: 36 Node tests and 23 client integration tests passed.
- Version consistency, ESLint and production builds passed.
- Server suite: 99 tests passed and 10 pre-existing baseline tests failed in
  RoleAssigner, ScoringSystem, GameplayFlow and MatchStateMachine.

The server failures remain explicit release caveats; no gameplay rules were
changed merely to force old expectations green.

Detailed release tracking lives in `CHANGELOG.md`. Harbor-specific evidence and
rebuild instructions live under `docs/v2/harbor/`.
