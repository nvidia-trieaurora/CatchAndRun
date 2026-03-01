# HideAndSeek - Prop Hunt Multiplayer

A real-time multiplayer Prop Hunt game where **Hunters** search for **Props** (players disguised as objects) in a harbor warehouse environment.

## Features

- **Multiplayer rooms**: Create public/private rooms, join by code, quick join
- **Role system**: Hunters (FPS, hitscan gun) vs Props (transform into objects, hide)
- **Match flow**: Countdown -> Hide Phase -> Active Hunt -> Round End -> Role Swap
- **Server-authoritative**: Hit validation, anti-cheat (speed, fire rate, bounds)
- **Abilities**: Hunter Radar Ping, Prop Decoy Sound
- **Real-time chat** in lobby and game
- **Scoring system**: Kill points, survival time, round/match bonuses

## Quick Start

### Prerequisites
- Node.js 18+ and npm

### Installation & Running

```bash
cd ProptHunt
npm install
npm run build:shared

# Terminal 1 - Start server
npm run dev:server

# Terminal 2 - Start client  
npm run dev:client
```

Open **http://localhost:5173** in two or more browser tabs to test multiplayer.

## Controls

### Hunter (FPS)
| Key | Action |
|-----|--------|
| WASD | Move |
| Mouse | Look around |
| Left Click | Shoot |
| R | Reload |
| Q | Radar Ping (30s cooldown) |
| Space | Jump |
| Tab | Scoreboard |

### Prop (Third-person)
| Key | Action |
|-----|--------|
| WASD | Move |
| Mouse | Rotate camera |
| E | Transform into random nearby prop |
| F | Lock/Unlock pose (freeze in place) |
| Q | Decoy Sound (25s cooldown) |

## Project Structure

```
ProptHunt/
├── shared/          # Shared types, constants, config
├── server/          # Colyseus game server
│   └── src/
│       ├── rooms/       # GameRoom (main room)
│       ├── schemas/     # Colyseus state schemas
│       └── systems/     # Match SM, hit validation, anti-cheat, scoring
├── client/          # ThreeJS game client
│   └── src/
│       ├── game/        # Controllers, systems, world, entities
│       ├── network/     # Colyseus client, interpolation
│       ├── ui/          # HTML/CSS UI screens
│       └── input/       # Keyboard/mouse input
└── tools/           # Dev tools (prop authoring)
```

## Game Rules

1. Each round, players are randomly assigned as Hunters or Props (1 hunter per 4 players)
2. **Hide Phase (20s)**: Props can move and transform; Hunters are locked in spawn
3. **Active Phase (5min)**: Hunters search and shoot Props; Props try to survive
4. **Hunters win** if they eliminate all Props before time runs out
5. **Props win** if at least one Prop survives until the timer expires
6. Hunters lose HP for shooting non-player objects (anti-spam)
7. Roles swap between rounds

## Configuration

All gameplay parameters are in `shared/src/constants.ts`:
- Max players, round time, hide duration
- Weapon damage, fire rate, ammo
- Movement speeds, ability cooldowns
- Anti-cheat thresholds

## Tech Stack

| Component | Technology |
|-----------|-----------|
| 3D Rendering | Three.js |
| Game Server | Colyseus 0.15 |
| Language | TypeScript |
| Client Bundler | Vite |
| Network | WebSocket |
| Build System | npm workspaces |
