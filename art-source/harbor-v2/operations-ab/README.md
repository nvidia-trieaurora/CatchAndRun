# AB — Harbor Operations & Repair Lane (zone source)

Source of truth: `operations-ab.blend` (Blender 5.2), generated deterministically by
`tools/harbor-v2/zones/build_operations_ab.py` (`npm run harbor:v2:build-operations-ab`, or
`main(save=True)` inside the Blender MCP session) on the shared `zone_kit.py`. Edit the
builder, not the .blend. Contract: `tools/harbor-v2/zones/contracts/operations_ab.json`.
Build stats (per-collection triangles, batches, colliders) are written to
`art-source/harbor-v2/_staging/operations-ab-build-stats.json`.

Status (2026-09-09): candidate `art-source/harbor-v2/_staging/operations-ab-candidate.glb`
(2,732,204 B) passed `validate_zone.py` and the glTF validator and was **promoted on request**
to `client/public/assets/maps/harbor-v2/zones/operations-ab.glb` (`promoted: true`,
`?v=20260909-ab01` in `client/src/game/world/zones/harborZones.ts`). Production clients load
it; `?harborZones=staging` still swaps in the `_staging` candidate for reviewing the next
iteration before re-promoting. Dev presets
`operationsAB`, `operationsABRoute`, `operationsABInterior`, `operationsABSeawall`,
`operationsABTop`, `operationsABDetail`, `operationsABPump`. Validation record:
`docs/v2/harbor/operations-ab-validation.md`. Not committed.

## Layout (Three.js metres; x east, z south; the sea is at z < -43)

* Strip x -23.3..29.45 (AD fence at -23.4, BD yard from 29.5), z -46..-18 (the footprint
  reaches over the water for the davit hook; the carve box stops at z -43.6 and the
  Warehouse north wall is z -18). Ground: island asphalt top 0.18 (players walk at 0),
  concrete promenade at 0 north of z -38, the legacy bar deck at 0.22 (z -28..-24).
* Main inspection lane = the legacy east-west road z -25..-19 (6 m): yellow edge lines,
  white centre dashes, three inspection rectangles with tick marks and rubber wheel stops
  on the kerb-side edge strip (z -19.38..-19.23), recessed weighbridge x 12..18 (steel deck
  5 mm above the asphalt in a flush frame with a dark gap, hatched approach bands, control
  cabinet on the Warehouse apron x 15.9..16.4), drain grates every 6 m on both edges, kerb
  along the Warehouse apron (gaps at the roller doors) and along the lane's north edge
  between the turning spaces, steel bollards at the lane ends and beside the cross routes,
  hatched turning spaces at both ends (kerb-free so vehicles swing onto the yard). Clear
  width: 5 m in front of the building (deck edge -24 to kerb -19), 5.6 m elsewhere.
* Cross-lane escape routes: x -11.2..-9.4 (west of the building, side door) and x 9.4..11
  (east), both from the seawall pockets to the lane — contract volumes `cross-west/east`.
* Operations building on the legacy Dockside Cafe Bar boxes x -9..9, z -43..-29 (7 m walls,
  roof deck 7.0..7.3, 2.2 m solid "plant annex" z -43..-40.8, interior stair to the roof):
  warm concrete base band, navy vertical steel cladding, low flat roof with parapet,
  gutter + downspout, two AC condensers, roof vent (spinning rotor), conduit + cable tray,
  ocean-facing control windows (lit 0.7 m recesses with consoles and screens behind the
  glass on the annex face), glazed personnel portal x -5..-2 (leaves open), roller-shutter
  bay x 2..5 (curtain rolled up, slats 4.0..4.4), west side door z -37..-35, warm wall
  lamps, restrained cyan status strip, wall fan (spinning rotor), sign "HARBOR OPERATIONS"
  as real text geometry (DIN Alternate Bold → mesh, uppercase, 5.1 m, warm-white emissive)
  on a dark backing straddling the parapet, antenna mast with an amber beacon. No stairs or
  ramps attached to the building; the 1 m slab lip and the 0.22 deck are the legacy steps.
