# Harbor V2 edge zones — AC garden / AD construction validation (2026-09-07)

Status: both zones were validated as staging candidates and then **promoted on
request (2026-09-07, 16:40)**: the byte-identical candidates now live at
`client/public/assets/maps/harbor-v2/zones/garden-ac.glb` (sha256 0885 0727…, 2,166,216 B)
and `.../zones/construction-ad.glb` (sha256 1445 a376…, 2,211,672 B) with their
validator `.metrics.json`, and `promoted: true` (+ `?v=20260907-ac01|ad01`) in
`client/src/game/world/zones/harborZones.ts` makes production clients load them.
Nothing was committed or pushed. Version gate: package version 1.1.0, work
recorded under `CHANGELOG.md` → `[Unreleased]` (v1.2.0).

## Sources and candidates

| Zone | Source of truth | Candidate (`art-source/harbor-v2/_staging/`) | Payload | LOD0 | LOD1 | GPU tex. est. |
| --- | --- | --- | --- | --- | --- | --- |
| AC garden | `art-source/harbor-v2/garden/garden-ac.blend` (built by `tools/harbor-v2/zones/build_garden_ac.py`) | `garden-ac-candidate.glb` + `.metrics.json` | 2,166,216 B (2.07 MiB) | 21 batches / 12,558 tris | 11 / 896 | 35.5 MiB |
| AD construction | `art-source/harbor-v2/construction/construction-ad.blend` (`build_construction_ad.py`) | `construction-ad-candidate.glb` + `.metrics.json` | 2,211,672 B (2.11 MiB) | 19 batches / 21,398 tris | 11 / 632 | 35.6 MiB |

Both pass `validate_zone.py` (naming, single material per batch, `harborZone`
extras, budgets, footprint, clearance volumes, 488-collider parity against
`_staging/procedural-colliders.json`) and the official glTF validator (0 errors,
0 warnings). Textures are WebP (`EXT_texture_webp`), ≤1024 px base colour (hero surfaces
only), ≤512 px normal/ORM, Poly Haven CC0 (`tools/harbor-v2/textures/ATTRIBUTION.md`)
plus procedural palette, leaf, grass, reed and grating cards.

## Collider / marker parity

- Zone GLBs contain no `COL_MOVE_*` or `MARKER_*` nodes (test
  `ZoneAssets.test.ts › never lets a zone GLB contribute movement colliders`).
- Gameplay collision is unchanged: 488 procedural AABBs from
  `buildOldHarborFortniteMap({ useWarehouseV2, cinematicVisuals, quality: 'high' })`
  plus the `COL_MOVE_CINE_*` set; runtime `colliderCount` is 628 before and after.
  `warehouse.manifest.json` and `harbor-cinematic.manifest.json` were not touched.
- Every walkable surface in both zones sits on an existing collider (1 mm
  authoring tolerance in the builders); the validator's clearance volumes keep the
  front-door/porch/loggia openings (AC) and the Warehouse west-stair approach,
  scaffold-bridge and tower headroom, silo platform headroom and the slab south
  corridor (AD) free of geometry.

## Runtime metrics (headless Chrome, 1600×900, solo explore, high tier)

Scene-wide counts from `window.__catchAndRunMetrics` (identical across presets,
so they are worst-case "everything resident" figures, not per-view culled counts).

| Configuration | Backend | Draw calls | Triangles | GPU textures | Est. texture memory | FPS avg | Frame p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Baseline (`?harborZones=off`) | WebGL2 | 254 | 152,912 | 119 | 47.1 MiB | 60 (vsync) | 16.8–18.1 ms |
| Baseline (`?harborZones=off`) | WebGPU | 258 | 163,160 | 132 | 47.1 MiB | 60 (vsync) | 17.2–17.3 ms |
| AC + AD staging | WebGL2 | 261 (+7) | 173,676 (+20.8k) | 203 | 100.5 MiB | 60 (vsync) | 17.4–18.0 ms |
| AC + AD staging | WebGPU | 265 (+7) | 183,924 (+20.8k) | 216 | 100.5 MiB | 60 (vsync) | 16.8–17.9 ms |

Console: 0 errors / 0 exceptions in every capture (WebGL2 forced and WebGPU),
only the pre-existing `[VoiceChat] Mic access denied` warning. Zone GLB payload
≤6 MiB each ✔, desktop texture memory ≤128 MiB ✔, no leaks observed across the
six room create/leave cycles.

Gates not met (baseline already over them):

