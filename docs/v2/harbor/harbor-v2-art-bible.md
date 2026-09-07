# Harbor V2 Art Bible

Status: production reference for the v2.0.0 visual overhaul.

## Direction

- Style: stylized realism with believable proportions, softened bevels, readable silhouettes, and restrained surface wear.
- Platforms: desktop and mobile web through Three.js.
- Lighting: late-afternoon coastal daylight, soft blue ambient fill, light maritime fog, warm practical lights, and restrained cyan/purple neon.
- Palette: warm concrete, navy steel, galvanized metal, teal and rust-orange containers, wet timber, safety yellow, dark asphalt.
- Character identity: a grounded default Hunter with the meme face retained as an optional digital visor skin.
- Gameplay readability takes priority over decorative realism. Routes, cover, prop silhouettes, door widths, and landmarks must remain readable at speed.

Generated concept art communicates visual intent only. Dimensions and production requirements in this document are authoritative.

## Concept boards

1. Harbor master plan and key art  
   `/Users/tlle/.cursor/projects/Users-tlle-Documents-PersonalProject/assets/harbor-v2-master-plan.png`
2. Material and lighting bible  
   `/Users/tlle/.cursor/projects/Users-tlle-Documents-PersonalProject/assets/harbor-v2-material-lighting.png`
3. Central Warehouse production sheet  
   `/Users/tlle/.cursor/projects/Users-tlle-Documents-PersonalProject/assets/harbor-v2-warehouse-sheet.png`
4. Container yard and Hunter spawn  
   `/Users/tlle/.cursor/projects/Users-tlle-Documents-PersonalProject/assets/harbor-v2-container-hunter-spawn.png`
5. Dock district, Ferris wheel, Bar, and Mart  
   `/Users/tlle/.cursor/projects/Users-tlle-Documents-PersonalProject/assets/harbor-v2-dock-district.png`
6. Construction zone, worker house, and garden  
   `/Users/tlle/.cursor/projects/Users-tlle-Documents-PersonalProject/assets/harbor-v2-construction-house.png`
7. Hunter character and tools  
   `/Users/tlle/.cursor/projects/Users-tlle-Documents-PersonalProject/assets/harbor-v2-hunter-tools.png`
8. Harbor disguise props  
   `/Users/tlle/.cursor/projects/Users-tlle-Documents-PersonalProject/assets/harbor-v2-prop-silhouettes.png`

## Global gameplay scale

- Island footprint: x = -55..63 m, z = -43..47 m.
- Authoritative Harbor bounds: x = -72..80 m, y = -5..25 m, z = -60..64 m. Space outside the seawall is ocean hazard, not playable land.
- Hunter collision radius: 0.35 m.
- Hunter standing body height: 1.8 m.
- Hunter eye height: 1.6 m; crouched eye height: 0.9 m.
- Maximum reliable step height: 0.55 m. Authored stairs should use 0.2 m risers where possible and never exceed 0.4 m.
- Primary movement doors: at least 2.0 m wide and 2.4 m high.
- Main combat lanes: at least 2.5 m clear width.
- Camera field of view: 75 degrees.
- Vertical gameplay bands: ground 0 m; shelf tiers 1.3/2.6/3.8 m; catwalk 4.0 m; platforms 5?7 m; Warehouse roof 8.0 m; landmark tier 10?20 m.

## Master zone contract

### Central Warehouse

- Footprint: 46 m wide ? 36 m deep.
- Wall height: 8 m.
- Preserve the broad front opening, rear catwalk, shelf grid, suspended platforms, roof routes, and Old Harbor landmark sign.
- Maintain at least three ground routes and two elevated cross-routes through the interior.

### Hunter spawn

- Footprint: 14 ? 14 m.
- Wall height: 5 m.
- The rust-orange gate must have named open and closed states and remain the strongest west-side landmark.

### Container yard

- Standard container module: 6.2 ? 2.5 ? 2.4 m.
- Preserve readable stack routes around 2.5 m and 5.1 m.
- Ramps and stairs require visible safety edges and unobstructed landing zones.

### Dock district

- Preserve the south dock edge, Ferris wheel, Dockside Bar, Neon Mart, surrounding ocean, and long navigation sightline.
- Use a continuous layered concrete seawall with metal rails, mooring fixtures, ladders, and visible submerged supports around the island.
- Ocean uses one tiered Gerstner surface: 2/3/4 directional components on
  low/medium/high with progressively denser geometry.
