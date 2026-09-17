# RP03 fleet marine-paint pass

Only `MAT_HULL_CREAM` and `MAT_HULL_NAVY` were edited in native Blender. Their rusty, vertically striped base/ORM bindings were replaced by dielectric marine-paint factors. Cream uses linear RGB `(0.58, 0.59, 0.53)`, roughness `0.38`; navy uses `(0.013, 0.042, 0.062)`, roughness `0.36`. Both use metallic `0`, retain the original normal texture at strength `0.12`, and retain baked vertex-color AO. No raster files were created or edited. Timber decks and all other materials remain unchanged.

## Native source and pipeline

- Input preserved: `art-source/harbor-v2/ferris-harbor/ferris-harbor-ticket-repair.blend`.
- New sibling: `art-source/harbor-v2/ferris-harbor/ferris-harbor-fleet-rp03.blend`.
- Builder/export: `tools/harbor-v2/polish_harbor_fleet.py`, using the existing `export_zone_scene.py`.
- Finalizer: `tools/harbor-v2/finalize_harbor_fleet.mjs`; quantization is limited to COLOR attributes, matching the existing production pipeline.
- Staging: `art-source/harbor-v2/_staging/fleet-rp03/`.

Default finalization does **not** promote. After native review, `node tools/harbor-v2/finalize_harbor_fleet.mjs --promote` requires fresh successful native metrics, exact candidate SHA and an unchanged production baseline; it saves the previous production GLB before publishing.

This candidate was approved after the native 1600px review and promoted after boat QA finished. The previous production GLB is retained at `art-source/harbor-v2/_staging/fleet-rp03/pre-fleet-rp03-d660d36caa4b.glb`. The 4K native preview was also rendered and visually checked.

## Verification

All 659 native scene objects retained identical geometry, transforms, parenting, collections, material slots, UVs and vertex colors. Against the current production GLB, all 303 exported nodes retained identical indices, positions, normals, tangents, UVs, COLOR AO, transforms, children and extras. Material comparisons use node/primitive bindings because Blender emits same-named material variants for different UV sets. Only the two intended hull materials changed.

- Colliders: 50, unchanged.
- LOD0: 36,388 triangles, 90 estimated post-instancing draws, unchanged.
- LOD1: 3,460 triangles, 26 draws, unchanged.
- Payload: 2,988,060 bytes, down from 3,014,476.
- glTF validation: 0 errors, 0 warnings.
- SHA-256: `76a6bb0a733a5f1bcf692041336d772dc44b0d28f806b56c6aaf18c9738bd07f`.

`fleet-marine-paint-1600.png` and `fleet-marine-paint-3840.png` are native Eevee material previews, not game-runtime or ocean previews. Rigged LOD1 duplicates are hidden only during these disposable renders; no preview flags or lighting changes are saved to the source.
