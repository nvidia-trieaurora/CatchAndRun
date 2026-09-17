# BD — Eastern Container Yard (zone source)

Source of truth: `container-bd.blend` (Blender 5.2), generated deterministically by
`tools/harbor-v2/zones/build_container_bd.py` (`main(save=True)` inside the Blender MCP
session, or `blender --background --python`) on the shared `zone_kit.py`. Edit the
builder, not the .blend. Contract: `tools/harbor-v2/zones/contracts/container_bd.json`
(the validator loads `<zone>.json` with underscores).

Status (2026-09-08): candidate `art-source/harbor-v2/_staging/container-bd-candidate.glb`
(2,025,396 B) passed `validate_zone.py` and the glTF validator and was **promoted on
request** to `client/public/assets/maps/harbor-v2/zones/container-bd.glb` (`promoted: true`,
`?v=20260908-bd01` in `client/src/game/world/zones/harborZones.ts`). Production clients load
it; `?harborZones=staging` still swaps in the `_staging` candidate for reviewing the next
iteration before re-promoting. Dev presets `containerBD`, `containerBDRoute`,
`containerBDShop`, `containerBDReverse`, `containerBDTop`, `containerBDDetail`,
`containerBDForklift`, `containerBDRoof`. Not committed.

Harbor Market (2026-09-08, validated then **promoted on request as `?v=20260908-bd02`**):
the shop is now built by `tools/harbor-v2/zones/harbor_market.py` (imported by
`build_shop`) as the HARBOR MARKET mini-supermarket — see "Harbor Market" below and the
validation record `docs/v2/harbor/container-bd-validation.md`. Production
`container-bd.glb` (3.94 MB) is byte-identical to the `_staging` candidate. Presets
`harborMarketExterior`, `harborMarketFront`, `harborMarketLeft`, `harborMarketInterior`,
`harborMarketCheckout`, `harborMarketTop`, `harborMarketShelf`, `harborMarketFridge`.

## Layout (Three.js metres; x east, z south)

* Footprint x 29.5..62.6, z -44.6..5.5 (roof overhang / open gate leaves); carve box
  x 29.5..62.6, z -43.6..2.6. West of x 29.5 the legacy north-south road and the Warehouse
  east stair stay; east is the seawall (parapet collider x 62.55); north the Mini Mart
  against the north seawall; south the plaza toward the Ferris pier.
* Main forklift lane x 44.2..50.2 (6 m) from the cross road (z -19) to the open gate at the
  south fence (z 1.95): yellow edge lines, white centre dashes, stop line, drains on the
  east edge. The Mini Mart entrance (x 44..46 at z -33) is straight ahead from the lane.
* Cross road z -25..-19: the legacy east-west service road continues into the yard as the
  turning bay (hatched east end), with a zebra crossing to the shop forecourt.
* Alleys (3 m, east-west, dashed edges): A z -16.51..-13.45, B z -11.01..-7.7 — both keep
  the prop spawns (35,-15) and (38,-10) in the open; (40,-20) and (30,-25) sit in the
  cross road.
* West block x 31..43.19 (40 ft units along x, doors toward the lane): W1 teal/red
  two-high, W2 navy/ochre (upper "damaged" variant), W3 red 40 ft with a 20 ft teal on
  top, the lower W3 door ajar (visual-only, cargo inside). South-west pocket: 20 ft
  flat-rack with drums and a strapped crate, 20 ft maintenance workshop (side door,
  window, roof AC). South row S1 navy/teal two-high closes the yard toward the plaza.
* Waterfront row x 58.4..60.84 (single height along z): 40 ft red E1, 20 ft cream reefer
  E2; the seawall walkway x 60.84..62.5 stays clear.
* Loading zone x 51.1..58 / z -12.4..-4.8 (yellow border + hatch, barriers, cones): chassis
  trailer with a navy 20 ft box, idle forklift (forks toward the trailer), cargo net.
  Empty-container handler parked north of it (x 54.6..58.2, z -18.8..-11.2).
