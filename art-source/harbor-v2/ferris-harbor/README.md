# Ferris Harbor District (zone source)

Source of truth: `ferris-harbor.blend` (Blender 5.2), generated deterministically by
`tools/harbor-v2/zones/build_ferris_harbor.py` (`main(save=True)` inside the Blender MCP
session, or `blender --background --python`) on the shared `zone_kit.py`. Edit the
builder, not the .blend. Contract: `tools/harbor-v2/zones/contracts/ferris_harbor.json`.

Status (2026-09-07): candidate `art-source/harbor-v2/_staging/ferris-harbor-candidate.glb`
(2,728,712 B) passed `validate_zone.py` and the glTF validator and was **promoted on
request** to `client/public/assets/maps/harbor-v2/zones/ferris-harbor.glb` (`promoted: true`,
`?v=20260907-fh01` in `client/src/game/world/zones/harborZones.ts`). Production clients load
it; `?harborZones=staging` still swaps in the `_staging` candidate for reviewing the next
iteration before re-promoting. Not committed.

## Collections

| Collection | Content | Exported as |
| --- | --- | --- |
| `FERRIS_STATIC` | A-frame legs, footings, bearing housings, axle, hub platform, drive train, cable conduit, boarding steps, ladder | `MESH_FERRIS_HARBOR_<MAT>_LOD0` static batches |
| `FERRIS_DYNAMIC` | twin lattice rims, spokes, cross bracing, perimeter bulbs, cabin yokes | batched per material **under** `RIG_FERRIS_HARBOR_WHEEL_ROOT` |
| `CABINS_DYNAMIC` | eight gondolas (one modular cabin, five palette colours) | `RIG_FERRIS_HARBOR_MOUNT_<i>` → `RIG_FERRIS_HARBOR_CABIN_<i>` → cabin meshes |
| `BOATS_DYNAMIC` | hero workboat, fishing launch, cargo barge, red + green skiffs, four lit buoys | `RIG_FERRIS_HARBOR_BOAT_<NAME>` roots carrying `ambientMotion=boat-<id>`, `boatMoored`, `boatLength`; buoys `buoy-<n>` |
| `DOCK_STATIC` | boardwalk, kerb + bollard rope chain, promenade, seawall cap and facing, piles, fenders, cleats, bollards, safety ladders, life rings, lamps, market, crates, nets, reel, kiosk, ticket booth | static batches + `instanceKey` props (`MESH_FERRIS_HARBOR_INST_*`) |
| `COLLISION_ZONE` | 38 `COL_MOVE_FERRIS_HARBOR_*` boxes for props this zone introduces (bollards, lamp posts, life-ring posts, market tables, crates, reel, kiosk, booth, hub platform rails) | invisible colliders merged by `buildHarborV2Map` |
| `SOCKETS` | `SOCKET_FERRIS_HARBOR_MOOR_DOCK_<k>` on the seawall cap, `SOCKET_FERRIS_HARBOR_MOOR_<BOAT>_<n>_BOAT` under each boat root (extra `dock` = cleat socket) | empties consumed by `MooringRopes` |
| `REFERENCE`, `PREVIEW_ONLY` | procedural colliders + cinematic meshes for alignment, never exported | — |

## Gameplay contract (unchanged)

* Wheel hub (-10, 12, 34), ring radius 8, mount radius 8.5, eight 1.8 × 2.2 × 1.4 m cabins.
  `buildFerrisWheel` still creates the pivot, mount and hinge groups and the 40 cabin
  colliders + platform carry; with the zone active it runs with `ferrisVisuals: false`
  (meshes stripped) and `FerrisHarborRig.setAngle(pivot.rotation.z)` turns
  `WHEEL_ROOT` and counter-rotates every `CABIN_<i>` so the gondolas hang upright at
  exactly the collider centres (test `FerrisHarborRig.test.ts`).
* Boardwalk collider (-20..50, top 0.18, z 34..42), pier kerb (top 0.5, z 41.8..42.2),
  promenade slab, seawall parapet (0..0.9, z 46.55..47.45) and its rails are procedural
  and untouched; the zone dresses them. The legacy 72 m boardwalk slab is carved
  (`carveNames` box z 33..43) and replaced end to end (x -20..51) by the timber deck.
* The legacy parapet is one island-wide box (`base_MESH_concrete_warm_LOD0`), so it is
  clad (5 mm off the wall, under the cap) instead of carved — carving would drop it
  outside the district too.
* Water level -0.8. Boats float on the sampled Gerstner surface (`HarborAmbientMotion`),
  moored hulls are damped; nothing in the fleet moves, so no wakes are pooled.
* Clearance volumes: promenade route (z 43..46.3), boardwalk lane (z 39.3..41.6), the
  three platform lanes around the wheel base. Cabins and the wheel root are exempt.

## Pipeline

```bash
npm run harbor:v2:preflight-ferris-harbor   # dump colliders -> export -> validate_zone (contracts/ferris_harbor.json) -> glTF validator -> client tests
```

Dev presets (`window.__catchAndRunView`): `ferrisHarbor`, `ferrisHarborRoute`,
`ferrisHarborWater`, `ferrisHarborTop`, `ferrisHubDetail`, `ferrisCabinDetail`,
`workboatDetail`, `fleetDetail`. Blender previews: `preview_render.render_views(...)`
with the same eye/target pairs (`_staging/renders/ferris-blender-*.png`, disposable).

Re-promotion (only on request, after the preflight passes again): copy the candidate +
`.metrics.json` over `client/public/assets/maps/harbor-v2/zones/ferris-harbor.glb`, bump
the `?v=` token, re-run `harbor:v2:test-ferris-harbor`, lint, build and an in-game
WebGPU + WebGL2 check without `?harborZones=staging`.
