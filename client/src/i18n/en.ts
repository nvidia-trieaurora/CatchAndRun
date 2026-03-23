export const en = {
  // Main Menu
  "menu.title": "CATCH&RUN",
  "menu.subtitle": "Prop Hunt Multiplayer",
  "menu.nickname": "Nickname",
  "menu.nickname_placeholder": "Enter your nickname...",
  "menu.quick_join": "Quick Join",
  "menu.available_rooms": "Available Rooms",
  "menu.refresh": "Refresh",
  "menu.click_refresh": "Click Refresh to see rooms",
  "menu.loading": "Loading...",
  "menu.no_rooms": "No rooms available — create one!",
  "menu.failed_load": "Failed to load rooms",
  "menu.room_name": "Room Name",
  "menu.room_name_placeholder": "My Room",
  "menu.private_room": "Private Room",
  "menu.passcode": "Passcode",
  "menu.passcode_placeholder": "Enter room passcode...",
  "menu.create_room": "Create Room",
  "menu.room_code": "Room Code",
  "menu.join": "Join",
  "menu.spectate": "Spectate",
  "menu.full": "Full",
  "menu.lobby": "LOBBY",
  "menu.in_game": "IN GAME",
  "menu.private_room_title": "Private Room",
  "menu.enter_passcode": "Enter passcode to join:",
  "menu.passcode_input": "PASSCODE",
  "menu.cancel": "Cancel",
  "menu.invalid_passcode": "Invalid passcode",

  // Lobby
  "lobby.title": "Room Lobby",
  "lobby.players": "Players",
  "lobby.choose_meme": "CHOOSE YOUR MEME (Hunter Face)",
  "lobby.chat": "Chat",
  "lobby.chat_placeholder": "Type a message...",
  "lobby.send": "Send",
  "lobby.ready": "Ready",
  "lobby.unready": "Unready",
  "lobby.start_game": "Start Game",
  "lobby.starting": "Starting...",
  "lobby.leave_room": "Leave Room",
  "lobby.host": "HOST",
  "lobby.player_ready": "READY",
  "lobby.player_not_ready": "NOT READY",
  "lobby.all_must_ready": "All players must be ready",

  // Game HUD
  "hud.waiting": "WAITING",
  "hud.get_ready": "GET READY",
  "hud.hide": "HIDE!",
  "hud.hunt": "HUNT!",
  "hud.round_over": "ROUND OVER",
  "hud.match_over": "MATCH OVER",
  "hud.ghost": "GHOST",
  "hud.reloading": "RELOADING...",
  "hud.chat_placeholder": "Type a message... (Tab to close)",
  "hud.soul_mode": "SOUL MODE - Press 1 to return",
  "hud.round": "ROUND",
  "hud.props": "Props",
  "hud.hunters": "Hunters",
  "hud.eliminated": "eliminated",

  // Abilities - Prop
  "ability.invisible": "INVISIBLE",
  "ability.transform": "TRANSFORM",
  "ability.speed": "SPEED",
  "ability.duplicate": "DUPLICATE",
  "ability.lock": "LOCK",
  "ability.soul": "SOUL",

  // Abilities - Hunter
  "ability.grenade": "GRENADE",
  "ability.scanner": "SCANNER",
  "ability.boost": "BOOST",
  "ability.phase_walk": "PHASE-WALK",
  "ability.phase_walk_active": "PHASE-WALK ACTIVE!",
  "ability.grenade_mode": "CLICK to throw | Q cancel",

  // Prop Info
  "prop.disguised_as": "Disguised as",
  "prop.locked": "LOCKED",
  "prop.press_f_lock": "Press F to Lock",
  "prop.press_e_transform": "Press E near objects to transform",

  // Voice
  "voice.mic_off": "MIC OFF",
  "voice.mic_on": "MIC ON",
  "voice.toggle_mic": "Toggle Mic [V]",
  "voice.mode_all": "ALL",
  "voice.mode_team": "TEAM",
  "voice.mode_mute": "MUTE",
  "voice.voice_mode": "Voice Mode [B]",

  // Settings
  "settings.title": "Settings",
  "settings.sensitivity": "Sensitivity",
  "settings.master_volume": "Master Volume",
  "settings.fov": "FOV",
  "settings.close": "Close",
  "settings.language": "Language",

  // Sound Meme
  "meme.title": "Sound Meme",
  "meme.hint_next": "[2] next",
  "meme.hint_play": "[Enter] play",
  "meme.hint_close": "[Esc] close",

  // Results
  "results.title": "Match Results",
  "results.rank": "#",
  "results.player": "Player",
  "results.score": "Score",
  "results.kills": "Kills",
  "results.continue": "Continue",
} as const;

export type TranslationKey = keyof typeof en;