- Bullet hits on ocean or decorative water create a splash/ripple and never a bullet hole. Crossing outside the seawall kills either role on the server.
- The dock fleet includes one hero workboat, two skiffs and one barge with
  renderer-side bobbing; High quality emits staggered wake ripples.
- The seawall warning begins 3.2 m from lethal water and becomes critical in
  the final 1.2 m.
- Ferris wheel radius: 8 m; hub height: approximately 12 m; eight open-front cabins.
- Dockside Bar: 18 ? 12 ? 7 m.
- Neon Mart: 14 ? 10 ? 5.5 m.

### Construction and residential edge

- Construction slab: approximately 22 ? 22 m.
- Scaffold tower: 7.2 m.
- Building frame: 6 ? 5 ? 6 m.
- Silo: 2 m radius, 8 m height.
- Harbor worker house: 10 ? 8 m, two floors, balcony and walkable roof.
- Koi pond: approximately 3 m radius.

Both edge corners are authored as visual-only zone GLBs (`art-source/harbor-v2/garden/`,
`art-source/harbor-v2/construction/`, builders in `tools/harbor-v2/zones/`) that sit on
the procedural gameplay colliders and the `COL_MOVE_CINE_*` set; the zone contracts in
`tools/harbor-v2/zones/contracts/*.json` pin the footprint, budgets, route-clearance
volumes and the 488-collider parity that `validate_zone.py` checks. At runtime a
`ZoneOverride` (`client/src/game/world/zones/harborZones.ts`) removes the legacy
cinematic meshes tagged `residential`/`garden-detail` or `construction`/`construction-detail`
and carves the merged map-wide LOD1 batches inside the zone box, so a zone replaces its
old visuals instead of stacking on them. A zone may ship `COL_MOVE_<ZONE>_*` boxes
for props it introduces (never for geometry that already has a procedural collider);
they are merged into the movement colliders with the zone. Vertical rung stacks are
climbable ladders at runtime (`LadderClimb.ts`): author them as ≥4 stacked step
colliders sharing one footprint (≤0.8 m, ≤0.4 m², rises ≤0.6 m, total ≥1.5 m).
Motion is material-level TSL (`ZoneAmbientMotion`) keyed by the `ambientMotion`
extra; colliders never animate.

## Cinematic runtime contract

- Default Harbor visuals are loaded from
  `assets/maps/harbor-v2/cinematic/harbor-cinematic.glb` plus the separate
  Warehouse GLB.
- The procedural Harbor is collision/fallback infrastructure only and can be
  forced with `?harbor=v1`.
- Three.js r181 `WebGPURenderer` is the primary renderer; `?renderer=webgl2`
  forces the WebGL2 backend.
- The public ocean backend uses TSL Gerstner displacement and physical
  reflection, localized impact ripples, Fresnel/refraction, and high-tier
  shoreline caustics adapted from MIT-licensed `jeantimex/threejs-water`
  techniques. Licensed Water Pro is injected with `WATER_PRO_PATH` and must
  remain outside the public repository.
- The cinematic GLB uses PBR texture inputs, LOD0/LOD1 sets, runtime instance
  metadata, WebP textures, mesh quantization and Meshopt compression.
- The current compressed environment payload is approximately 1.48 MB:
  39,740 LOD0-only triangles, 14,890 LOD1-only triangles and 17,504 shared
  animated/instanced triangles before the separate Warehouse and dynamic
  Ferris wheel.
- Industrial Sunset HDRI by Poly Haven is CC0; attribution ships beside the
  runtime asset.

## Warehouse vertical slice

### Architecture

- Use a 2 m modular grid with 4 m hero wall modules.
- Separate concrete foundation, steel frame, corrugated wall panels, roof panels, doors, windows, catwalks, stairs, railings, and shelf modules.
- Build the Warehouse roof as a symmetric 4-degree gable: both slopes rise toward the 9.34 m center ridge and drain toward 8.05 m eaves. Use 12 shallow stepped movement colliders so players follow the visible pitch without entering or floating above it.
- Add 1?2 cm visible bevels on hero edges; bake smaller edge treatment into normal maps.
- Exterior facade uses weathered rust-red corrugated panels over a warm concrete base.
- Interior uses desaturated navy steel, galvanized catwalks, safety-yellow edges, warm practical lights, and localized dirt rather than uniform grunge.
- The Old Harbor sign is a separate emissive-capable mesh; text is authored as geometry or an atlas, never generated at runtime for the final asset.