* Shop forecourt z -32.5..-26 (6.5 m deep raised sidewalk at the shop slab level 0.25,
  kerb with quarter-round corners and side returns, expansion joints, two drain grates)
  with four edge bollards, slatted bench, bike rack + bike and small crates at the edges;
  the entrance corridor x 42.3..47.25 is empty.
* Legacy pieces dressed on their existing colliders: the east utility boxes (stacked
  condenser + electrical cabinet), bins/boxes/pallet in front of the shop, the tire stack
  (x 41.5..44.2, z -10.5..-9.5), both lamp posts, the yard office (51.5..58.5 x -4.5..0.5)
  as a site cabin with a lit west window.

## Harbor Market (shop, `harbor_market.py`)

* Shell on the legacy boxes 38..52 × 0..5.5 × -43..-33: warm concrete plinth (0.7 m),
  charcoal vertical cladding (vertex-tinted container sheet), membrane roof on the
  37..53 × 5.5..5.8 collider with parapet + flashing, gutter, two downspouts, roof
  condenser on its legacy box, vent, hatch; the roof runs 2 m forward over the entrance on
  the legacy canopy collider (38..52 × 5.4..5.65 × -33..-31) — its 1.2 m fascia carries the
  sign: real text geometry "HARBOR MARKET" (DIN Alternate Bold → mesh, 5.2 m, warm-white
  emissive `sign` swatch) on a navy panel with a backlight strip. Four warm downlights in
  the soffit.
* Storefront (+z): glazing 39.6..43.5 and 46.5..50.4 from the 0.7 sill to the 4.2 head
  (mullions, transom at 3.0, `MAT_GLASS_CLEAR`), centred 3 m bi-parting automatic door
  43.5..46.5 (jambs, operator header with cyan LED and sensor, transom light, leaves parked
  open in front of the sidelights — no interaction system, no moving collider), 0.7 m
  cyan canopy strip above the head, entrance mats inside and out.
* Gameplay boxes are procedural (`buildDocksideMiniMart`): glazing solid to the slab on
  both sides of the 3 m door, produce display, gondolas A (41.2..42.2 × -38.95..-35.15) and
  B (45.6..46.6 × -40.35..-35.15), fridge runs (rear 43.2..51.05, right 51.05..51.8),
  checkout 48.7..49.7 × -37.6..-34.4, impulse rack, cashier wall shelf, stockroom /
  manager partition walls (38.2..43.0 × -42.8..-40.5, doors 39.7..40.6 / 41.9..42.8),
  stock shelving, desk. Aisles: produce 1.7 m, centre 3.4 m on the door axis, checkout lane
  1.6 m, front 2.0 m, rear 1.7 m — contract clearance volumes `shop-*`.
* West (left) side is a flat service path: painted walkway + edge line, three drain
  grates, two wall lamps at 3.5 m; no stair, ramp, landing, posts or colliders
  (`shop-left-side` clearance, `HarborMarket.test.ts`). The old crate stair is gone.
* Roof access moved inside (bd03): fixed ladder on the stockroom's west wall
  (`COL_LADDER_CONTAINER_BD_STOCK_LADDER` 38.25..38.55 × 0.25..5.8 × -41.55..-41.05,
  approach `+x`) through a ceiling shaft and a 1.1 × 1.2 roof hatch (38.2..39.3 ×
  -41.9..-40.7, curb + yellow band, open lid, hoop); the procedural roof collider has the
  same hole (four boxes) and the climber mantles out onto the west overhang.
* East (service) side: recessed service door (visual, closed) with lamp, stacked twin
  condenser on a rack + electrical cabinet on the legacy 0.9 × 0.8 × 2.0 boxes, pipes,
  conduit, meter box, crate stack (`CRATES_E` collider), pallet with cartons, hand truck.
