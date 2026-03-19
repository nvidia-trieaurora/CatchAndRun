# Release Notes

---

## v1.0.0 — First Public Release (2026-03-19)

The first official release of **CATCH & RUN** — a real-time multiplayer Prop Hunt game playable directly in the browser.

**Live at**: https://trieaurora-catchandrun.pro.vn

### Gameplay

- **Prop Hunt multiplayer**: Hunters (FPS) vs Props (third-person, disguised as objects)
- **Match flow**: Lobby → Countdown (5s) → Hide Phase (10s) → Active Hunt (2m30s) → Round End → Match End
- **Role assignment**: 1 hunter for 2-3 players, 3 hunters for 4-8 players; roles rotate between rounds
- **Solo explore mode**: single player can start as hunter to explore the map freely; match auto-starts when a 2nd player joins
- **Configurable**: round time, total rounds, hunters per players

### Hunter Abilities

- Hitscan weapon (25 damage, 20 ammo, 200ms fire rate, 2s reload)
- **Grenade** [Q]: throwable explosive, 5m radius stun (2s), 30s cooldown
- **Area Scanner** [E]: reveals all props on the map, 40s cooldown
- **Phase-Walk** [1]: walk through walls for 5s, auto-push out when ending inside solid, 40s cooldown
- **Speed Boost** [T]: 2x speed + high jump for 5s, 60s cooldown
- Miss penalty: -5 HP for shooting non-player objects

### Prop Abilities

- **Transform** [E]: change into a random prop (weighted by rarity: common 70%, uncommon 25%, rare 5%), max 2 per round
- **Lock Pose** [F]: freeze in place to blend in
- **Invisibility** [Q]: become invisible for 7s, 120s cooldown
- **Speed Boost** [R]: faster movement for 3s, 30s cooldown
- **Soul Mode** [1]: detach camera for free-fly scouting, press 1 to return

### Props Library (28 items)

- Common (70%): Wooden Crate, Barrel, Office Chair, Traffic Cone, Pallet, Tire, Cardboard Box, Small Crate, Rope Coil, Net Bundle, Trash Can, Rock
- Uncommon (25%): Desk, Bucket, Toolbox, Life Ring, Paint Can, Gas Can, Mop, Broom, Sign Board, Buoy, Chain Pile, Ladder Section
- Rare (5%): Fire Extinguisher, Anchor, Hard Hat, Tree

### Map: Old Harbor

- Procedural 3D map built from Three.js primitives with PBR materials
- Zones: Warehouse Hall, Container Yard, Harbor Edge, Construction Zone, Catwalk Network, Hunter Spawn Cage, Ferris Wheel (animated with ride-on physics), Backyard 2-Story House, Koi Garden, Dockside Cafe & Bar (interior spiral staircase), Dockside Mini Mart
- Signs with text: "OLD HARBOR", "DOCKSIDE BAR", "NEON MART 24h"
- Dynamic ferris wheel with cabin colliders (players ride cabins)
- Clutter system with seeded RNG

### Room System

- Create public or private rooms
- Private rooms with passcode (passcode = room code)
- Room browser with LOBBY/IN GAME status and join/spectate buttons
- Quick Join (auto join or create)
- Join by room code
- Max 4 rooms, 8 players per room (32 total)
- Mid-game join as spectator (play next round)
- Room lock icon for private rooms with passcode prompt

### Networking & Server

- Server-authoritative architecture (Colyseus 0.15)
- Hit validation with ray-AABB + snapshot rollback (lag compensation)
- Wall occlusion for line-of-sight checks
- Anti-cheat: speed validation (1.2x tolerance), bounds checking, fire rate throttling
- 20 Hz server tick, 30 Hz client send rate
- Interpolation buffer (100ms, 10 snapshots)

### Scoring

- Kill: +100 points
- Survival: +2 points/second (props)
- Hunter win bonus: +200
- Prop win bonus: +150

### HUD & UI

- Timer, phase indicator, role badge
- Live alive count (Props: X/Y, Hunters: X/Y)
- Health bar (color-coded: green/yellow/red)
- Ammo counter with reload indicator
- Ability cooldowns display
- Crosshair (hunter only)
- Killfeed notifications
- Damage vignette (props) and hit flash
- In-game chat (Tab to open)
- Prop disguise info panel
- Soul mode overlay
- Controls help panel [I]
- Sound meme panel [2]

### Minimap (Hunter only)

- Real-time position tracking
- FOV cone indicator
- Scan detected props (blinking red dots)
- Sound meme direction arrows (not exact position)
- Zone labels (A/B/C/D)

### Cosmetics & Memes

- Hunter face memes: selectable in lobby (5 options including GIF support)
- Sound memes: play audio clips during match with zone-based directional pings
- Meme manifest auto-sync from assets folder

### Audio

- Background music (off by default, toggle with M, reduced volume 0.08)
- Shoot, reload, hit, kill, ability, radar SFX
- Procedural spatial audio for abilities
- Speech synthesis announcements (phase changes, role assignment)

### Mobile Support

- Virtual joystick (left side) for movement
- Touch look zone (right side) for camera rotation
- Role-specific action buttons (shoot, reload, grenade, scan, transform, lock, etc.)
- Sound meme buttons (SFX + OK)
- Responsive UI for all screens (menu, lobby, HUD)
- iOS/Android fullscreen meta tags
- Touch sensitivity: 1.5x

### Admin Analytics Dashboard

- GitHub OAuth login (admin-only access)
- Overview cards: Visits Today, Active Now, Unique Players, Avg Play Time, Total Sessions, Total Avg Duration
- Daily chart with filter (7D / 30D / 3M / 1Y) using Chart.js
- Live rooms table
- Recent sessions table (nickname, location, duration, role, score, kills)
- Player locations by country/city (IP geolocation via ip-api.com)
- PDF report export
- SQLite database storage
- Auto-refresh every 30s

### Deployment

- VPS: Vietnix VPS Cheap 1 (2 vCPU, 2GB RAM, Ubuntu 22.04)
- Domain: trieaurora-catchandrun.pro.vn with SSL (Let's Encrypt)
- Nginx reverse proxy (static files + WebSocket proxy)
- PM2 process manager (auto-restart, boot persistence)
- Deploy script: `deploy/deploy.sh`

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.7 |
| 3D Rendering | Three.js 0.170 |
| Game Server | Colyseus 0.15 |
| Client Bundler | Vite 6 |
| Testing | Vitest 3.2 (72 tests) |
| Linting | ESLint 9 + typescript-eslint |
| CI | GitHub Actions |
| Database | SQLite (better-sqlite3) |
| PDF | PDFKit |
| Hosting | Vietnix VPS + Nginx + PM2 |

---

*Future releases will document changes since this tag.*
