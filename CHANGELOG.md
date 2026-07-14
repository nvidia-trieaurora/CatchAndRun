# Changelog

Tracker các version của Catch & Run — mỗi version ghi rõ đã làm gì.

## [0.2.0] — 2026-07-14 · UI/UX + Game Feel Makeover

Spec: `docs/superpowers/specs/2026-07-14-ui-gamefeel-makeover-design.md` · Commit: `317ea24`

### Design system
- CSS design tokens (màu, spacing, radius, shadow, duration/easing) trong `styles.css`
- Font mới: **Bungee** (display) + **Be Vietnam Pro** (body) — hỗ trợ tiếng Việt đầy đủ

### Hiệu năng & đồ họa
- `QualityManager`: 3 tier HIGH/MEDIUM/LOW tự phát hiện theo thiết bị (mobile → LOW), chỉnh tay được trong Settings, lưu localStorage
- Post-processing **UnrealBloom** (chỉ tier HIGH) qua `EffectComposer`

### Game feel trong trận
- Hit marker ✕ trên crosshair (đỏ khi kill) + damage number bay lên tại vị trí mục tiêu
- Camera shake kiểu trauma: khi bắn, dính đạn, lựu đạn nổ (mạnh theo khoảng cách)
- FOV kick khi speed boost; khói "poof" khi biến hình

### HUD
- Splash đầu round "BẠN LÀ THỢ SĂN / ĐỒ VẬT" + mô tả nhiệm vụ
- Banner chuyển phase ("CUỘC SĂN BẮT ĐẦU!"), số đếm ngược khổng lồ 5→1 + tick
- Timer nhấp nháy đỏ khi <30s; killfeed 💀 slide-in; ability chips với vòng cooldown conic-gradient + badge số lượng

### Màn hình
- **Main menu**: nền 3D props xoay chậm, logo glow, layout card, phần tạo phòng/nhập mã thu gọn, room list tự refresh 5s, nút ⚙ Settings
- **Lobby**: avatar màu theo tên, click-copy mã phòng ("✓ Đã copy!"), chấm ready nhấp nháy
- **Results**: podium top-3 🥇🥈🥉 + confetti + hàng điểm trượt vào, tiêu đề song ngữ
- **Loading overlay**: spinner + tip gameplay + cảnh báo cold-start server Render

### Âm thanh UI
- Hover/click/success/error/tick/stinger tổng hợp bằng WebAudio (không cần file), toggle trong Settings

### Fix kèm theo
- Copy mã phòng có fallback `execCommand` + không bị state-sync 20Hz ghi đè feedback
- Kết quả round/match localize theo ngôn ngữ đang chọn

## [0.1.0] — baseline

Game Prop Hunt multiplayer: ThreeJS client + Colyseus server, map Old Harbor, vai Hunter/Prop với abilities (grenade/scanner/boost/phase-walk · invisible/transform/speed/duplicate/soul), minimap, voice chat, sound memes, chat, scoreboard, mobile touch, song ngữ EN/VI, deploy Vercel + Render.

---

### Roadmap các phase tiếp theo
- **Phase 2 — Gameplay mới**: power-ups, taunt system, map mới, chế độ chơi, progression/rank
- **Phase 3 — Onboarding & retention**: tutorial người mới, thống kê cá nhân, lịch sử trận, flow vào game nhanh hơn
