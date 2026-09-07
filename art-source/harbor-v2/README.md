# Harbor V2 Blender authoring

This directory is the editable source-of-truth for interactive Blender and
Blender MCP work. Production GLBs under `client/public/assets` must not be
overwritten directly from an exploratory MCP session.

## Workspace

- Source scene: `warehouse/warehouse-v2.blend`
- Disposable exports: `_staging/` (gitignored)
- Units: Metric, scale `1.0`; Blender is Z-up and glTF export converts to Y-up.
- The current runtime `warehouse.glb` seeds the source scene so gameplay
  dimensions, custom properties, markers, and collider names remain intact.

Collections in the source scene:

- `RENDER_LOD0`, `RENDER_LOD1`, `RENDER_SHARED`
- `COLLISION`, `MARKERS`, `SOCKETS`
- `REFERENCE`, `PREVIEW_ONLY`

## Blender MCP on this workstation

Blender 5.2 has the `MCP for Blender` add-on enabled and auto-starts its local
socket on `127.0.0.1:9876`. Codex is configured machine-wide to launch the
pinned `blender-mcp==1.9.1` server with telemetry disabled and safe mode on.
The Codex desktop app must be restarted once after an MCP configuration change.

Open `warehouse/warehouse-v2.blend` before asking Codex to edit the scene. In
Blender, the viewport's `N` sidebar → `MCP for Blender` should say connected on
port 9876. Use only one MCP client against the Blender socket at a time; do not
run Blender commands from Cursor and Codex simultaneously.

Keep the contracts from `docs/v2/harbor/harbor-v2-art-bible.md`:

- Render LODs end in `_LOD0` or `_LOD1`.
- Meshes visible at every quality tier belong in `RENDER_SHARED`; they count
  against both LOD budgets.
- Movement colliders start with `COL_MOVE_`.
- Gameplay markers start with `MARKER_`.
- Preserve imported custom properties such as `instanceKey`, `harborZone`,
  `ambientMotion`, `gameplayRole`, and `weaponImpactKind`.

## Safe workflow

Create the authoring file once:

```bash
npm run harbor:v2:bootstrap-authoring
```

Before a major MCP edit, save a versioned Blender checkpoint. Export only to
staging and validate it:

```bash
npm run harbor:v2:preflight-authoring
```

RP01 is the first geometry realism slice for the front loading facade. It adds
the portal frame, corrugated ribs, folded maritime bifold-door hardware, roof
seams/fasteners, gutter trim, bracing, dock bumpers, and safety accents as five
single-material meshes:

- `MESH_WAREHOUSE_RP01_CORRUGATED_RED_LOD0`
- `MESH_WAREHOUSE_RP01_GALVANIZED_LOD0`
- `MESH_WAREHOUSE_RP01_RUBBER_DARK_LOD0`
- `MESH_WAREHOUSE_RP01_SAFETY_YELLOW_LOD0`
- `MESH_WAREHOUSE_RP01_STEEL_NAVY_LOD0`

After applying `tools/harbor-v2/apply_warehouse_realism_pass.py` through the
interactive Blender MCP session, save the `.blend`, then run the stricter
profile and its disposable 4K review render:

```bash
npm run harbor:v2:preflight-rp01
npm run harbor:v2:render-rp01-preview
```

The RP01 profile verifies all five nodes and their GLB extras, caps the slice at
22,000 triangles/five draw calls, rechecks the collider/marker manifest, runs
the glTF validator, and executes the warehouse loader/collision tests. Preview
objects exist only in the background render process and are never promoted.

RP01 is intentionally desktop `LOD0` detail and therefore disappears at low
quality. Gameplay-critical geometry must receive a matching `LOD1` or live in
`RENDER_SHARED`.

SC01/SC02 are the follow-up coherence passes. SC01 removes the shallow side
window plates and trim, disconnected downspout placeholders, and the decorative
catwalk stair that had no collision route. It also hides `LOD1`, colliders, and
markers in the authoring viewport and disables X-Ray so opposite-side geometry
does not read as floating duplicates. SC02 preserves every gameplay volume but
adds explicit load paths for the exterior stairs and suspended platform, then
rebuilds the three buried skylights above the pitched roof with curbs.

Apply these scripts in order through the interactive Blender MCP session:

