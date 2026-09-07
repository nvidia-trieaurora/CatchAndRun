# AC — Waterfront Residential Garden (zone source)

Source of truth: `garden-ac.blend` (Blender 5.2). It is generated deterministically by
`tools/harbor-v2/zones/build_garden_ac.py` (run inside the interactive Blender MCP
session; `G.main(save=True)` rebuilds the whole scene) on top of the shared kit in
`tools/harbor-v2/zones/zone_kit.py`. Edit the builder, not the .blend, then rebuild.

## Contract

* Visual pass only. Gameplay collision stays in `oldHarborFortnite.ts`
  (`buildBackyardHouse`, `buildBackyardGarden`, lamp posts) and the cinematic
  `COL_MOVE_CINE_HOUSE_*`. The 120 procedural colliders that intersect the zone are
  imported as locked wire volumes in the `COLLISION` collection so every visual can be
  checked against them; nothing in `COLLISION` / `REFERENCE` / `PREVIEW_ONLY` exports.
* Zone footprint x -56..-17, z 11.5..48 (Three.js). Reference orientation of the concept
  boards: image up = +x (east, warehouse side), image right = +z (south seawall).
* House: 10 x 8 m, two 5 m floors, plaster walls 0.5 m, collision-open 5 x 2 m side
  window bands (open shutters + thin mullions only), 3 m double front door, 5 m 2F
  loggia opening onto the balcony, walkable 4-degree gable roof (ridge 13.65 m, eaves
  10.95 m — matches the stepped roof colliders within ±0.35 m), brick chimney to 12.85 m,
  interior stairs along the west wall, furniture on every interior collider.
* Garden: octagonal koi pond inside the 7 x 7 m coping collider, four triangular planter
  boxes in the square corners, west bridge, rock island with stone pagoda lantern (2.4 m
  collider), raised herb bed (4.3 x 4.3 x 0.3), stone lanterns, stone bench, stepping
  stones, reeds, shrubs, grass tufts, boulders, six trees, five lamp posts.
* Batching: one mesh per material (+ impact/motion tag) → 21 LOD0 / 11 LOD1 draw calls.
  Names carry the runtime tokens: `BASE_` (no shadow casting), `IMPACT_FOLIAGE_`,
  `IMPACT_WATER_`, and the `ambientMotion` extra (`sway-canopy`, `sway-grass`,
  `sway-reed`, `lily-bob`, `pond-ripple`, `lamp-flicker`) consumed by
  `client/src/game/world/zones/ZoneAmbientMotion.ts`.
* Textures: Poly Haven CC0 sets in `tools/harbor-v2/textures/garden-pbr/` derived to
  ≤1024² Base / ≤512² Normal / 256² ORM plus procedural cutout cards
  (`foliage_cards.py`). One nearest-filtered palette texture covers all flat props.

## Pipeline

```bash
npm run harbor:v2:dump-colliders      # refresh art-source/harbor-v2/_staging/procedural-colliders.json
npm run harbor:v2:preflight-garden    # export -> validate_zone (contracts/garden.json) -> glTF validator -> client tests
```

Review the candidate in-game without promoting: `http://localhost:5173/?harborZones=staging`
(Vite serves `_staging/` under `/staging-assets/`), then use the dev presets
`acGarden`, `acGardenRoute`, `acGardenReverse`, `acGardenTop`, `acGardenDetail`
(`window.__catchAndRunView(...)`) or the headless capture helper in `_staging/`.

Promoted 2026-09-07 to `client/public/assets/maps/harbor-v2/zones/garden-ac.glb`
(`promoted: true` in `harborZones.ts`); re-promote only after the preflight passes again.
