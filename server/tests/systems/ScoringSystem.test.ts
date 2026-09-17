import { describe, it, expect, beforeEach } from "vitest";
import { ScoringSystem } from "../../src/systems/ScoringSystem";
import { createMockRoom, addPlayerToRoom, type MockGameRoom } from "../helpers/factories";
import {
  PlayerRole,
  SCORE_PROP_KILL,
  SCORE_PROP_SURVIVE_PER_SEC,
  SCORE_PROP_SURVIVAL_INTERVAL_SECONDS,
} from "@catch-and-run/shared";

describe("ScoringSystem", () => {
  let room: MockGameRoom;
  let scoring: ScoringSystem;

  beforeEach(() => {
    room = createMockRoom();
    scoring = new ScoringSystem(room as any);
  });

  describe("onPropKilled", () => {
    it("should award kill score to the hunter", () => {
      const hunter = addPlayerToRoom(room, "hunter-1", { role: PlayerRole.HUNTER });
      expect(hunter.score).toBe(0);

      scoring.onPropKilled("hunter-1");
      expect(hunter.score).toBe(SCORE_PROP_KILL);
    });

    it("should accumulate kill scores", () => {
      const hunter = addPlayerToRoom(room, "hunter-1", { role: PlayerRole.HUNTER });

      scoring.onPropKilled("hunter-1");
      scoring.onPropKilled("hunter-1");
      expect(hunter.score).toBe(SCORE_PROP_KILL * 2);
    });

    it("should not crash if hunter session id is invalid", () => {
      expect(() => scoring.onPropKilled("nonexistent")).not.toThrow();
    });
  });

  describe("updateSurvivalScores", () => {
    it("should award survival points after the configured interval", () => {
      addPlayerToRoom(room, "prop-1", { role: PlayerRole.PROP, isAlive: true });
      addPlayerToRoom(room, "prop-2", { role: PlayerRole.PROP, isAlive: true });
      addPlayerToRoom(room, "hunter-1", { role: PlayerRole.HUNTER, isAlive: true });

      scoring.updateSurvivalScores(
        SCORE_PROP_SURVIVAL_INTERVAL_SECONDS * 1000,
      );

      expect(room.state.players.get("prop-1")!.score).toBe(SCORE_PROP_SURVIVE_PER_SEC);
      expect(room.state.players.get("prop-2")!.score).toBe(SCORE_PROP_SURVIVE_PER_SEC);
      expect(room.state.players.get("hunter-1")!.score).toBe(0);
    });

    it("should not award survival points to dead props", () => {
      addPlayerToRoom(room, "prop-dead", { role: PlayerRole.PROP, isAlive: false });
      addPlayerToRoom(room, "prop-alive", { role: PlayerRole.PROP, isAlive: true });

      scoring.updateSurvivalScores(
        SCORE_PROP_SURVIVAL_INTERVAL_SECONDS * 1000,
      );

      expect(room.state.players.get("prop-dead")!.score).toBe(0);
      expect(room.state.players.get("prop-alive")!.score).toBe(SCORE_PROP_SURVIVE_PER_SEC);
    });

    it("should accumulate fractional time and award only on a full interval", () => {
      addPlayerToRoom(room, "prop-1", { role: PlayerRole.PROP, isAlive: true });

      const halfIntervalMs =
        SCORE_PROP_SURVIVAL_INTERVAL_SECONDS * 1000 / 2;
      scoring.updateSurvivalScores(halfIntervalMs);
      expect(room.state.players.get("prop-1")!.score).toBe(0);

      scoring.updateSurvivalScores(halfIntervalMs);
      expect(room.state.players.get("prop-1")!.score).toBe(SCORE_PROP_SURVIVE_PER_SEC);
    });

    it("should handle multiple scoring intervals at once", () => {
      addPlayerToRoom(room, "prop-1", { role: PlayerRole.PROP, isAlive: true });

      scoring.updateSurvivalScores(
        SCORE_PROP_SURVIVAL_INTERVAL_SECONDS * 3 * 1000,
      );
      expect(room.state.players.get("prop-1")!.score).toBe(SCORE_PROP_SURVIVE_PER_SEC * 3);
    });
  });
});
