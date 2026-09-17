# RP03 shipped structural route repairs

This is a bounded collision/visual-parity repair, not a claim that every angle or
possible player trajectory across the island has been verified. Investigation
uses actual shipped High/Low GLBs, the loader's zone overrides, and procedural
collision. Native source changes were made with Blender 5.2.1; original realism
sources were not overwritten. No cloud GPU or new render was needed for this pass.

## Confirmed defects and repairs

- Garden Low had sealed side windows, a sealed upper loggia, a solid chimney and
  roof over its flue, and no correctly placed visible second-floor support.
  Its existing gameplay openings already worked. Replaced only the exact Low
  primitives with segmented openings, a hollow flue/roof opening, and reused High
  interior batches. All High render geometry and existing protected nodes stayed
  unchanged. The old cinematic Low wood floor must also be carved inside
  `[-40.3, .45, 17.7]`–`[-29.7, 10.7, 26.3]` so its y=4.75 plane cannot coexist
  with the actual second floor at y=5.55. This carve is now integrated and pinned
  by the actual cinematic GLB regression in `HarborIslandSurfaces.test.ts`.
- Construction's two visible concrete pours at y=3.5 and 6.7 had no movement
  support. Added three native boxes, splitting the lower slab around an existing
  procedural shoring column. No High or Low render geometry changed. Exact names
  are `COL_MOVE_CONSTRUCTION_RP03_POUR_1`, `_POUR_1_RETURN`, and `_POUR_2`.
- Operations Low used a solid building shell and 0.9 m base across all three
  supposedly open entrances. Rebuilt only that Low shell/base with matching door
  openings, visible floor at y=.252 and native fixture masses. The ocean annex
  remains intentionally closed. Operations High also had an actual closed west
  leaf, continuous base/dado, and thin plinth flashing crossing the doorways.
  Moved the exact leaf north against its adjacent wall and split the exact west
  base/dado and west/south flashing strips at the openings. High triangles outside
  the five recorded narrow exception bounds are signature-verified unchanged.
  Existing Operations colliders and all 296 protected nodes remain unchanged.

## Sources and delivery

Native sibling sources:

- `art-source/harbor-v2/garden/garden-ac-structural-rp03.blend`
- `art-source/harbor-v2/construction/construction-ad-structural-rp03.blend`
- `art-source/harbor-v2/operations-ab/operations-ab-structural-rp03.blend`

Production GLBs and metrics in `client/public/assets/maps/harbor-v2/zones/` have
been promoted. Backups, candidate exports, runtime exports, source/protected-node
reports and promotion manifests are retained in
`art-source/harbor-v2/_staging/structural-rp03/`. Existing scene changes elsewhere
in the dirty worktree were preserved. Runtime URL cache versions for all three
assets have been updated to `20260910-rp03` with the matching staging candidates.

| Asset | Runtime bytes | High triangles / draws | Low triangles / draws | GLB movement colliders |
| --- | ---: | ---: | ---: | ---: |
| Garden | 2,418,196 | 13,620 / 22 | 3,270 / 13 | 0; existing procedural collision |
| Construction | 2,685,880 | 25,434 / 20 | 644 / 11 | 40 |
| Operations | 3,143,904 | 33,658 / 17 | 632 / 7 | 28 |

All fit the existing zone budgets. No new textures or dynamic draw categories.
Runtime finalization quantizes colors only, with exact VEC3 accessor preservation.

SHA-256:

- Garden: `eba957f86623f8921d7e10dd426a6c88c3e074b9681200abf33a7a4e0dfbe762`
- Construction: `cbae198daf1de59fcc51d57c6899cd8f89ddcd685bfc3bd1228189aa04628049`
- Operations: `539236b2f4f5988bcb4d1b28f4c6c53de7c2b6a5c6ce740f1659315d7e8a1239`

## Verification

`ShippedStructuralRoutes.test.ts` initially failed 6 of 8 cases against original
production assets. All 8 pass against the staged exports and then promoted
production assets. It checks all three Operations entrances at ankle, trim and
torso heights, High/Low Garden routes and true second-floor height, and native
Construction geometry/support parity. Seven focused suites pass 36 tests total;
the new structural test passes ESLint. Each GLB has zero glTF validation errors
and passes the existing Blender zone contract validator, including budgets.

The native build scripts also assert original source hashes, protected-node
signatures and High triangle preservation outside explicit Operations bounds.
Static full-scene audit reports are `structural-route-audit.json` (before) and
`structural-route-audit-after.json` (after integration); these are measured rays,
not an exhaustive capsule/path audit or an FPS benchmark. Root performs final
runtime walkthrough and performance QA separately.

Rebuild:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/harbor-v2/repair_structural_routes.py
node tools/harbor-v2/finalize_structural_routes.mjs
```

Run `validate_zone.py` separately for each staged `*-runtime.glb` with its zone
name (`GARDEN`, `CONSTRUCTION`, `OPERATIONS_AB`) and corresponding
`*-runtime.metrics.json`, then run the structural suite with
`HARBOR_STRUCTURAL_STAGING=1`. Only promote with
`node tools/harbor-v2/finalize_structural_routes.mjs --promote` after those fresh
metrics and regressions pass; promotion refuses missing/stale metrics and keeps
the previous GLB as a recoverable backup.