### Gameplay markers

- `MARKER_PROP_SPAWN_*`: prop spawn transforms.
- `MARKER_HUNTER_SPAWN_*`: Hunter spawn transforms.
- `MARKER_GATE`: gate root.
- `MARKER_FERRIS_PIVOT`: future Ferris wheel pivot.
- `COL_MOVE_*`: client movement volumes.
- `COL_OCCLUSION_*`: server line-of-sight volumes.
- `SOCKET_CLUTTER_*`: optional clutter placement anchors.

### Materials

- `MAT_CONCRETE_WARM`: roughness 0.75?0.9, low metalness.
- `MAT_STEEL_NAVY`: roughness 0.45?0.65, metalness 0.65?0.85.
- `MAT_CORRUGATED_RED`: roughness 0.6?0.8, metalness 0.35?0.55.
- `MAT_GALVANIZED`: roughness 0.4?0.6, metalness 0.75?0.9.
- `MAT_SAFETY_YELLOW`: roughness 0.55?0.7, metalness 0.1?0.25.
- `MAT_GLASS_DIRTY`: alpha blend only where necessary; prefer alpha test for grates and fences.
- ORM packing: red = ambient occlusion, green = roughness, blue = metalness.

### Texture specification

- Hero modular atlas: 2048? desktop, 1024? mobile.
- Secondary trim atlas: 1024? desktop, 512? mobile.
- Texel density: approximately 256 px/m on hero surfaces and 128 px/m on secondary/background surfaces.
- Use Base Color, Normal, and ORM. Avoid separate roughness/metalness files.
- Use repeatable tiling materials for large floors and walls; reserve unique atlas space for signs, doors, damage, and focal details.
- Color space: sRGB for Base Color and emissive; linear for Normal and ORM.

## Hunter and tools

### Hunter

- Target body height: 1.8 m; visual eye line aligns to the existing 1.6 m camera.
- Compact silhouette with navy workwear, lightweight armor, rust-orange safety accents, gloves, and work boots.
- Default head is a neutral enclosed harbor-security helmet.
- Optional meme skin is a removable digital visor panel using the existing meme texture system.
- LOD0 must preserve hands, helmet/visor, jacket silhouette, and equipment readability. LOD1 may simplify straps, buckles, and finger geometry.

### Rifle

- Compact industrial carbine with a short barrel and high silhouette readability in first person.
- Separate first-person and third-person meshes may share texture sets.
- Required sockets: muzzle, right hand, left hand, magazine, and casing eject.

### Ability tools

- Grenade: compact cylindrical stun device with blue status strip and orange safety ring.
- Scanner: one-handed rugged display with a simple circular radar language.
- Phase-walk device: wrist module with a single bright blue state indicator.
- Tools must remain readable without text and at mobile resolution.

## Disguise prop dimensions

All dimensions are x ? y ? z in meters and remain the gameplay bounding-box contract.

- crate: 1.2 ? 1.2 ? 1.2
- crate_small: 0.6 ? 0.6 ? 0.6
- barrel: 0.6 ? 1.0 ? 0.6
- chair: 0.5 ? 0.9 ? 0.5
- desk: 1.5 ? 0.8 ? 0.8
- fire_extinguisher: 0.2 ? 0.5 ? 0.2
- cardboard_box: 0.8 ? 0.6 ? 0.6
- cone: 0.3 ? 0.7 ? 0.3
- trash_can: 0.4 ? 0.8 ? 0.4
- toolbox: 0.5 ? 0.3 ? 0.3
- bucket: 0.35 ? 0.4 ? 0.35
- pallet: 1.2 ? 0.15 ? 1.0
- tire: 0.7 ? 0.25 ? 0.7
- hardhat: 0.3 ? 0.2 ? 0.3
- buoy: 0.5 ? 0.5 ? 0.5
- tree: 0.4 ? 3.0 ? 0.4
- rope_coil: 0.5 ? 0.3 ? 0.5
- life_ring: 0.7 ? 0.1 ? 0.7
- sign_board: 0.8 ? 0.6 ? 0.05
- ladder_section: 0.5 ? 2.0 ? 0.1
- net_bundle: 0.8 ? 0.5 ? 0.6
- rock: 0.8 ? 0.6 ? 0.7
- paint_can: 0.2 ? 0.3 ? 0.2
- gas_can: 0.3 ? 0.4 ? 0.2
- mop: 0.1 ? 1.5 ? 0.1
- broom: 0.1 ? 1.4 ? 0.1
- anchor: 0.8 ? 1.0 ? 0.3
- chain_pile: 0.4 ? 0.3 ? 0.4