- High-tier draw calls 261 vs gate 250 — baseline is 254; the zones add a net +7
  after removing ~33 legacy batches. Reaching 250 needs base-map batching, not
  zone work (candidate zone savings: fold `rust_dark`/`roof_metal_dark`/`glass`
  into the palette in AD, `plaster_interior`/`wood_interior`/`rock`/`steel` in AC ≈ −7).
- Triangles 173.7k vs preferred 150k (baseline 152.9k).
- Frame p95 17–18 ms vs ≤16.7 ms: headless Chrome is vsync-capped at 60 FPS and
  reports the same p95 for the baseline, so this needs a headed run on the
  target GPU before it can be read as a regression.
- Mobile texture budget ≤64 MiB: not met at high tier (100.5 MiB est.); the low
  tier drops normal maps and AO but has not been measured. Mitigation: KTX2/Basis
  UASTC for zone textures (transcoder already shipped under
  `client/public/assets/basis/`) or 512 px low variants; the
  galvanized/safety-yellow/navy sets are also embedded twice (warehouse.glb and
  construction-ad.glb).
- Low-tier draw calls (gate ≤120) were not measured in this pass.

## Snapshots (six angles, before = `?harborZones=off`, after = staging)

`art-source/harbor-v2/_staging/snapshots/` (disposable, gitignored):
`before-ac-*`, `after-ac-webgl2-*`, `after-ac-webgpu-*`, `before-ad-webgl2-*`,
`after-ad-webgl2-*`, `after-ad-webgpu-*`, `before-zones-webgpu-*` with a
`*-report.json` per run (`*-6angle-report.json` for the full AD runs). Presets:
`overview`, `acGarden|adConstruction` (cinematic wide), `*Route` (eye level),
`*Reverse`, `*Top` (fov 18 from 140 m), `*Detail`. Capture helper:
`_staging/capture_runtime_view.mjs` (needs `npm run dev`; creates its own room).

## Test / lint / build

- `npm run test -w client -- --run`: 15 files, 67 tests passed (includes 6 in
  `ZoneAssets.test.ts`: carve-by-centroid, legacy zone removal + merged LOD1
  carve, ground-preserving `carveNames`, no colliders from zone GLBs, staging URL
  resolution, promotion gate).
- `tsc -p client --noEmit`: clean. `npm run lint`: 0 errors (1,088 pre-existing
  warnings repo-wide).
- `npm run build` (shared → server → client): success.
- `npm test` (server): 85 passed / 10 failed — the **same 10 baseline failures**
  as before this work (GameplayFlow ×3, MatchStateMachine ×1, RoleAssigner ×2,
  ScoringSystem ×4; scoring/role/phase logic not touched here). No new
  regression. `server/tests/mapDataParity.test.ts` passes.

## Design deviations forced by the collider contract (AD)

- No collider exists for a south-west utility building, so it is an open-sided
  material shelter over the collider'd pallets instead of a closed dark building.
- The procedural 0.6 m × 10 m "crane" collider at (-27, -30) is read as a
  floodlight mast; the 27 m tower crane at (-48, -31) stays collider-free (as the
  legacy cinematic crane was) with hoist cables + hook on `hang-sway`.
- The "elevated galvanized ramp beside the Warehouse" is the existing Warehouse
  west exterior stair (`COL_MOVE_EXT_STAIR_WEST_*`); the slab keeps its approach clear.
- I-beams only on the z -29 / -22 rows and pours only in the south-east bay,
  because the scaffold platforms, bridge, shoring deck and tarp occupy the other
  bays at walkable heights (the legacy floors cut straight through those routes).

## Remaining risks

- Thin visual-only elements (window mullions, ladder cage hoops, crane lattice
  legs, shelter posts, tape barriers, cones, reeds) have no collider by design;
  players pass through them, none blocks or creates a route.
- Zone overrides key off the cinematic `harborZone` tags and the `harbor_*`
  merged batch names; if the cinematic build is regenerated with different tags
  or names, update `harborZones.ts` (covered by tests for the current names).
- `tools/harbor-v2/zones/__pycache__/` (from the MCP session) and
  `tools/harbor-v2/__pycache__/`, `.context/` are untracked and not gitignored —
  do not commit them (`.gitignore` is modified by another agent, so it was left alone).
- Editing `GameManager.ts` while a capture is running triggers a Vite full
  reload and breaks that capture; run captures between edits.

## Follow-up 2026-09-07 evening — ladders and walk-through props

