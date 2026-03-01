# Test Cases

## Room System
- [ ] Create a public room and verify it appears in room list
- [ ] Create a private room and verify room code is generated
- [ ] Join room by code (valid code)
- [ ] Join room by code (invalid code - should fail gracefully)
- [ ] Quick join when rooms exist (should join first available)
- [ ] Quick join when no rooms exist (should create new room)
- [ ] Max players enforced (11th player rejected when max=10)
- [ ] Host badge shown correctly on first player
- [ ] Host migration when host leaves (next player becomes host)
- [ ] All players see updated player list on join/leave

## Lobby
- [ ] Chat messages delivered to all players in room
- [ ] System messages for join/leave events
- [ ] Ready toggle updates visible to all players
- [ ] Only host can press Start
- [ ] Start requires minimum 2 players
- [ ] Config changes (max players, round time) only by host
- [ ] Room code displayed correctly
- [ ] Leave room returns to main menu

## Match Flow
- [ ] Countdown (10s) starts after host presses Start
- [ ] Hide phase (20s) begins after countdown
- [ ] Hunters locked in spawn during hide phase
- [ ] Props can move during hide phase
- [ ] Active phase begins after hide phase
- [ ] Hunters unlocked at active phase start
- [ ] Timer counts down correctly (synced with server)
- [ ] Round ends when all props eliminated (hunters win)
- [ ] Round ends when timer expires (props win)
- [ ] Round results shown with correct winner
- [ ] Roles swap between rounds
- [ ] Match ends after configured number of rounds
- [ ] Match results screen shows final scores
- [ ] Return to lobby after match ends

## Role Assignment
- [ ] 1 hunter per 4 players (2 players = 1 hunter, 4 = 1, 5-8 = 2, 9-10 = 2-3)
- [ ] Roles randomized each round
- [ ] Previous hunters deprioritized for next round hunter selection

## Hunter Mechanics
- [ ] FPS controls: WASD movement, mouse look
- [ ] Pointer lock on click, release on Escape
- [ ] Shooting reduces ammo
- [ ] Cannot shoot with 0 ammo
- [ ] Reload (R) restores ammo to max
- [ ] Fire rate enforced (200ms minimum between shots)
- [ ] Bullet tracer visual effect on shoot
- [ ] Muzzle flash light on shoot
- [ ] Hit confirmation message received on valid hit
- [ ] Damage applied to prop on hit (25 HP per shot)
- [ ] Prop eliminated at 0 HP
- [ ] Penalty HP loss for shooting environment (non-player)
- [ ] Killfeed entry on elimination

## Prop Mechanics
- [ ] Third-person camera follows prop
- [ ] WASD movement (slower than hunter)
- [ ] Transform (E) changes appearance to a prop object
- [ ] Transform cooldown enforced (3s)
- [ ] Invalid prop ID rejected by server
- [ ] Lock pose (F) freezes prop in place
- [ ] Locked prop cannot move
- [ ] Unlock pose (F again) allows movement
- [ ] Prop health decremented on hit
- [ ] Prop transitions to spectator on death

## Abilities
- [ ] Hunter Radar Ping (Q): Shows direction to nearest prop
- [ ] Radar returns "no props nearby" when none in range (25m)
- [ ] Radar cooldown 30s enforced
- [ ] Prop Decoy Sound (Q): Plays sound at random position
- [ ] Decoy sound heard by all nearby players
- [ ] Decoy cooldown 25s enforced

## Spectator
- [ ] Dead players enter spectator mode
- [ ] Free camera movement in spectator
- [ ] Spectators cannot interact with game (shoot, transform, etc.)

## Anti-Cheat
- [ ] Speed hack detection: movement faster than max speed rejected
- [ ] Out-of-bounds detection: position outside map bounds handled
- [ ] Fire rate spam: shots faster than min interval rejected
- [ ] Transform spam: transforms faster than cooldown rejected

## Network Edge Cases
- [ ] Player disconnect mid-match: removed from game, others continue
- [ ] Host disconnect: new host assigned, game continues
- [ ] All players disconnect: room cleaned up
- [ ] Reconnection: not supported in MVP (player treated as new join)
- [ ] High latency: interpolation smooths remote player movement
- [ ] Server validates all game-critical actions (no client trust)

## UI
- [ ] Main menu: nickname persisted in localStorage
- [ ] Room lobby: all elements interactive
- [ ] Game HUD: timer, health, ammo, ability CD update correctly
- [ ] Results screen: scores sorted correctly
- [ ] Settings: sensitivity, volume, FOV sliders work
- [ ] Notifications appear and auto-dismiss

## Scoring
- [ ] Hunter: +100 per prop killed
- [ ] Hunter: +200 bonus on round win
- [ ] Prop: +2 per second survived
- [ ] Prop: +150 bonus on round win (if alive)
- [ ] Scores accumulate across rounds
- [ ] Final scoreboard sorted by total score
