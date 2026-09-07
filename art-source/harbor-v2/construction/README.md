# AD — Waterfront Construction Site (zone source)

Source of truth: `construction-ad.blend` (Blender 5.2), generated deterministically by
`tools/harbor-v2/zones/build_construction_ad.py` (`C.main(save=True)` inside the Blender
MCP session) on the shared `zone_kit.py`. Edit the builder, not the .blend.

## Contract (gameplay colliders drive every visual)

* Slab 22 x 22 m at (-35, -22), top 0.2 m, from `buildConstructionZone`.
* Nine 0.42 m concrete columns on the cinematic `COL_MOVE_CINE_CONSTRUCTION_COLUMN_*`
  grid (x -42/-36/-30, z -29/-22/-15). Red I-beams only on the z -29 and z -22 rows
  (levels 3.4 / 6.5 m) and poured slabs only in the south-east bay
  (x -33..-30.2, z -21.8..-15.2): every other bay is kept open because the walkable
  scaffold platforms (2.5 / 5.0 / 7.2 m), the 5 m bridge, the shoring-frame plywood
  (3.05 m) and its tarp roof (6.0 m) live inside the frame footprint. The old cinematic
  floors intersected those routes; the new frame reads as an in-progress pour instead.
* Main scaffold tower (-39, -25), secondary scaffold (-31, -26), bridge, south ladder,
  6 x 5 x 6 m steel shoring frame with plywood deck, stairs and tarp roof, silo with
  plinth/legs/hopper, east ladder cage and 5 x 5 m service platform, north-west access
  scaffold with west ladder, gate at (-28, -15): all on their procedural colliders.
* Procedural crane-mast collider (0.6 m sq, 10 m at -27, -30) is read as a floodlight
  mast. The 27 m tower crane at (-48, -31) is climbable: hollow lattice mast (four leg
  colliders + four 8 cm wall colliders, south wall starts above the 3.3 m braced door),
  interior rung ladder `COL_LADDER_CONSTRUCTION_CRANE_LADDER` (approach `+z`, i.e. only
  from inside the shaft) up to the 3.6 × 3.6 m grating viewing ring at 24.15 m (rails,
  toe boards, brackets), ship ladder on the south strip to the slewing deck at 26.5 m,
  grating catwalk with handrail lines along the jib (26.54–26.66 m) to the trolley,
  counter-jib deck and cab shell colliders. Slewing-ring / turntable colliders are
  trimmed to the mast footprint so the visual overhang never clips heads on the ring.
  Hoist cables + hook block keep the `hang-sway` motion (no collider follows them).
* Utility building: the south-west corner has no building collider, so a closed dark
  building would be walk-through. It is authored as an open-sided material shelter
  (roof on four slim posts, x -46..-42.6 so it clears the frame column at -42/-15)
  over the collider'd pallets — deviation from the concept board, reported in the handoff.
* Shipped colliders (`COLLISION_ZONE` → `COL_MOVE_CONSTRUCTION_*` + one `COL_LADDER_*`,
  37 boxes): crane legs, walls, pad, ladder, viewing-ring strips, ship-ladder treads,
  slewing ring, turntable, cab, jib catwalk, counter-jib deck; the four shelter posts and
  its roof; the cable reel; both formwork stacks; the four rebar cages. They protect props this zone introduces; `validate_zone.py`
  rejects any that overlap a procedural gameplay collider, leave the footprint or enter
  a clearance volume. Cones, hard hats, tape barriers, tripods and signs stay passable.
* Ladders: the silo (20 rungs to 8 m), the secondary scaffold (13 to 5 m) and the access
  scaffold (10 to 4 m) are vertical rung stacks; the runtime detects them
  (`detectLadderVolumes`) and players climb by walking into them (W up / S down, jump
  to let go, automatic mantle onto the deck). The silo leg bay is fenced with mesh
  skirts (opening at the ladder) so the solid 4.4 m box collider matches what is seen.
* Elevated galvanized ramp along the Warehouse = the existing Warehouse west exterior
  stair (COL_MOVE_EXT_STAIR_WEST_*, already in `warehouse.glb`); the slab keeps the
  approach corridor at (-27.5..-24.5, -14..-11.2) clear (validator clearance volume).
* Every collider'd prop has a mesh: cement stack, two pallets, pipe bundle, three drums,
  tarp pile, mixer, generator, forklift, rebar bundle, tyre stack, wheelbarrow, toolbox,
  two lamp posts. Visual-only clutter (cones, hats, tape barriers, signs, tripods,
  formwork, rebar cages, reel, bucket) stays off the movement corridors.
* 19 LOD0 batches / 11 LOD1 / 37 shipped colliders; `ambientMotion`: `pond-ripple`
  (puddles), `sway-shrub` (tarp flutter), `lamp-flicker` (work lights, gate lamps,
  floodlights), `hang-sway` (crane hoist + hook). No moving collider.

## Pipeline

```bash
npm run harbor:v2:preflight-construction   # dump colliders -> export -> validate_zone (contracts/construction.json) -> glTF validator -> client tests
```

Review in-game with `?harborZones=staging` and the dev presets `adConstruction`,
`adConstructionRoute`, `adConstructionReverse`, `adConstructionTop`, `adConstructionDetail`.
Promoted 2026-09-07 to `client/public/assets/maps/harbor-v2/zones/construction-ad.glb`
(`promoted: true` in `harborZones.ts`); re-promote only after the preflight passes again.