* Interior (enterable through both front openings and the side door once the six
  `COL_MOVE_CINE_BAR_*` colliders are dropped): control office x -8.8..-1.5 — main control
  desk (3 monitors, abstract CCTV quads, radio, keyboard), second desk with chart plotter,
  two office chairs, plan chest with a text-free harbor chart, server/radio rack + UPS,
  lockers, side table + printer, emergency phone, notice board, wall chart, fire
  extinguisher stand at the door (legacy box); workshop x -1.42..8.8 — steel workbench with
  vise/grinder/parts along x 3.45..4.55, parts counter with colour-coded bins, back
  shelving with bins, pegboard, layout + parts tables with stools, compressor, bucket,
  welding cart, hose reel, spare propeller on a pallet, spare pump on a pallet in the NW
  corner, tool chest, gas bottles with chain, floor drain, spiral stair; partial glazed
  partition (base cabinet band, glass 1.0..2.6, panel above, sliding door parked open,
  ends at z -34.4 so the front hall z -34.4..-29.15 is one shared space). Circulation loop
  office corridor → partition door → workshop middle → hall link → hall → office front,
  1.9–3 m wide (contract volumes; `OperationsABZone.test.ts`).
* Front apron (legacy deck 0..0.22, z -28..-24): joints, edge paint + hatches, two wheel
  stops clear of both door approaches, legacy machine boxes dressed as generator / welding
  trolley / tool chest with drums, gas bottles and crates on the legacy seat plates, legacy
  bollards, utility cart bay with the parked cart (amber idle light).
* Warehouse service wall (facade only, fixtures hang on z -18.x): three closed roller
  doors x -17.5..-14.5 / -3.5..-0.5 / 12.5..15.5 (frames, slats, header hood, threshold,
  hatch band) with corrugated steel canopies on cantilever brackets + knee braces and
  downlights, numbered plates, two red utility risers + a 6.2 m pipe run on brackets,
  cable tray at 5.3 m with hangers and three swaying cables, downpipes at both ends, fire
  hose cabinet, three electrical panels, tool lockers (collider), transformer enclosure
  with fins, bushings, feed, warning plate, guard posts + chain (collider), maintenance
  workbench (collider), spare-parts pallets (collider), four wall lamps.
* Seawall service pocket west (promenade y 0): pump house 3 × 2.5 × 3.2 (x -20.6..-17.6,
  z -42.4..-39.9; door, lamp, louvred vent, stack, cyan status dot), pipe manifold on a
  plinth (header, three risers with red valves, gauges, drops toward the seawall),
  compressor skid (x -13.2..-12.0), rescue cabinet, life rings and coiled hoses on the
  seawall rail, seawall lights, drain outfall through the seawall face, small davit on the
  cap at x -22.3 (foundation, rotating post, braced boom, pulley, winch, control box, cable
  + hook block swaying over the water — no collider outside the cap). Painted 1.2 m
  pedestrian path z -39.65..-38.45 linking into the cross-west route / side door.
* Seawall pocket east: buoy rack (x 11.1..13.7) and tyre rack (x 16..18) 5 cm south of the
  seawall collider, maintenance crates (x 22..24.4), pallet + drum, utility cart bay with
  cart, painted path z -41.4..-40.2 from the cross-east route to the cart bay; checkpoint
  booth x 25.6..27.8, z -29.7..-27.5 (glazing, desk, monitor, ceiling light, flashing
  beacon) at the BD end with a raised barrier arm on the Warehouse apron, bollards.

## Collision contract