```text
tools/harbor-v2/apply_warehouse_coherence_cleanup.py
tools/harbor-v2/apply_warehouse_structural_support.py
```

After saving the authoring scene, run the complete geometry/collision gate and
the four-angle visual audit:

```bash
npm run harbor:v2:preflight-sc02
npm run harbor:v2:render-coherence-audit
```

The SC02 profile requires five single-material support batches, rejects the
legacy buried skylight batch and known unsupported placeholder volumes, keeps
all 86 movement colliders and seven markers on their manifest transforms, caps
SC02 at 12,000 triangles/five draw calls, and runs the glTF and client tests.
The renderer produces disposable east, west, interior-platform, and roof views
under `_staging/renders/`; it never saves the opened `.blend`.

PBR01 is the material pass that followed SC02. It replaced the 64 px flat
placeholders and 512 px cube-mapped tiles with Poly Haven CC0 sets from
`tools/harbor-v2/textures/warehouse-pbr/` (see its `ATTRIBUTION.md`), re-projected
every render mesh with world-space box UVs (`spec.json` tile sizes), and rebuilt
the seven textured materials as Base Color + OpenGL Normal + ORM with the
`glTF Material Output` occlusion hook. Glass became plain alpha blend (no
`KHR_materials_transmission`), warm lights are emissive, and the collision
debug material is untextured. The export script now writes WebP textures by
default (`--image-format`, `--image-quality`), which is what keeps the textured
Warehouse at roughly 4.9 MB against the 6 MB mobile payload cap. Geometry is
untouched, so `warehouse.manifest.json` did not change.

Runtime texture filtering is handled in `client/src/game/world/assets/MapAssetLoader.ts`
(`anisotropyForQuality`: low 1×, medium 4×, high up to the renderer maximum;
AO intensity 0.85, disabled on low; transparent glass does not write depth).

The preflight refuses exports outside `_staging/`, checks the official glTF
specification, enforces triangle/draw-call/payload budgets, and compares every
collider AABB and marker position with `warehouse.manifest.json` (1 mm
tolerance). Update that gameplay manifest deliberately when a gameplay contract
really changes; visual-detail work should leave it untouched.

The imported seed asset's known generated-tangent-space warning is ignored, but
all glTF specification errors still fail the command. New normal-mapped hero
meshes should receive valid MikkTSpace tangents during the later optimization
stage rather than forcing invalid zero tangents from the legacy geometry.

Only promote a candidate into `client/public/assets/maps/harbor-v2` after the
validator and client tests pass. The existing procedural build commands reset
Blender and write production assets, so do not run them inside the interactive
authoring session.

## Edge zones (AC garden, AD construction)

The two waterfront corners are separate zone sources, `garden/garden-ac.blend`
and `construction/construction-ad.blend`, generated by the deterministic builders
in `tools/harbor-v2/zones/` (`build_garden_ac.py`, `build_construction_ad.py` on
the shared `zone_kit.py`; run `C.main(save=True)` inside the MCP session). Each
zone README documents its collider contract. Gameplay collision stays with the
procedural map and `harbor-cinematic.glb`; a zone GLB carries no `MARKER_*` nodes
and only the `COL_MOVE_<ZONE>_*` boxes from its `COLLISION_ZONE` collection
(`ZoneKit.collider`) — movement colliders for props the zone itself introduces,
which the validator rejects if they overlap a procedural collider, leave the
footprint or enter a clearance volume. The pipeline per zone is:

```bash
npm run harbor:v2:dump-colliders          # procedural gameplay AABBs -> _staging/procedural-colliders.json
npm run harbor:v2:preflight-garden        # export -> validate_zone (contracts/garden.json) -> glTF -> zone tests
npm run harbor:v2:preflight-construction  # same for AD
```

Review candidates in the dev client with `?harborZones=staging` (served from
`_staging/` by the Vite middleware) and the six `acGarden*` / `adConstruction*`
snapshot presets; `?harborZones=off` shows the legacy cinematic visuals for a
before/after pair. Promotion copies the candidate to
`client/public/assets/maps/harbor-v2/zones/<zone>.glb` and flips `promoted: true`
in `client/src/game/world/zones/harborZones.ts` (both zones promoted 2026-09-07);
production clients never request an unpromoted zone.