## Blender-to-GLB contract

- Unit scale: meters; apply transforms before export.
- Blender is Z-up; glTF export converts to the Three.js Y-up convention.
- Asset origin: world origin matches the current procedural Harbor origin.
- Positive Y in Three.js is world up; preserve current x/z layout.
- Mesh naming: `MESH_<ZONE>_<NAME>_<NN>`.
- Collision naming: `COL_MOVE_<NAME>_<NN>` and `COL_OCCLUSION_<NAME>_<NN>`.
- Marker naming: `MARKER_<PURPOSE>_<NN>`.
- LOD naming: `<BASE>_LOD0` and `<BASE>_LOD1`.
- Export visible render meshes, marker empties, and collision meshes in one GLB for the vertical slice.
- Collision and marker objects are hidden after parsing.
- Use indexed geometry, shared materials, instancing for repeated shelves/crates, and no unapplied negative scale.
- Tiling materials use world-space box-projected UVs (1 UV unit = the material tile size in meters from `tools/harbor-v2/textures/warehouse-pbr/_derived/spec.json`: concrete 3 m, corrugated 2 m, galvanized 2 m, steel navy 2.5 m, wood 1.5 m). Do not rely on `KHR_texture_transform`; bake the scale into UVs so LOD0/LOD1 and instanced copies stay consistent.
- Warehouse materials ship as Base Color + OpenGL Normal + ORM with the `glTF Material Output` occlusion hook so one ORM image feeds `occlusionTexture` and `metallicRoughnessTexture`. Textures export as WebP quality 86 (`EXT_texture_webp`); hero concrete is 1024², everything else 512².
- GLB validation must reject missing gate/marker names, invalid scales, non-manifold collision volumes, and textures outside the declared budget.
- Rebuild the slice with `npm run harbor:v2:build-warehouse`.
- Re-import and validate it with `npm run harbor:v2:validate-warehouse`.

## Initial performance budgets

These are acceptance caps for the Warehouse slice and will be checked on representative devices.

### Desktop high tier

- 60 FPS target; p95 frame time no more than 16.7 ms.
- Warehouse visible triangles: no more than 120,000.
- Warehouse draw calls: no more than 100.
- Warehouse compressed geometry plus textures: no more than 12 MB.
- GPU texture memory attributable to Warehouse: no more than 64 MB.
- Warm-cache load and parse: no more than 3 seconds on broadband.

### Mobile low tier

- 30 FPS minimum; p95 frame time no more than 33.3 ms.
- Warehouse visible triangles: no more than 60,000.
- Warehouse draw calls: no more than 60.
- Warehouse compressed geometry plus textures: no more than 6 MB.
- GPU texture memory attributable to Warehouse: no more than 32 MB.
- Cold load and parse: no more than 5 seconds on a representative 4G connection.
- Shadows and bloom remain disabled through the existing low quality tier.

### Full Harbor planning caps

- Desktop compressed environment payload: no more than 24 MB.
- Mobile compressed environment payload: no more than 12 MB.
- Repeated clutter must use instancing.
- No single texture may exceed 2048?.
- Transparent materials are limited to water, selected glass, fences, and VFX.

## Acceptance criteria

- The Warehouse is recognizable from the master plan and production sheet without becoming photorealistic.
- Existing spawn points, routes, gate timing, sightlines, and transform-prop scale remain playable.
- V1 Harbor remains available as a fallback until the slice passes visual and performance review.
- Desktop and mobile budgets pass without hiding required gameplay geometry.
- Map switching disposes GLB geometry, materials, and textures.
- Client movement collision, visual bullet raycasts, and server occlusion remain aligned.
