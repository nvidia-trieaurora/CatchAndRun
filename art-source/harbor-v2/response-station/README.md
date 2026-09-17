# Harbor Response Station

Native Blender source for the Hunter release bay. This is actual game geometry;
the review images are native Blender renders, not concept images. The open and
interior views include the finished-floor/quiet-roof runtime correction; the
closed-gate view is retained from the preceding material revision.

- Existing footprint: x −49..−35 m, z −7..7 m. Finished floor top y 0.14 m
  clears cinematic asphalt y 0.12 m; runtime adds a matching 4cm overlay on the
  procedural floor (top y 0.1 m) only when this asset is active.
- Existing side/back wall collider thickness 0.25 m and height 5 m remain authoritative.
- Roof: x −49.5..−34.5, z −7.5..7.5, y 5..5.4 m; shallow seams and grilles above.
- Glazed wall bands have real glass panes and mullions. Lower cabinets are recessed
  into the opaque wall band, with shallow handles; the central floor stays empty.
- Roof, wall glazing and the entire gate are present in both fidelity levels.
- 7 draw calls per LOD. LOD0 13,739 triangles; LOD1 9,955 triangles.
- No runtime light objects and no exported collision meshes. The review renderer uses
  temporary context ground and two broad interior lights, which are not exported.

## Runtime integration

Replace the old `hunter-spawn` visual zone with the staged candidate, preserving
the procedural shell/gate collision and authoritative Hunter release phase.
Find the selected-LOD mesh whose `gameplayRole` extra is `hunterGate`.
`MESH_RESPONSE_STATION_HUNTER_GATE_LOD0` and its `_LOD1` counterpart each export as
one glTF primitive / Three.js Mesh. Their native origin is `(-35, 5, 0)` and local
geometry lies below it. Extras: `gateMotion: roller`, `gateTopY: 5`.
Opening can shrink scale.y from 1 toward 0 while lifting position.y 5→5.2 m,
then hide the mesh inside the roof header. Closing restores position and scale.

Source: `response-station.blend` (LOD1 is hidden in the source viewport to avoid
overlapping shells). Candidate: `../_staging/response-station/response-station-candidate.glb`.

## Rebuild from repository root

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/harbor-v2/zones/build_response_station.py
/Applications/Blender.app/Contents/MacOS/Blender --background art-source/harbor-v2/response-station/response-station.blend --python-exit-code 1 --python tools/harbor-v2/export_zone_scene.py -- --output art-source/harbor-v2/_staging/response-station/response-station-candidate.glb
node tools/harbor-v2/validate_response_station.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/harbor-v2/zones/render_response_station.py -- --width 3840
```

Validation checks the exact exported bytes, gate pivot/extents and 150 ray samples:
roof coverage, real side-wall surfaces, the entire closed gate, and clear central
deployment lanes in both LODs. glTF validation: no errors; six non-fatal warnings
for tangent space computed by the renderer on the three normal-mapped materials.
Reuses the existing Poly Haven PBR derivatives and their attribution in
`tools/harbor-v2/textures/ATTRIBUTION.md`; adds only tiny local colour palettes.
