import { describe, it, expect, beforeEach } from "vitest";
import { MatchStateMachine } from "../../src/systems/MatchStateMachine";
import { createMockRoom, addPlayerToRoom, type MockGameRoom } from "../helpers/factories";
import {
  GamePhase,
  PlayerRole,
  COUNTDOWN_DURATION,
  HIDE_PHASE_DURATION,
  ROUND_END_DURATION,
  MATCH_END_DURATION,
  ServerMessage,
} from "@catch-and-run/shared";

describe("MatchStateMachine", () => {
  let room: MockGameRoom;
  let sm: MatchStateMachine;

  beforeEach(() => {
    room = createMockRoom();
    room.state.config.totalRounds = 2;
    room.state.config.roundTime = 300;
    sm = new MatchStateMachine(room as any);
  });

  describe("startMatch", () => {
    it("should transition from WAITING to COUNTDOWN", () => {
      sm.startMatch();

      expect(room.state.phase).toBe(GamePhase.COUNTDOWN);
      expect(room.state.timer).toBe(Math.ceil(COUNTDOWN_DURATION));
      expect(room.state.currentRound).toBe(1);
      expect(room.state.totalRounds).toBe(2);
    });
  });

  describe("update — phase timer", () => {
    it("should not update when in WAITING phase", () => {
      room.state.phase = GamePhase.WAITING;
      sm.update(1000);
      expect(room.state.timer).toBe(0);
    });

    it("should decrement timer during active phases", () => {
      sm.startMatch();
      const initialTimer = room.state.timer;

      sm.update(1000);
      expect(room.state.timer).toBeLessThan(initialTimer);
    });

    it("should clamp timer to 0 minimum before phase transition", () => {
      sm.startMatch();
      // Advance partway through the countdown, not enough to trigger transition
      sm.update((COUNTDOWN_DURATION - 1) * 1000);
      expect(room.state.timer).toBeGreaterThanOrEqual(0);
      expect(room.state.timer).toBeLessThanOrEqual(Math.ceil(COUNTDOWN_DURATION));
    });
  });

  describe("phase transitions", () => {
    function advancePhase(durationSeconds: number) {
      sm.update(durationSeconds * 1000 + 100);
    }

    it("COUNTDOWN -> HIDING: should call initRound", () => {
      sm.startMatch();
      advancePhase(COUNTDOWN_DURATION);

      expect(room.state.phase).toBe(GamePhase.HIDING);
      expect(room.initRound).toHaveBeenCalled();
    });

    it("HIDING -> ACTIVE: should transition after hide duration", () => {
      sm.startMatch();
      advancePhase(COUNTDOWN_DURATION);

      advancePhase(HIDE_PHASE_DURATION);
      expect(room.state.phase).toBe(GamePhase.ACTIVE);
    });

    it("ACTIVE -> ROUND_END: props win when timer expires", () => {
      sm.startMatch();
      advancePhase(COUNTDOWN_DURATION);
      advancePhase(HIDE_PHASE_DURATION);

      addPlayerToRoom(room, "prop-1", { role: PlayerRole.PROP, isAlive: true, score: 0 });

      advancePhase(room.state.config.roundTime);

      expect(room.state.phase).toBe(GamePhase.ROUND_END);
      expect(room.state.players.get("prop-1")!.score).toBe(150);
    });

    it("ROUND_END -> HIDING (next round): should increment currentRound", () => {
      room.state.config.totalRounds = 3;
      room.state.totalRounds = 3;
      sm.startMatch();

      advancePhase(COUNTDOWN_DURATION);
      advancePhase(HIDE_PHASE_DURATION);
      advancePhase(room.state.config.roundTime);

      expect(room.state.phase).toBe(GamePhase.ROUND_END);
      expect(room.state.currentRound).toBe(1);

      advancePhase(ROUND_END_DURATION);
      expect(room.state.phase).toBe(GamePhase.HIDING);
      expect(room.state.currentRound).toBe(2);
    });

    it("ROUND_END -> MATCH_END: after final round", () => {
      room.state.config.totalRounds = 1;
      room.state.totalRounds = 1;
      sm.startMatch();

      advancePhase(COUNTDOWN_DURATION);
      advancePhase(HIDE_PHASE_DURATION);
      advancePhase(room.state.config.roundTime);

      expect(room.state.phase).toBe(GamePhase.ROUND_END);

      advancePhase(ROUND_END_DURATION);
      expect(room.state.phase).toBe(GamePhase.MATCH_END);
      expect(room.broadcast).toHaveBeenCalledWith(
        ServerMessage.MATCH_RESULTS,
        expect.any(Object)
      );
    });

    it("MATCH_END -> WAITING: should reset all player state", () => {
      room.state.config.totalRounds = 1;
      room.state.totalRounds = 1;
      sm.startMatch();

      const p1 = addPlayerToRoom(room, "p1", {
        role: PlayerRole.HUNTER, score: 500, kills: 3, ammo: 5,
      });

      advancePhase(COUNTDOWN_DURATION);
      advancePhase(HIDE_PHASE_DURATION);
      advancePhase(room.state.config.roundTime);
      advancePhase(ROUND_END_DURATION);
      advancePhase(MATCH_END_DURATION);

      expect(room.state.phase).toBe(GamePhase.WAITING);
      expect(room.state.timer).toBe(0);
      expect(room.state.currentRound).toBe(0);
      expect(p1.isReady).toBe(false);
      expect(p1.role).toBe(PlayerRole.PROP);
      expect(p1.isAlive).toBe(true);
      expect(p1.health).toBe(100);
      expect(p1.score).toBe(0);
      expect(p1.kills).toBe(0);
      expect(p1.ammo).toBe(0);
      expect(p1.currentPropId).toBe("");
      expect(p1.isLocked).toBe(false);
    });
  });

  describe("checkRoundEndCondition", () => {
    it("should end round (hunters win) when all props are dead", () => {
      sm.startMatch();
      sm.update(COUNTDOWN_DURATION * 1000 + 100);
      sm.update(HIDE_PHASE_DURATION * 1000 + 100);

      const hunter = addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER, isAlive: true });
      addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, isAlive: false });
      addPlayerToRoom(room, "p2", { role: PlayerRole.PROP, isAlive: false });

      sm.checkRoundEndCondition();

      expect(room.state.phase).toBe(GamePhase.ROUND_END);
      expect(hunter.score).toBe(200);
    });

    it("should end round (props win) when all hunters are dead", () => {
      sm.startMatch();
      sm.update(COUNTDOWN_DURATION * 1000 + 100);
      sm.update(HIDE_PHASE_DURATION * 1000 + 100);

      addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER, isAlive: false });
      const prop = addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, isAlive: true });

      sm.checkRoundEndCondition();

      expect(room.state.phase).toBe(GamePhase.ROUND_END);
      expect(prop.score).toBe(150);
    });

    it("should not end round when both sides still have alive players", () => {
      sm.startMatch();
      sm.update(COUNTDOWN_DURATION * 1000 + 100);
      sm.update(HIDE_PHASE_DURATION * 1000 + 100);

      addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER, isAlive: true });
      addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, isAlive: true });

      sm.checkRoundEndCondition();

      expect(room.state.phase).toBe(GamePhase.ACTIVE);
    });

    it("should not trigger during WAITING phase", () => {
      room.state.phase = GamePhase.WAITING;
      addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, isAlive: false });

      sm.checkRoundEndCondition();
      expect(room.state.phase).toBe(GamePhase.WAITING);
    });

    it("should broadcast round results with scores", () => {
      sm.startMatch();
      sm.update(COUNTDOWN_DURATION * 1000 + 100);
      sm.update(HIDE_PHASE_DURATION * 1000 + 100);

      addPlayerToRoom(room, "h1", {
        role: PlayerRole.HUNTER, isAlive: true, score: 100, nickname: "Hunter1",
      });
      addPlayerToRoom(room, "p1", {
        role: PlayerRole.PROP, isAlive: false, score: 50, nickname: "Prop1",
      });

      sm.checkRoundEndCondition();

      expect(room.broadcast).toHaveBeenCalledWith(
        ServerMessage.ROUND_RESULTS,
        expect.objectContaining({
          winner: "hunters",
          scores: expect.any(Array),
        })
      );
    });
  });
});
