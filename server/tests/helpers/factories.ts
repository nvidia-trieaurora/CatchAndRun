import { MapSchema } from "@colyseus/schema";
import { PlayerSchema } from "../../src/schemas/PlayerSchema";
import { GameState } from "../../src/schemas/GameState";
import { GamePhase, PlayerRole } from "@catch-and-run/shared";

export function createPlayer(overrides: Partial<Record<keyof PlayerSchema, any>> = {}): PlayerSchema {
  const p = new PlayerSchema();
  p.sessionId = overrides.sessionId ?? "player-1";
  p.nickname = overrides.nickname ?? "TestPlayer";
  p.role = overrides.role ?? PlayerRole.PROP;
  p.x = overrides.x ?? 0;
  p.y = overrides.y ?? 1;
  p.z = overrides.z ?? 0;
  p.rotX = overrides.rotX ?? 0;
  p.rotY = overrides.rotY ?? 0;
  p.health = overrides.health ?? 100;
  p.currentPropId = overrides.currentPropId ?? "";
  p.isLocked = overrides.isLocked ?? false;
  p.isReady = overrides.isReady ?? false;
  p.isAlive = overrides.isAlive ?? true;
  p.score = overrides.score ?? 0;
  p.ammo = overrides.ammo ?? 12;
  p.kills = overrides.kills ?? 0;
  p.isHost = overrides.isHost ?? false;
  p.lastFireTime = overrides.lastFireTime ?? 0;
  p.lastTransformTime = overrides.lastTransformTime ?? 0;
  p.lastAbilityTime = overrides.lastAbilityTime ?? 0;
  p.lastScanTime = overrides.lastScanTime ?? 0;
  p.lastInputSeq = overrides.lastInputSeq ?? 0;
  p.lastPositionTime = overrides.lastPositionTime ?? 0;
  return p;
}

export function createGameState(overrides: Partial<Record<string, any>> = {}): GameState {
  const state = new GameState();
  state.phase = overrides.phase ?? GamePhase.WAITING;
  state.timer = overrides.timer ?? 0;
  state.currentRound = overrides.currentRound ?? 0;
  state.totalRounds = overrides.totalRounds ?? 2;
  state.roomName = overrides.roomName ?? "Test Room";
  state.roomCode = overrides.roomCode ?? "ABC123";
  state.hostSessionId = overrides.hostSessionId ?? "";
  return state;
}

export interface MockGameRoom {
  state: GameState;
  broadcast: ReturnType<typeof vi.fn>;
  clients: Array<{ sessionId: string; send: ReturnType<typeof vi.fn> }>;
  initRound: ReturnType<typeof vi.fn>;
}

export function createMockRoom(overrides: Partial<MockGameRoom> = {}): MockGameRoom {
  return {
    state: overrides.state ?? createGameState(),
    broadcast: overrides.broadcast ?? vi.fn(),
    clients: overrides.clients ?? [],
    initRound: overrides.initRound ?? vi.fn(),
  };
}

export function addPlayerToRoom(
  room: MockGameRoom,
  sessionId: string,
  playerOverrides: Partial<Record<keyof PlayerSchema, any>> = {}
): PlayerSchema {
  const player = createPlayer({ sessionId, ...playerOverrides });
  room.state.players.set(sessionId, player);
  return player;
}

export const TEST_MAP_DATA = {
  id: "test-map",
  name: "Test Map",
  bounds: {
    min: { x: -50, y: 0, z: -50 },
    max: { x: 50, y: 20, z: 50 },
  },
  hunterSpawnPoints: [
    { position: { x: -40, y: 1, z: 0 }, rotation: 0, zone: "hunterSpawn" as const },
    { position: { x: -42, y: 1, z: 2 }, rotation: 0, zone: "hunterSpawn" as const },
  ],
  propSpawnPoints: [
    { position: { x: 10, y: 1, z: 10 }, rotation: 0, zone: "warehouse" as const },
    { position: { x: 15, y: 1, z: -5 }, rotation: 0, zone: "warehouse" as const },
    { position: { x: 20, y: 1, z: 0 }, rotation: 0, zone: "office" as const },
  ],
  props: [
    { id: "crate", name: "Crate", meshType: "box" as const, dimensions: { x: 1, y: 1, z: 1 }, color: 0x8B4513, rarity: "common" as const, minScale: 0.8, maxScale: 1.2 },
    { id: "barrel", name: "Barrel", meshType: "cylinder" as const, dimensions: { x: 0.5, y: 1, z: 0.5 }, color: 0x333333, rarity: "common" as const, minScale: 0.9, maxScale: 1.1 },
  ],
  killZoneY: -10,
};