* Zone ships 28 `COL_MOVE_OPERATIONS_AB_*` boxes: weigh cabinet, 6 bollards, office lockers,
  welding cart, propeller pallet, spare pump, tool chest, utility cart, Warehouse lockers /
  transformer / bench / pallets, pump house, manifold, compressor, rescue cabinet, davit
  (from y 0.901 on the cap), buoy rack, tyre rack, maintenance crates, checkpoint booth,
  barrier pedestal, checkpoint bollard. Validator: inside the footprint, no overlap
  (> 2 mm³) with the 493 procedural colliders, outside every clearance volume.
* Runtime override (`harborZones.ts`): `removeNames` = the six `COL_MOVE_CINE_BAR_*`
  (`OPERATIONS_AB_REMOVED_COLLIDERS`, mirrored in the contract) — the procedural
  `buildDocksideCafeBar` shell already carries every wall with its two 3 m front openings
  and the side door; nothing else changes (seawall collider -55..63 × 0..0.9 × -43.45..-42.55
  and the `ocean-north` hazard z ≤ -43.01 untouched, client/server map JSON identical).
* No collider for paint, grates, puddles, wheel stops, kerbs, pipes, cables, hoses, life
  rings, lamps, sign letters, rotors, steam, small tools, chairs/stools, barrier arm.
* Carve (visual only, by real coordinates): `dock_MESH_{glass_warm,neon_violet,roof,
  steel_navy,wood}_LOD0` + `harbor_MESH_{glass_warm,neon_violet,roof,wood}_LOD1` inside
  x -10.5..10.5 × y ≥ 0.3 × z -43.6..-26 (the bar shell, its z -43.5 roof overhang and deck
  furniture; the Mini Mart east of x 37 shares those batches and is untouched),
  `harbor_MESH_steel_navy_LOD1` with z ≥ -42.4 so the seawall rail at z -43 survives, the
  legacy lane dashes and puddles (`base_MESH_road_marking_LOD0`, `harbor_MESH_road_marking_LOD1`,
  `shared-props_MESH_puddle_LOD0`, `harbor_MESH_puddle_LOD1`) inside the lane box. Asphalt,
  concrete, the rail posts and the AD fence are never carved.

## Materials / batching / animation

Vertex-tinted sheet-metal PBR (`MAT_AB_SHEET`: navy, navy dark, cladding grey, rust),
`steel_dark`, `concrete_yard`, grating, clear glass (`depthWrite=false` at runtime),
puddles, one flat palette (7 × 7 swatches) and one emissive light palette, isolated
emissives `MAT_AB_STATUS` (cyan) and `MAT_AB_BEACON` (amber), blended `MAT_AB_STEAM`.
LOD0 15 batches + 2 rotor meshes (17 draws), ~33k tris; LOD1 7 / 344.
`ambientMotion` (visual only, deterministic seeded phase, dt clamped, no per-frame
allocation, `ZoneAmbientMotion.ts`): `spin` (roof vent + wall fan rotors, `spinAxis` /
`spinRpm`, `ignoreWeaponRaycast`), `status-pulse` (cyan strip + pump status), `beacon-flash`
(mast + checkpoint beacons), `davit-sway` (cable, block, hook: pendulum pivot 4.85 m),
`sway-reed` (three service-wall cables), `sway-shrub` (steam cards), `pond-ripple`
(puddles), `lamp-flicker` (generator panel light, utility cart lights). Moving hit surfaces
are dynamic weapon-raycast targets by their `ambientMotion` tag.

## Pipeline

```bash
npm run harbor:v2:build-operations-ab       # deterministic .blend from the builder
npm run harbor:v2:preflight-operations-ab   # dump colliders -> export -> validate_zone -> glTF validator -> client tests
```

Re-promotion (only on request, after the preflight passes again): copy the candidate +
`.metrics.json` over `client/public/assets/maps/harbor-v2/zones/operations-ab.glb`, bump the
`?v=` token in `harborZones.ts`, re-run `harbor:v2:test-operations-ab`, lint, build and an
in-game WebGPU + WebGL2 check without `?harborZones=staging`.
