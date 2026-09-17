# Development History

Last synchronized with `origin/main`: 2026-09-17.

## Release state

- Stable application version: `v1.1.0`.
- Stable tag target: `2555187` (`chore: standardize version tracking at v1.1.0`).
- Current development snapshot: `d796c8f` (`feat: improve Harbor visuals, physics and reproducible asset QA`).
- Next planned release: `v1.2.0`; changes remain in `CHANGELOG.md` under `[Unreleased]`.
- No `v1.2.0` release or tag has been approved.

## Milestones

- **2026-03-19 — v1.0.0:** first public Prop Hunt release with the Three.js client,
  Colyseus server, Harbor map, Hunter/Prop abilities, rooms, chat, voice, mobile
  controls and Vercel/Render deployment.
- **2026-07-14 — v1.1.0 feature set:** Infection mode, Sunny School, UI/game-feel
  redesign, quality tiers, post-processing, expanded HUD and client feedback.
- **2026-09-05 — version governance:** npm workspace versions aligned at `1.1.0`;
  version validator, changelog gate and release workflow added.
- **2026-09-07 — Harbor V2 foundation:** Three.js upgraded to `0.181.0`;
  WebGPURenderer with WebGL2 fallback, TSL water, PBR/GLB pipeline, Warehouse
  vertical slice and authored AC/AD edge zones introduced.
- **2026-09-08 — working districts:** Ferris Harbor, BD Container Yard and Harbor
  Market authored, validated and promoted with dedicated Blender sources,
  staging gates, runtime adapters and collision contracts.
- **2026-09-09 — gameplay and service districts:** Harbor Operations, Response
  Station, Rescue Quay, climbable ladders, moving-boat support and recoverable
  water entry added with client/server regression coverage.
- **2026-09-10 — RP03/RP04 quality passes:** native island surfaces, fleet and
  Market refinements, shore foam, filtered ripples, material realism and
  reproducible visual/asset evidence expanded.
- **2026-09-17 — merged development snapshot:** current Harbor assets, Blender
  authoring sources, visual quality RP05, physics fixes and reproducible asset QA
  consolidated on `main` at `d796c8f`.

## Current validation status

The `d796c8f` merge records passing client tests, bounded asset/physics gates,
ESLint, version consistency and production builds. Ten pre-existing server-suite
failures remain documented; therefore this snapshot is development-complete but
not approved as the `v1.2.0` release.

Detailed change tracking lives in `CHANGELOG.md`. Harbor-specific evidence and
rebuild instructions live under `docs/v2/harbor/`.
