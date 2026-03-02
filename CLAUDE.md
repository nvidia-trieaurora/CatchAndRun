<!-- ;# CLAUDE.md -->

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multiplayer Prop Hunt game built with ThreeJS (client) + Colyseus (server), TypeScript monorepo using npm workspaces.

## Commands

```bash
npm install                   # Install all workspace dependencies
npm run build:shared          # MUST run first - compiles shared/ to CommonJS
npm run dev:server            # Compile + run server on port 2567
npm run dev:client            # Vite dev server on port 5173
npm run dev                   # Run both server and client concurrently
npm run build                 # Full production build (shared → server → client)
```

To play-test: open http://localhost:5173 in 2+ browser tabs.

```bash
npm test                     # Run all unit tests (server)
npm run test:watch           # Run tests in watch mode
npm run test:coverage        # Run tests with coverage report
```

Tests live in `server/tests/` and use Vitest. Helper factories are in `server/tests/helpers/factories.ts`.

**RULE: Only add tests for logic that is non-trivial, has edge cases, or is likely to regress.** Do NOT add tests for simple getters, visual-only changes, or map geometry. Good candidates: scoring calculations, phase transitions, hit validation, anti-cheat rules, role assignment. Tests live in `server/tests/systems/`. Use factories from `tests/helpers/factories.ts`.

```bash
npm run lint                 # ESLint strict-type-checked (errors block CI)
npm run lint:fix             # Auto-fix lint issues
```

**Important**: After any change to `shared/`, you must rebuild it (`npm run build:shared`) before the server picks up the changes. The Vite client resolves shared source directly via path alias so client hot-reload works without rebuilding shared.

## CI/CD & Deployment

- **CI**: GitHub Actions (`.github/workflows/ci.yml`) runs lint, test, and build on every push/PR to `main`.
- **Client**: Deployed to **Vercel** (static site). Set Root Directory to `client` in Vercel Dashboard. Set env var `VITE_SERVER_URL` to the Render server WSS URL.
- **Server**: Deployed to **Render.com** (web service with WebSocket). Config in `render.yaml`. Free tier sleeps after 15 min idle.
- **Env var**: `VITE_SERVER_URL` controls the WebSocket server URL at build time (e.g. `wss://catchandrun-server.onrender.com`). Falls back to `ws://localhost:2567` in dev.

## Architecture

Three npm workspaces: `shared/`, `server/`, `client/`.

### Shared (`@hide-and-seek/shared`)
Compiled to CommonJS (`dist/`) for Node.js consumption. Exports types, constants, message type enums, and game config. Both server and client depend on this package. Uses `@colyseus/schema` decorators (`experimentalDecorators` enabled in all tsconfigs).

### Server (`@hide-and-seek/server`)
Colyseus 0.15 authoritative game server (CommonJS). All game logic runs server-side.

- **GameRoom** (`rooms/GameRoom.ts`) — Central hub: registers 8 message handlers, runs 20Hz game loop, broadcasts state patches
- **Schemas** (`schemas/`) — Colyseus `@type`-decorated state classes: `GameState` (root), `PlayerSchema`, `ChatMessage`, `RoomConfigSchema`
- **Systems** (`systems/`) — Modular game systems:
  - `MatchStateMachine` — Phase transitions: WAITING → COUNTDOWN(10s) → HIDING(20s) → ACTIVE(300s) → ROUND_END(8s) → MATCH_END(15s) → WAITING
  - `HitValidation` — Ray-AABB collision with snapshot rollback for lag compensation
  - `AntiCheat` — Speed validation (1.2x tolerance), bounds checking, fire rate throttling (100ms min)
  - `ScoringSystem` — Kill (+100), survival (+2/s), round win bonuses
  - `RoleAssigner` — Assigns HUNTER/PROP roles, deprioritizes previous hunters for fair rotation
  - `SpawnManager` — Manages spawn point allocation
- **SnapshotBuffer** (`utils/`) — Stores position history for rollback hit validation

### Client (`@hide-and-seek/client`)
ThreeJS renderer with Vite bundler (ESM). HTML/CSS overlay UI (no framework).

- **GameManager** (`game/GameManager.ts`) — Orchestrates renderer, scene, input, network, UI, and controllers in the animation loop
- **Controllers** (`game/controllers/`) — `HunterController` (FPS + shooting + radar), `PropController` (third-person + transform + decoy), `SpectatorController` (free camera)
- **NetworkManager** (`network/NetworkManager.ts`) — Colyseus.js client wrapper, room lifecycle (create/join/joinByCode/quickJoin)
- **InterpolationBuffer** (`network/InterpolationBuffer.ts`) — 10-snapshot buffer, 100ms render delay, linear lerp
- **StateSync** (`network/StateSync.ts`) — Listens to Colyseus schema change callbacks, syncs player entities
- **MapBuilder** (`game/world/MapBuilder.ts`) — Procedurally builds warehouse map from ThreeJS primitives with PBR materials and collider AABBs
- **UI Screens** (`ui/screens/`) — MainMenuUI, RoomLobbyUI, GameHUD, ResultsUI managed by UIManager show/hide pattern

## Key Patterns

- **Server-authoritative**: Client sends inputs, server validates and applies. Never trust client state.
- **Message-based actions**: Discrete messages for player actions (`Shoot`, `TransformRequest`, `UseAbility`), continuous state sync for positions/health via Colyseus schema patches.
- **Client message types** defined in `shared/src/messageTypes.ts` as `ClientMessage` enum; server message types as `ServerMessage` enum.
- **Snapshot rollback**: Server stores position snapshots in `SnapshotBuffer` to validate hits at the time the shot was fired (lag compensation).
- **Map data duplication**: `harbor-warehouse.json` exists in both `server/src/data/maps/` and `client/src/game/world/`. Keep them in sync.
- **All tunable gameplay parameters** live in `shared/src/constants.ts` (speeds, damage, cooldowns, timers, scoring).

## Module Systems

- `shared/` and `server/` compile to **CommonJS** (Node.js)
- `client/` uses **ESM** (Vite handles bundling)
- All packages use `experimentalDecorators: true` for Colyseus `@type()` schema decorators
- Vite config aliases `@hide-and-seek/shared` to shared TypeScript source for dev HMR
