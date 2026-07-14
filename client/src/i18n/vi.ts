import type { TranslationKey } from "./en";

export const vi: Record<TranslationKey, string> = {
  // Main Menu
  "menu.title": "CATCH&RUN",
  "menu.subtitle": "Prop Hunt - Nhiều người chơi",
  "menu.nickname": "Biệt danh",
  "menu.nickname_placeholder": "Nhập biệt danh của bạn...",
  "menu.quick_join": "Vào nhanh",
  "menu.available_rooms": "Phòng đang mở",
  "menu.refresh": "Làm mới",
  "menu.click_refresh": "Nhấn Làm mới để xem phòng",
  "menu.loading": "Đang tải...",
  "menu.no_rooms": "Không có phòng nào — hãy tạo một phòng!",
  "menu.failed_load": "Không thể tải danh sách phòng",
  "menu.room_name": "Tên phòng",
  "menu.room_name_placeholder": "Phòng của tôi",
  "menu.private_room": "Phòng riêng",
  "menu.passcode": "Mật mã",
  "menu.passcode_placeholder": "Nhập mật mã phòng...",
  "menu.create_room": "Tạo phòng",
  "menu.room_code": "Mã phòng",
  "menu.join": "Vào",
  "menu.spectate": "Xem",
  "menu.full": "Đầy",
  "menu.lobby": "CHỜ",
  "menu.in_game": "ĐANG CHƠI",
  "menu.private_room_title": "Phòng riêng",
  "menu.enter_passcode": "Nhập mật mã để vào:",
  "menu.passcode_input": "MẬT MÃ",
  "menu.cancel": "Hủy",
  "menu.invalid_passcode": "Mật mã không đúng",

  // Lobby
  "lobby.title": "Phòng chờ",
  "lobby.players": "Người chơi",
  "lobby.choose_meme": "CHỌN MEME CỦA BẠN (Mặt Hunter)",
  "lobby.chat": "Trò chuyện",
  "lobby.chat_placeholder": "Nhập tin nhắn...",
  "lobby.send": "Gửi",
  "lobby.ready": "Sẵn sàng",
  "lobby.unready": "Hủy sẵn sàng",
  "lobby.start_game": "Bắt đầu",
  "lobby.starting": "Đang bắt đầu...",
  "lobby.leave_room": "Rời phòng",
  "lobby.host": "CHỦ PHÒNG",
  "lobby.player_ready": "SẴN SÀNG",
  "lobby.player_not_ready": "CHƯA SẴN SÀNG",
  "lobby.all_must_ready": "Tất cả người chơi phải sẵn sàng",

  // Game HUD
  "hud.waiting": "CHỜ",
  "hud.get_ready": "CHUẨN BỊ",
  "hud.hide": "TRỐN!",
  "hud.hunt": "SĂN!",
  "hud.round_over": "HẾT HIỆP",
  "hud.match_over": "HẾT TRẬN",
  "hud.ghost": "BÓNG MA",
  "hud.reloading": "ĐANG NẠP ĐẠN...",
  "hud.chat_placeholder": "Nhập tin nhắn... (3 hoặc Esc để đóng)",
  "hud.soul_mode": "CHẾ ĐỘ LINH HỒN - Nhấn 1 để quay lại",
  "hud.round": "HIỆP",
  "hud.props": "Đồ vật",
  "hud.hunters": "Thợ săn",
  "hud.eliminated": "đã hạ",
  "hud.scoreboard_title": "DANH SÁCH NGƯỜI CHƠI",
  "hud.sb_player": "Người chơi",
  "hud.sb_role": "Vai",
  "hud.sb_score": "Điểm",
  "hud.sb_kills": "Hạ",
  "hud.sb_status": "Trạng thái",
  "hud.hunter": "THỢ SĂN",
  "hud.prop": "ĐỒ VẬT",
  "hud.alive": "Sống",
  "hud.dead": "Chết",
  "hud.you": "Bạn",

  // Abilities - Prop
  "ability.invisible": "TÀNG HÌNH",
  "ability.transform": "BIẾN HÌNH",
  "ability.speed": "TĂNG TỐC",
  "ability.duplicate": "PHÂN THÂN",
  "ability.lock": "KHÓA",
  "ability.soul": "LINH HỒN",

  // Abilities - Hunter
  "ability.grenade": "LỰU ĐẠN",
  "ability.scanner": "QUÉT",
  "ability.boost": "TĂNG TỐC",
  "ability.phase_walk": "XUYÊN TƯỜNG",
  "ability.phase_walk_active": "ĐANG XUYÊN TƯỜNG!",
  "ability.grenade_mode": "CLICK để ném | Q hủy",

  // Prop Info
  "prop.disguised_as": "Ngụy trang thành",
  "prop.locked": "ĐÃ KHÓA",
  "prop.press_f_lock": "Nhấn F để Khóa",
  "prop.press_e_transform": "Nhấn E gần đồ vật để biến hình",

  // Voice
  "voice.mic_off": "TẮT MIC",
  "voice.mic_on": "BẬT MIC",
  "voice.toggle_mic": "Bật/Tắt Mic [V]",
  "voice.mode_all": "TẤT CẢ",
  "voice.mode_team": "ĐỒNG ĐỘI",
  "voice.mode_mute": "TẮT TIẾNG",
  "voice.voice_mode": "Chế độ giọng nói [B]",

  // Settings
  "settings.title": "Cài đặt",
  "settings.sensitivity": "Độ nhạy",
  "settings.master_volume": "Âm lượng",
  "settings.fov": "Góc nhìn",
  "settings.close": "Đóng",
  "settings.language": "Ngôn ngữ",
  "settings.quality": "Chất lượng đồ họa",
  "settings.q_auto": "Tự động",
  "settings.q_low": "Thấp",
  "settings.q_medium": "Vừa",
  "settings.q_high": "Cao",
  "settings.ui_sounds": "Âm thanh giao diện",

  // Sound Meme
  "meme.title": "Meme Âm thanh",
  "meme.hint_next": "[2] tiếp",
  "meme.hint_play": "[Enter] phát",
  "meme.hint_close": "[Esc] đóng",

  // Loading
  "loading.connecting": "Đang kết nối máy chủ...",
  "loading.cold_start": "Lần kết nối đầu có thể mất đến 1 phút để máy chủ khởi động — chờ chút nhé!",
  "loading.tip_1": "Đồ vật: nhấn F để khóa tư thế, tránh bị trượt lung tung.",
  "loading.tip_2": "Thợ săn: máy quét [E] hiện vị trí đồ vật trên bản đồ nhỏ.",
  "loading.tip_3": "Đồ vật: phân thân [T] là mồi nhử hoàn hảo cho thợ săn tham lam.",
  "loading.tip_4": "Thợ săn: bắn nhầm đồ thật sẽ tốn đạn — hãy để ý chuyển động!",
  "loading.tip_5": "Đồ vật: phát meme âm thanh [2] để chọc tức thợ săn... nếu bạn dám.",

  // Menu extras
  "menu.create_join_title": "Tạo phòng hoặc vào bằng mã",
  "menu.settings": "Cài đặt",

  // Lobby extras
  "lobby.click_copy": "Nhấn để copy",
  "lobby.copied": "Đã copy!",

  // Results extras
  "results.hunters_win": "Thợ Săn Thắng!",
  "results.props_win": "Đồ Vật Thắng!",
  "results.round": "Hiệp",

  // Announcements
  "splash.you_are_hunter": "BẠN LÀ THỢ SĂN",
  "splash.you_are_prop": "BẠN LÀ ĐỒ VẬT",
  "splash.hunter_task": "Chờ cổng mở rồi săn hết chúng!",
  "splash.prop_task": "Biến hình và trốn trước khi thợ săn tới!",
  "banner.hunt_begins": "CUỘC SĂN BẮT ĐẦU!",
  "banner.round_over": "HẾT HIỆP",

  // Results
  "results.title": "Kết quả trận đấu",
  "results.rank": "#",
  "results.player": "Người chơi",
  "results.score": "Điểm",
  "results.kills": "Hạ gục",
  "results.continue": "Tiếp tục",
};