Playtest feedback: vertical ladders could not be climbed and several AD props were
walk-through. Root cause of the ladders: the legacy "walk up the rungs" step
colliders share one footprint, so the body box (blocked above STEP_UP) never lets
the narrower ground probe reach them. Fixes, all verified (85 client tests, tsc,
lint 0 errors, build, WebGPU capture with 0 console errors, runtime `colliderCount`
628 → 642):

- `client/src/game/controllers/LadderClimb.ts`: `detectLadderVolumes` turns every
  stack of ≥4 rung colliders (footprint ≤0.8 m / ≤0.4 m², rises ≤0.6 m, total
  ≥1.5 m) into a ladder — silo, secondary scaffold, access scaffold, cargo-net
  frame, watchtower. `LadderClimber` grabs when the body pushes into the column
  (W toward it), climbs W/S at 2.6 m/s with rung-synchronised camera/mesh sway and
  roll, mantles over the top rung onto the deck in 0.32 s, releases with a hop on
  jump or when descending to the bottom rung. Wired into `HunterController`,
  `PropController` and `GameManager` (per-map `setLadders`). Anti-cheat headroom:
  climb 2.6 m/s and mantle ≈4 m/s vs the 1.2× speed envelope (Hunter 10, Prop 8).
- Zone contract extension: a zone GLB may ship `COL_MOVE_<ZONE>_*` boxes from its
  `COLLISION_ZONE` collection (`ZoneKit.collider`); exporter/validator accept them,
  the validator rejects overlap with procedural colliders, footprint or clearance
  violations and a count over `budgets.zoneColliders`; `buildHarborV2Map` merges
  them with the zone. AD ships 14: crane mast + pad, shelter posts + roof, cable
  reel, two formwork stacks, four rebar cages.
- AD visuals: shelter narrowed to x -46..-42.6 (it used to pierce the frame column
  at -42/-15), formwork stack moved off the tarp pile, silo leg bay fenced with
  mesh skirts (opening at the ladder cage) so the solid 4.4 m box collider matches
  what players see. Candidate re-exported (2,242,764 B, 19 LOD0 / 21,564 tris),
  validated, glTF-clean and promoted (`?v=20260907-ad02`).

Still passable by design: cones, hard hats, tape barriers, tripods, sign posts,
and the scaffold cross-tubes.

### Climbable crane (same evening, promoted as `?v=20260907-ad03`)

Thinh asked for a vertical ladder up the crane for Prop hides and a map view.
Built as a real tower-crane climb: hollow lattice mast (4 leg + 4 wall colliders,
south wall starts above a 3.3 m braced door with jambs, sill and sign), interior
rung ladder shipped as `COL_LADDER_CONSTRUCTION_CRANE_LADDER` with
`ladderApproach="+z"` (grabbable only from inside the shaft; `MapAssetLoader`
turns `COL_LADDER_*` nodes into colliders + `ladders`, `GameManager` merges them
with the detected rung stacks), a 3.6 × 3.6 m grating viewing ring at 24.15 m with
rails/toe boards/brackets that the mantle lands on, a six-tread ship ladder on the
south strip up to the slewing deck (26.5 m), slewing-ring/turntable colliders
trimmed to the mast footprint (head clearance on the ring), cab shell, jib grating
catwalk with handrail lines to the trolley, counter-jib deck. 37 shipped colliders;
24,054 LOD0 tris; validator + glTF clean; 88 client tests (crane shaft climb
simulated door → shaft → ring); capture on WebGPU 0 errors, colliderCount 665.
Gameplay data change: `harbor-warehouse.json` `bounds.max.y` 25 → 36 in both the
client and server copies (parity test passes) — the anti-cheat previously rejected
any position above 25 m, which would have frozen a Hunter's eye position (feet + 1.6)
on the ring. Water hazard volumes were left at 25 m so nothing on the crane is lethal.

## Promotion procedure (done 2026-09-07; repeat for future candidates)

1. Copy `_staging/<zone>-candidate.glb` (+ `.metrics.json`) →
   `client/public/assets/maps/harbor-v2/zones/<zone>.glb`; confirm the hash matches.
2. Set `promoted: true` for the entry in `harborZones.ts` and bump the `?v=` token.
3. Re-run `npm run harbor:v2:test-zones` (the suite fails if a promoted zone has
   no production file), `npm run lint`, `npm run build`, then a WebGPU + forced
   WebGL2 in-game check **without** `?harborZones=staging`; move the CHANGELOG
   entry out of `[Unreleased]` at release time.