* Interior: floor with joints, cream lining + dark dado, suspended ceiling at 4.2 with a
  3 × 4 LED grid (+2 room lights); produce display along the west wall (tiered
  timber/steel, 17 crates with fruit heaps, chalkboard); two double-sided gondolas (base,
  spine, uprights, 4 shelves per side with price lips, 3-shelf endcaps); six reach-in
  fridges (carcass, kick, header with light, cool emissive back panel, wire shelves, product
  row cards, two glass doors per unit with handles); checkout (belt with steel edges,
  scanner well, register, monitor on a post, card terminal, bagging shelf, bag rail),
  impulse rack, cashier wall shelf, three baskets, two anti-theft pedestals (visual only);
  stockroom (steel shelving, cartons) and manager room (desk, monitor, papers, chair, window
  to the sales floor), open doors, fire extinguisher + sign, rear conduit and box.
* Products: `MAT_PRODUCT_ATLAS` — a procedural 512 px label atlas (4 × 4 cells: red /
  navy / green / silver cans, yellow / blue / kraft boxes, amber jar, orange / water / dark
  bottles, milk carton, silver bag, three "row" cards) written to
  `tools/harbor-v2/textures/container-bd-pbr/_derived/product_atlas_*.png` by
  `harbor_market.product_atlas()`; cans/jars/bottles are 6-segment cylinders (label wrapped,
  plain top), boxes/bags/cartons 5-face boxes with the label on the aisle face, row cards
  panelled every 0.9 m; five vertex tints; small round goods stand two deep with a row card
  behind. 917 products, one draw call. Shop total LOD0 24.2k tris / 8 materials (two new
  draws: atlas + clear glass), LOD1 346 / 6 (shell, glazing, sign, gondola blocks with row
  cards, fridge blocks, checkout, produce, rooms).

## Collision contract

* Zone ships 47 `COL_MOVE_CONTAINER_BD_*` boxes: every container (exact 2.438 x 2.591
  envelope), trailer + box, forklift, handler, forecourt sidewalk pieces (0..0.25, split
  around the legacy bin/box/lamp colliders), bollards, bench, roof parapets (0.56 m, gap at
  the stair landing), south fence, gate posts, pallet stacks, reels, drums, cage, barriers,
  tarp stack. Validator: inside footprint, no overlap with the 488 procedural colliders,
  outside every clearance volume (main lane, cross road, both alleys, shop entrance and
  doorway, seawall walkway, west margin, four spawn points).
* Runtime override (`harborZones.ts`) drops the 14 legacy `COL_MOVE_CINE_CONTAINER_*` and
  `COL_MOVE_CINE_FORKLIFT` (which stood in the new lane) — `CONTAINER_BD_REMOVED_COLLIDERS`,
  mirrored in the contract's `removesCinematicColliders`. Mini Mart, yard office, lamp
  posts, tire stack, seawalls and spawns are untouched. Runtime `colliderCount` 703 → 735.
* No collider for fence mesh, gate leaves, weeds, puddles, paint, cables, cargo nets, cones,
  wheel stops, loose pallets, bike, hand cart or small crates.

## Materials / batching

One vertex-tinted sheet-metal PBR set (`container_neutral`, neutral weathered corrugation
+ COLOR_0 tint per container: teal, brick red, navy, faded ochre, reefer cream, workshop
grey, shop/office cladding; grime gradient at the base, dulled roofs), `steel_dark`
hardware, `concrete_yard`, grating + grass cards (alpha clip), dark shop glass, puddles,
one flat palette and one emissive light palette. LOD0 22.9k tris / 14 draws, LOD1 346 /
6, estimated GPU textures 14.5 MiB, payload 1.9 MiB. `ambientMotion`: `lamp-flicker`
(interior/canopy/sign/beacons/office window), `pond-ripple` (puddles), `sway-grass`
(weeds), `hang-sway` (lamp-to-shop cable), `sway-shrub` (tarp).

## Pipeline

```bash
npm run harbor:v2:preflight-container-bd   # dump colliders -> export -> validate_zone -> glTF validator -> client tests
```

Re-promotion (only on request, after the preflight passes again): copy the candidate +
`.metrics.json` over `client/public/assets/maps/harbor-v2/zones/container-bd.glb`, bump the
`?v=` token, re-run `harbor:v2:test-container-bd`, lint, build and an in-game WebGPU +
WebGL2 check without `?harborZones=staging`.
