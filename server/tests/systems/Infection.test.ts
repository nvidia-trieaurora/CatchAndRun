import { describe, it, expect, beforeEach, vi } from "vitest";
import { handlePropDown, type PropDownRoom } from "../../src/systems/PropDownHandler";
import { MatchStateMachine } from "../../src/systems/MatchStateMachine";
import { createMockRoom, addPlayerToRoom, type MockGameRoom } from "../helpers/factories";
import {
  GamePhase,
  PlayerRole,
  GameMode,
  ServerMessage,
  WEAPON_MAX_AMMO,
  INFECTION_CONVERT_HEAL,
  INFECTION_SURVIVOR_BONUS,
} from "@catch-and-run/shared";

interface TestRoom extends MockGameRoom {
  scoring: { onPropKilled: ReturnType<typeof vi.fn> };
  matchSM: MatchStateMachine;
}

function createRoom(gameMode: string): TestRoom {
  const room = createMockRoom() as TestRoom;
  room.state.config.gameMode = gameMode;
  room.state.config.totalRounds = 2;
  room.state.phase = GamePhase.ACTIVE;
  room.scoring = { onPropKilled: vi.fn() };
  room.matchSM = new MatchStateMachine(room as any);
  return room;
}

describe("Infection mode — handlePropDown", () => {
  let room: TestRoom;

  beforeEach(() => {
    room = createRoom(GameMode.INFECTION);
  });

  it("converts a downed prop into a hunter instead of killing them", () => {
    const hunter = addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER });
    const victim = addPlayerToRoom(room, "p1", {
      role: PlayerRole.PROP,
      health: 0,
      currentPropId: "crate",
      isLocked: true,
      score: 42,
    });
    addPlayerToRoom(room, "p2", { role: PlayerRole.PROP });

    handlePropDown(room as unknown as PropDownRoom, "h1", hunter, "p1", victim);

    expect(victim.isAlive).toBe(true);
    expect(victim.role).toBe(PlayerRole.HUNTER);
    expect(victim.health).toBe(INFECTION_CONVERT_HEAL);
    expect(victim.ammo).toBe(WEAPON_MAX_AMMO);
    expect(victim.currentPropId).toBe("");
    expect(victim.isLocked).toBe(false);
    expect(victim.score).toBe(42);
    expect(hunter.kills).toBe(1);
    expect(room.scoring.onPropKilled).toHaveBeenCalledWith("h1");
  });

  it("broadcasts PLAYER_INFECTED with remaining prop count, not PLAYER_KILLED", () => {
    const hunter = addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER, nickname: "Killer" });
    const victim = addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, nickname: "Victim" });
    addPlayerToRoom(room, "p2", { role: PlayerRole.PROP });

    handlePropDown(room as unknown as PropDownRoom, "h1", hunter, "p1", victim);

    expect(room.broadcast).toHaveBeenCalledWith(ServerMessage.PLAYER_INFECTED, {
      victimSessionId: "p1",
      killerNickname: "Killer",
      victimNickname: "Victim",
      remainingProps: 1,
    });
    const killedCalls = room.broadcast.mock.calls.filter(
      (c: unknown[]) => c[0] === ServerMessage.PLAYER_KILLED
    );
    expect(killedCalls).toHaveLength(0);
  });

  it("hunters win when the last prop is infected", () => {
    const hunter = addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER });
    const victim = addPlayerToRoom(room, "p1", { role: PlayerRole.PROP });

    handlePropDown(room as unknown as PropDownRoom, "h1", hunter, "p1", victim);

    // Last prop converted -> no props alive -> round ends, hunters win
    expect(room.state.phase).toBe(GamePhase.ROUND_END);
    const results = room.broadcast.mock.calls.find(
      (c: unknown[]) => c[0] === ServerMessage.ROUND_RESULTS
    );
    expect(results?.[1]).toMatchObject({ winner: "hunters" });
  });

  it("round continues while props remain", () => {
    const hunter = addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER });
    const victim = addPlayerToRoom(room, "p1", { role: PlayerRole.PROP });
    addPlayerToRoom(room, "p2", { role: PlayerRole.PROP });

    handlePropDown(room as unknown as PropDownRoom, "h1", hunter, "p1", victim);

    expect(room.state.phase).toBe(GamePhase.ACTIVE);
  });

  it("surviving props get the infection bonus when the timer expires", () => {
    addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER });
    const survivor = addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, score: 10 });
    const converted = addPlayerToRoom(room, "h2", { role: PlayerRole.HUNTER, score: 5 });

    room.state.config.roundTime = 60;
    room.matchSM.startMatch();
    // COUNTDOWN -> HIDING -> ACTIVE -> timer expiry (props win)
    room.matchSM.update(999_000);
    room.matchSM.update(999_000);
    room.matchSM.update(999_000);

    expect(room.state.phase).toBe(GamePhase.ROUND_END);
    expect(survivor.score).toBe(10 + INFECTION_SURVIVOR_BONUS);
    // Converted players are hunters — no survivor bonus (hunters lost)
    expect(converted.score).toBe(5);
  });
});

describe("Classic mode — handlePropDown unchanged", () => {
  let room: TestRoom;

  beforeEach(() => {
    room = createRoom(GameMode.CLASSIC);
  });

  it("kills the prop: spectator role, dead, health 0", () => {
    const hunter = addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER });
    const victim = addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, score: 30 });
    addPlayerToRoom(room, "p2", { role: PlayerRole.PROP });

    handlePropDown(room as unknown as PropDownRoom, "h1", hunter, "p1", victim);

    expect(victim.isAlive).toBe(false);
    expect(victim.role).toBe(PlayerRole.SPECTATOR);
    expect(victim.health).toBe(0);
    expect(victim.score).toBe(30);
    expect(hunter.kills).toBe(1);
    expect(room.broadcast).toHaveBeenCalledWith(
      ServerMessage.PLAYER_KILLED,
      expect.objectContaining({ victimSessionId: "p1" })
    );
  });

  it("surviving props get the classic 150 bonus on timer expiry", () => {
    addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER });
    const survivor = addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, score: 0 });

    room.state.config.roundTime = 60;
    room.matchSM.startMatch();
    room.matchSM.update(999_000);
    room.matchSM.update(999_000);
    room.matchSM.update(999_000);

    expect(room.state.phase).toBe(GamePhase.ROUND_END);
    expect(survivor.score).toBe(150);
  });
});
