# v0.3.0 — Infection Mode + School Map — Design

**Date:** 2026-07-14
**Scope:** Full-stack (shared + server + client). Two sequential parts, verified separately.

## Decisions (from brainstorming)

- Phase 2 chu kỳ này: **chế độ chơi mới (Infection)** + **map mới (Trường học)**. Power-ups, taunt, progression để các chu kỳ sau.
- Infection = mode flag trong `RoomConfigSchema`/GameRoom hiện có (không tách room class).
- Map dựng tay theo pattern `oldHarborFortnite.ts` + `school.json` 2 phía + server map registry (không viết engine data-driven).

## Part A — Infection Mode

### Rules
- Prop bị hạ (súng hoặc grenade) **không chết** → biến thành HUNTER tại chỗ: `role=HUNTER`, `health=100`, ammo đầy, `currentPropId=""`, `isAlive=true` giữ nguyên. Killer vẫn nhận điểm kill.
- Hunter thắng khi không còn prop sống (checkRoundEndCondition giữ nguyên logic — converted prop đã là hunter).
- Prop thắng theo timer: prop còn sống nhận `INFECTION_SURVIVOR_BONUS = 250` (thay 150 classic).
- Hunter gốc không bao giờ đổi role. Classic mode hành vi giữ nguyên 100%.

### Shared
- `GameMode` enum (`classic` | `infection`) trong types; constants `INFECTION_CONVERT_HEAL=100`, `INFECTION_SURVIVOR_BONUS=250`.
- `ServerMessage.PLAYER_INFECTED` payload `{ victimSessionId, killerNickname, victimNickname, remainingProps }`.

### Server
- `RoomConfigSchema`: `@type("string") gameMode = "classic"`.
- `SET_CONFIG` handler: nhận `gameMode` (host-only, WAITING-only theo guard sẵn có).
- GameRoom kill paths (bắn + grenade): branch theo mode; infection → convert + broadcast `PLAYER_INFECTED` thay vì `PLAYER_KILLED`.
- `MatchStateMachine.endRound("props")`: infection → survivor bonus 250.
- **Tests** (`server/tests/systems/`): conversion (role/health/ammo/điểm giữ), hunters win khi lây hết, props win theo timer + bonus, classic không đổi hành vi.

### Client
- Lobby Game Settings: hàng "Chế độ" CLASSIC ⇄ INFECTION (host toggle); mọi người thấy mode + mô tả 1 dòng.
- `PLAYER_INFECTED` handler: bản thân → splash "BẠN ĐÃ BỊ NHIỄM!" (AnnouncementBanner, style riêng), chuyển HunterController tại vị trí chết, tạo súng, HUD role, touch role; người khác → killfeed "🧟 killer đã nhiễm victim".
- i18n EN/VI: mode names, mô tả, splash, killfeed.

## Part B — School Map ("Sunny School", id: `school`)

### Layout (~70×55m)
- Tòa chính 2 tầng: 4 phòng học (bàn ghế, bảng, tủ), hành lang có tủ khóa, cầu thang 2 đầu.
- Gym trần cao (khán đài, bóng, nệm), căng tin (quầy, bàn tròn, tủ lạnh).
- Sân trường: cột cờ, ghế đá, bồn cây, nhà xe; cổng trường = hunter gate (tái dùng cơ chế gate).
- ~14 props (tủ khóa, cặp sách, ghế, thùng rác, chậu cây, bóng, hộp sữa, bình cứu hỏa…), 3 rarity.

### Data & wiring
- `school.json` tại `server/src/data/maps/` và `client/src/game/world/` (bounds, killZoneY, spawns, props hp/rarity, wallOcclusion). Giữ pattern duplication như harbor.
- Server `data/maps/index.ts`: `getMapData(mapId)`; `GameRoom`, `HitValidation`, `AntiCheat`, `SpawnManager` dùng map theo `config.mapId` (default harbor).
- Client `maps/schoolMap.ts`: `buildSchoolMap(scene)` → `{ colliders, gateColliderIndex, gateMesh, ferrisWheel: null }`; `GameManager.buildMapIfNeeded()` chọn builder theo mapId từ state.
- Lobby: hàng "Map" (host chọn); metadata phòng gồm map name cho room browser.
- Minimap: nếu bounds hardcode → tham số hóa theo map.
- Sound meme zones cho school: classroom/gym/cafeteria/yard.

## Constraints
- Ferris wheel null-safe khi map không có (đã nullable).
- Client HMR: shared đổi → `npm run build:shared` trước khi server thấy.
- Verify: unit tests (Infection), play-test 2 tab cả mode + map, cập nhật `CHANGELOG.md` v0.3.0 khi xong.

## Implementation order
1. Shared (enum/constants/messages) → build:shared.
2. Server Infection + tests → `npm test` xanh phần mới.
3. Client Infection (lobby toggle, infected handler, i18n) → play-test.
4. Server map registry + school.json → tests cũ vẫn xanh.
5. Client schoolMap + chọn map lobby → play-test map.
6. CHANGELOG v0.3.0 + version bump.
