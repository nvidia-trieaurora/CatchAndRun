# CatchAndRun - Prop Hunt Multiplayer

A real-time multiplayer Prop Hunt game where **Hunters** search for **Props** (players disguised as objects) in a harbor warehouse environment.

**Live**: [Client](https://catch-and-run-client.vercel.app) | [Server](https://catchandrun.onrender.com/health)

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
- Node.js 20+ and npm

### Local Development

```bash
npm install
npm run build:shared

# Option 1: Run both concurrently
npm run dev

# Option 2: Separate terminals
npm run dev:server    # Server on port 2567
npm run dev:client    # Client on port 5173
```

Open **http://localhost:5173** in two or more browser tabs to test multiplayer.

### Quality Commands

```bash
npm run lint          # ESLint strict-type-checked
npm run lint:fix      # Auto-fix lint issues
npm test              # Run all unit tests (72 tests)
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

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
CatchAndRun/
├── shared/              # Shared types, constants, config (@catch-and-run/shared)
├── server/              # Colyseus game server (@catch-and-run/server)
│   ├── src/
│   │   ├── rooms/           # GameRoom (main room)
│   │   ├── schemas/         # Colyseus state schemas
│   │   ├── systems/         # Match SM, hit validation, anti-cheat, scoring
│   │   └── utils/           # SnapshotBuffer, RoomCodeGenerator
│   └── tests/               # Vitest unit tests (72 tests)
│       ├── systems/         # Tests for all game systems
│       ├── utils/           # Tests for utilities
│       └── helpers/         # Test factories and mocks
├── client/              # ThreeJS game client (@catch-and-run/client)
│   └── src/
│       ├── game/            # Controllers, systems, world, entities
│       ├── network/         # Colyseus client, interpolation, state sync
│       ├── ui/              # HTML/CSS UI screens
│       └── input/           # Keyboard/mouse input
├── tools/               # Dev tools (meme scanner, prop authoring)
├── .github/workflows/   # CI pipeline (lint + test + build)
├── render.yaml          # Render.com server deployment config
└── eslint.config.mjs    # ESLint 9 flat config (strict-type-checked)
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

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Language | TypeScript 5.7 | Toilet-strict, shared across all 3 workspaces |
| 3D Rendering | Three.js 0.170 | WebGL renderer, PBR materials, shadow maps |
| Game Server | Colyseus 0.15 | Authoritative multiplayer, room management, schema sync |
| Client Bundler | Vite 6 | ESM dev server with HMR, production bundling |
| Network | WebSocket (ws/wss) | Real-time bidirectional communication |
| Build System | npm workspaces | Monorepo: shared, server, client |
| Testing | Vitest 3.2 | 72 unit tests covering all server game systems |
| Linting | ESLint 9 + typescript-eslint | Strict-type-checked, flat config |
| CI | GitHub Actions | Automated lint, test, build on push/PR |
| Client Hosting | Vercel | Static site CDN, auto-deploy from main |
| Server Hosting | Render.com | Node.js web service, WebSocket support |

## CI/CD Pipeline

Every push to `main` triggers 3 automated systems:

```
git push origin main
        |
        v
 GitHub Actions CI ──── lint (ESLint strict) ─┐
        |                test (72 Vitest)      ├── must all pass
        |                build (full)         ─┘
        |
        ├──> Vercel (auto-deploy client)
        |     - Builds shared + client
        |     - Deploys static site to CDN
        |     - VITE_SERVER_URL env var points to Render
        |
        └──> Render.com (auto-deploy server)
              - Builds shared + server
              - Runs Colyseus game server
              - WebSocket connections on wss://
```

### Environment Variables

| Platform | Variable | Value |
|----------|----------|-------|
| Vercel | `VITE_SERVER_URL` | `wss://<render-app>.onrender.com` |
| Render | `NODE_ENV` | `production` |

## Development History

| Date | Milestone |
|------|-----------|
| 2026-03-01 | Initial development: ThreeJS client + Colyseus server, multiplayer Prop Hunt gameplay |
| 2026-03-02 | Added test suite: Vitest with 72 unit tests covering all server-side game systems |
| 2026-03-02 | Added CI/CD: GitHub Actions pipeline (lint + test + build) |
| 2026-03-02 | Added ESLint: strict-type-checked config with typescript-eslint, 0 errors |
| 2026-03-02 | Production deployment: Client on Vercel (CDN) + Server on Render.com (WebSocket) |
| 2026-03-02 | Production NetworkManager: VITE_SERVER_URL env var, auto wss:// detection |
