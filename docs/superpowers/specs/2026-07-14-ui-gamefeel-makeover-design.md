# UI/UX + Game Feel Makeover — Design

**Date:** 2026-07-14
**Scope:** Client-only. No server/shared changes.
**Goal:** Nâng cấp toàn diện giao diện và cảm giác chơi (game feel) của Catch & Run.

## Decisions (from brainstorming)

- Phương án: **Makeover toàn diện** (design system + 4 màn hình + loading + game feel).
- Hiệu năng: **tự động theo thiết bị** — 3 tier HIGH/MEDIUM/LOW, người chơi tự chỉnh trong Settings.
- Các giai đoạn sau (gameplay mới, onboarding/retention) làm ở chu trình riêng.

## 1. Design System

- CSS custom properties trong `styles.css`: bảng màu (giữ cyan `#00d4ff` / tím `#7b2ff7` làm nhận diện; thêm danger/success/gold), spacing, radius, shadow, duration & easing chuẩn.
- Fonts: **Bungee** (display — logo, tiêu đề, banner; có subset tiếng Việt) + **Be Vietnam Pro** (body). Load qua Google Fonts trong `index.html`, fallback system-ui.
- UI sounds tổng hợp bằng WebAudio (không cần asset): hover, click, success, error, countdown tick, phase stinger. Thêm vào `AudioSystem`, có toggle trong Settings.

## 2. Screens

- **Main Menu**: nền 3D động (camera quay chậm quanh map hoặc scene props nổi), logo glow động, layout ưu tiên — Chơi Ngay to nhất, room list tự refresh 5s, Tạo phòng/Nhập code thu vào collapsible. Entrance animation.
- **Room Lobby**: thẻ người chơi có màu avatar riêng, nút copy mã có feedback "Đã copy ✓", countdown số nhảy.
- **Game HUD**:
  - Splash đầu round: "BẠN LÀ HUNTER / BẠN LÀ PROP" + 1 dòng nhiệm vụ.
  - Banner chuyển phase: "TRỐN NGAY!" / "CUỘC SĂN BẮT ĐẦU!".
  - Timer to giữa top bar, nhấp nháy đỏ + tick khi <30s.
  - Kill feed icon 💀, slide-in.
  - Ability cooldown dạng vòng tròn (CSS conic-gradient) thay text thuần.
- **Results**: podium top-3 dựng bằng animation, confetti cho người thắng, dòng điểm trượt vào lần lượt.
- **Loading/Connecting**: spinner + tips ngẫu nhiên (che thời gian Render free tier wake up).

## 3. Game Feel

- **Post-processing**: `EffectComposer` + `UnrealBloomPass` — chỉ tier HIGH.
- **QualityManager** (`config/QualityManager.ts`): auto-detect mobile/GPU → HIGH/MEDIUM/LOW; điều khiển bloom, shadow map, pixel ratio; lưu `localStorage`; chỉnh được trong SettingsPanel.
- **Hit feedback**: hit marker ✕ trên crosshair + âm "tách", damage number bay lên, screen shake nhẹ (bắn / dính đạn / nổ).
- **Particles**: poof khói khi prop biến hình, vụ nổ grenade đẹp hơn, confetti màn thắng.
- **Camera FX**: FOV kick khi speed boost, recoil nhẹ khi bắn.

## 4. Architecture

- Module mới: `game/effects/PostProcessing.ts`, `game/effects/CameraShake.ts`, `config/QualityManager.ts`, `ui/components/AnnouncementBanner.ts`.
- Còn lại sửa file hiện có: `GameHUD.ts`, `MainMenuUI.ts`, `RoomLobbyUI.ts`, `ResultsUI.ts`, `SettingsPanel.ts`, `AudioSystem.ts`, `ParticleSystem.ts`, `GameManager.ts`, `styles.css`, `index.html`, i18n `en.ts`/`vi.ts`.
- Không unit test cho thay đổi visual (theo repo rule); verify bằng play-test 2 tab.

## 5. Implementation order (verify per step)

1. Design system + fonts → verify: menu render đúng font/màu.
2. QualityManager + post-processing → verify: desktop có bloom, mobile không.
3. HUD mới (splash, banner, timer, killfeed, ability rings) → verify: play-test đủ 2 role.
4. Hit feedback + shake + particle → verify: bắn trúng thấy marker/số damage.
5. Menu + lobby + results + loading → verify: đi hết flow menu → game → results.
6. UI sounds → verify: có âm thanh, tắt được trong Settings.
