# Changelog

Tracker các version của Catch & Run — mỗi version ghi rõ đã làm gì.

## [Unreleased]

### Added
- Add temporary ground debris effects and keep wall bullet marks until the next round within each room.
- Add the Harbor V2 stylized-realism art bible, production asset pipeline, and Warehouse vertical slice.
- Expand Harbor V2 into a detailed seawall island surrounded by animated water, with tree-leaf and water-splash bullet impacts plus lethal water for Hunters and Props.
- Add the Harbor cinematic migration: modular GLB/PBR zone assets, renderer and ocean backends with WebGL fallback, private Water Pro integration seam, golden-hour environment lighting, quality presets, and performance budgets.
- Port MIT-licensed interactive-water techniques from `jeantimex/threejs-water` into the TSL ocean backend, including impact ripples, Fresnel/refraction tuning, and high-tier caustics without adopting its WebGL-only pool renderer.
- Rebuild Harbor water with directional Gerstner waves, visible crest and shoreline foam, proximity warnings, a drowning camera sequence, and an expanded authored harbor fleet and environment-detail kit.
- Establish Warehouse and Working Dock as the Harbor V2 fidelity benchmark with CC0 PBR materials, a weathered roof/facade pass, complete stair rails, market and seawall dressing, detailed animated boats, mobile LOD batching, and repeatable development snapshot views.
- Warehouse PBR01 material pass authored through Blender MCP: Poly Haven CC0 Base/Normal/ORM sets for concrete, red box-profile facade, galvanized steel, navy steel, safety yellow, dark roof and wood; world-space box UVs at real tile sizes; WebP texture export (`EXT_texture_webp`); alpha-blend skylights; per-quality-tier anisotropic filtering and AO intensity in `MapAssetLoader`. Warehouse GLB stays at 4.9 MB with all 86 movement colliders and 7 markers unchanged.
- Harbor V2 edge-zone pipeline for the two waterfront corners, authored in Blender 5.2 through MCP from deterministic builders (`tools/harbor-v2/zones/`): zone `.blend` sources under `art-source/harbor-v2/<zone>/`, `harbor:v2:export-*` / `validate-*` / `preflight-*` scripts, a zone contract validator (naming, budgets, footprint, route-clearance volumes, 488-collider parity against the procedural gameplay dump), staging-only candidates (`_staging/*-candidate.glb`, never auto-promoted), runtime `ZoneOverride`s that remove the legacy cinematic zone meshes and carve merged map-wide batches triangle-wise so old and new visuals never overlap, and a TSL `ZoneAmbientMotion` pass (canopy/shrub/grass/reed sway, lily bob, pond ripple, lamp flicker, crane hook sway) driven by `ambientMotion` extras with seeded per-vertex phase.
- AC — Waterfront Residential Garden candidate (`garden-ac-candidate.glb`, 2.2 MB, 21 LOD0 / 11 LOD1 batches): two-storey plaster house with dark seamed metal roof, ridge cap, gutters, downspouts and chimney, wooden porch (decking, joists, posts, braces, steps, foundation), octagonal koi pond with lily pads and rock island, four connected planter benches, continuous paths, warm interior emissive, porch lamps and card-canopy trees tagged `weaponImpactKind=foliage` / pond `water`; visual-only, built on the existing gameplay colliders.
- AD — Waterfront Construction Site candidate (`construction-ad-candidate.glb`, 2.2 MB, 19 LOD0 / 11 LOD1 batches): three-storey concrete/steel frame on the nine cinematic columns with footings, rebar, red I-beams with gusset plates and bolts, shoring, partial pours and formwork; scaffold tower, bridge and secondary scaffold with stairs and toe boards; silo on plinth and legs with hopper, ladder cage and grating service platform; lattice tower crane with jib, trolley, hoist cables and swaying hook; floodlight mast, brick site gate, open-sided material shelter and collider-matched props. Every moving hit surface carries `ambientMotion`; no collider follows the crane animation.
- Dev-only snapshot presets `acGarden*` / `adConstruction*` (`window.__catchAndRunView`) and the `?harborZones=staging|off` query switch backed by a Vite dev middleware for `art-source/harbor-v2/_staging`; production controls are unchanged.
- Promote both edge zones to production: `client/public/assets/maps/harbor-v2/zones/garden-ac.glb` and `construction-ad.glb` (byte-identical to the validated candidates, metrics alongside), gated by `HarborZoneAsset.promoted` so unpromoted candidates are never requested by production clients. Validation record: `docs/v2/harbor/edge-zones-ac-ad-validation.md`.
- Ferris Harbor District (`art-source/harbor-v2/_staging/ferris-harbor-candidate.glb`, 2.7 MB, validated then promoted on request to `client/public/assets/maps/harbor-v2/zones/ferris-harbor.glb`, `promoted: true`, `?v=20260907-fh01`; validation record `docs/v2/harbor/ferris-harbor-district-validation.md`), authored in Blender 5.2 through MCP by `tools/harbor-v2/zones/build_ferris_harbor.py` on the existing Ferris footprint (hub -10/12/34, mount radius 8.5, eight cabins): industrial coastal wheel with twin lattice rims, spokes, cross bracing, rust-red axle and bearing housings, A-frame legs on concrete footings, hub maintenance platform with drive motor/gearbox/brake/guard, cable conduit, perimeter bulb string, cabin hangers and pivots, five muted cabin colour variants of one modular gondola (glass, roof light, bench, grab rail); working pier with timber boardwalk to x 51, kerb bollard-and-rope chain, concrete promenade with joints/drains/puddles, seawall cap and facing, piles, tyre fenders, cleats, bollards, safety ladders, life rings, harbor lamps, market tables/umbrellas/crates/nets, cable reel, kiosk and ticket booth; unified moored fleet — hero workboat (navy hull, cream wheelhouse, boot-top and antifouling bands, mast, radar, nav lights), red and green skiffs, fishing launch with davit, cargo barge with crates and drums — plus lit buoys. Everything animated is rigged as named nodes: `RIG_FERRIS_HARBOR_WHEEL_ROOT` / `MOUNT_<i>` / `CABIN_<i>` (counter-rotating so gondolas hang upright, driven from the same angle as the unchanged 40 procedural cabin colliders and platform carry), `RIG_FERRIS_HARBOR_BOAT_*` roots with `ambientMotion`, and `SOCKET_FERRIS_HARBOR_MOOR_*` pairs for the mooring lines.
- Runtime adapters for authored dynamic zones: `FerrisHarborRig` (drives the GLB wheel/cabins from `buildFerrisWheel`'s pivot while `ferrisVisuals: false` strips only the procedural meshes), `MooringRopes` (fixed-size sagging tubes rewritten in place each frame between boat and cleat sockets, straight 2-segment on low tier, never raycast), water-sampled `HarborAmbientMotion` (heave from the Gerstner surface, pitch/roll from its slope under the hull, damped when moored, heave-only buoys, seeded phase so no two hulls bob in step, wakes only for craft flagged as moving — the fleet is moored so none are pooled), `ZoneOverride.removeNamePrefixes` for instanced legacy pier dressing, exporter/validator support for `RIG_`/`SOCKET_` empties and `requiredRigNodes`, dev presets `ferrisHarbor`, `ferrisHarborRoute`, `ferrisHarborWater`, `ferrisHarborTop`, `ferrisHubDetail`, `ferrisCabinDetail`, `workboatDetail`, `fleetDetail`.

### Fixed
- Fix strict ESLint errors blocking GitHub Actions CI.
- Align bullet impacts with rendered surfaces and prevent holes when shots miss geometry, including sky shots.
- Redesign inverted Warehouse roofs; remove overlapping V1 Warehouse geometry; harden vertical and horizontal collision; attach bullet marks to moving Ferris-wheel geometry; make grenade timing and Hunter boosts server-authoritative; replace black blast artifacts; cap aiming movement at 30%; and add deep regression validation.
- Prevent the Harbor scene, minimap, and gameplay controls from leaking into the room lobby during waiting, countdown, results, leave-room, and solo-to-multiplayer transitions.
- Restore visible Warehouse roof-access stairs, align cinematic walls and door openings with movement colliders, correct the Hunter cage to use its east-side dynamic gate across every round, and prevent both invisible doorway blockers and walk-through walls.
- Keep Hunter and Props grounded on the Warehouse stair treads during ascent, descent, and jump landings while smoothing only their visual/camera height instead of the authoritative physics position.
- Make vertical ladders climbable: every stack of rung colliders (silo, secondary scaffold, cargo-net frame, watchtower) is detected as a `LadderVolume` and Hunters/Props grab it by walking into it, climb with W/S at 2.6 m/s with rung-synchronised camera/mesh sway, mantle over the top rung onto the deck, and let go with a hop on jump (`client/src/game/controllers/LadderClimb.ts`). The old "walk up the rungs" step colliders could never be climbed because the body box is blocked by the rungs before the narrower ground probe reaches them.
- Make the construction tower crane climbable: the lattice mast is hollow (leg + wall colliders, a braced door on the south face), an interior rung ladder (`COL_LADDER_CONSTRUCTION_CRANE_LADDER`, climbed from inside so it cannot be grabbed through the mast wall) leads 24 m up to a railed grating viewing ring, a ship ladder climbs on to the slewing deck, and the jib carries a grating catwalk with handrail lines out to the trolley plus the counter-jib deck — Props get a sky hide, everyone gets the map view. `harbor-warehouse.json` bounds.max.y 25 → 36 (client + server) so anti-cheat accepts positions on the crane. Zone GLBs may now ship explicit `COL_LADDER_<ZONE>_*` columns with a `ladderApproach` extra.
- Stop players walking through construction-site props: the AD zone GLB now ships namespaced `COL_MOVE_CONSTRUCTION_*` colliders for the crane mast and pad, material shelter posts and roof, cable reel, formwork stacks and rebar cages (validated against the procedural colliders for overlap, footprint and clearance), the shelter no longer pierces the frame column at (-42, -15), and the silo's leg bay is fenced with mesh skirts so its solid box collider reads as intended.
- Render first-person weapons and grenades after transparent world surfaces so pond water, windows, puddles, and roof skylights cannot blend over the viewmodel.

## [1.1.0] — 2026-07-14 · UI/Game Feel + Chế độ Lây Nhiễm + Map Trường Học

Spec: `docs/superpowers/specs/2026-07-14-infection-mode-school-map-design.md`

### Chế độ chơi mới: Infection (Lây nhiễm) 🧟
- Host chọn mode trong Game Settings (Classic ⇄ Infection); badge mode hiển thị cho cả phòng
- Prop bị hạ **không chết** mà biến thành Hunter ngay tại chỗ (hồi máu, đầy đạn) và đi săn đồng đội cũ
- Splash "BẠN ĐÃ BỊ NHIỄM!" + killfeed 🧟 riêng cho lây nhiễm
- Prop sống sót đến hết giờ nhận thưởng 250 điểm (thay 150 classic)
- Logic tách vào `PropDownHandler` + **7 unit tests** (conversion, win conditions, classic không đổi)

### Map mới: Trường Học (Sunny School) 🏫
- Tòa nhà 2 tầng: 4 phòng học (bàn ghế, bảng, tủ khóa), hành lang, cầu thang 2 đầu, tầng 2 có kệ sách
- Phòng gym trần cao (khán đài, nệm, bóng), căng tin (quầy, bàn tròn, tủ lạnh), sân trường (cột cờ, ghế đá, bồn cây, nhà xe)
- Cổng trường = gate spawn hunter (cùng cơ chế cổng harbor)
- 14 props mới để ẩn thân (tủ khóa, cặp sách, hộp sữa, bình cứu hỏa, quả địa cầu…)
- Host chọn map trong Game Settings; minimap tự đổi layout theo map
- Server: **map registry** (`getMapData`) — HitValidation/AntiCheat/SpawnManager/PropTransformValidator đều theo `config.mapId`, hỗ trợ đổi map giữa các trận (client tự teardown + rebuild map)

### Fix kèm theo
- ROOM_STATE gửi kèm `config` (mode/map/players/rounds) để lobby sync cho người không phải host
- Solo explore dùng đúng spawn của map đang chọn (trước bị kẹt spawn harbor)
- Prop vừa bị lây không còn nhận nhầm thông báo "STUNNED" từ lựu đạn

### UI/UX + Game Feel Makeover

Spec: `docs/superpowers/specs/2026-07-14-ui-gamefeel-makeover-design.md` · Commit: `317ea24`

#### Design system
- CSS design tokens (màu, spacing, radius, shadow, duration/easing) trong `styles.css`
- Font mới: **Bungee** (display) + **Be Vietnam Pro** (body) — hỗ trợ tiếng Việt đầy đủ

#### Hiệu năng & đồ họa
- `QualityManager`: 3 tier HIGH/MEDIUM/LOW tự phát hiện theo thiết bị (mobile → LOW), chỉnh tay được trong Settings, lưu localStorage
- Post-processing **UnrealBloom** (chỉ tier HIGH) qua `EffectComposer`

#### Game feel trong trận
- Hit marker ✕ trên crosshair (đỏ khi kill) + damage number bay lên tại vị trí mục tiêu
- Camera shake kiểu trauma: khi bắn, dính đạn, lựu đạn nổ (mạnh theo khoảng cách)
- FOV kick khi speed boost; khói "poof" khi biến hình

#### HUD
- Splash đầu round "BẠN LÀ THỢ SĂN / ĐỒ VẬT" + mô tả nhiệm vụ
- Banner chuyển phase ("CUỘC SĂN BẮT ĐẦU!"), số đếm ngược khổng lồ 5→1 + tick
- Timer nhấp nháy đỏ khi <30s; killfeed 💀 slide-in; ability chips với vòng cooldown conic-gradient + badge số lượng

#### Màn hình
- **Main menu**: nền 3D props xoay chậm, logo glow, layout card, phần tạo phòng/nhập mã thu gọn, room list tự refresh 5s, nút ⚙ Settings
- **Lobby**: avatar màu theo tên, click-copy mã phòng ("✓ Đã copy!"), chấm ready nhấp nháy
- **Results**: podium top-3 🥇🥈🥉 + confetti + hàng điểm trượt vào, tiêu đề song ngữ
- **Loading overlay**: spinner + tip gameplay + cảnh báo cold-start server Render

#### Âm thanh UI
- Hover/click/success/error/tick/stinger tổng hợp bằng WebAudio (không cần file), toggle trong Settings

#### Fix kèm theo
- Copy mã phòng có fallback `execCommand` + không bị state-sync 20Hz ghi đè feedback
- Kết quả round/match localize theo ngôn ngữ đang chọn

## [1.0.0] — 2026-03-19 · First Public Release

Game Prop Hunt multiplayer: ThreeJS client + Colyseus server, map Old Harbor, vai Hunter/Prop với abilities (grenade/scanner/boost/phase-walk · invisible/transform/speed/duplicate/soul), minimap, voice chat, sound memes, chat, scoreboard, mobile touch, song ngữ EN/VI, deploy Vercel + Render.

---

### Roadmap các phase tiếp theo
- **Phase 2 — Gameplay mới**: power-ups, taunt system, map mới, chế độ chơi, progression/rank
- **Phase 3 — Onboarding & retention**: tutorial người mới, thống kê cá nhân, lịch sử trận, flow vào game nhanh hơn
