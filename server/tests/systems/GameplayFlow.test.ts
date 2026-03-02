import { describe, it, expect, beforeEach } from "vitest";
import { MatchStateMachine } from "../../src/systems/MatchStateMachine";
import { ScoringSystem } from "../../src/systems/ScoringSystem";
import { HitValidation } from "../../src/systems/HitValidation";
import { SnapshotBuffer } from "../../src/utils/SnapshotBuffer";
import { RoleAssigner } from "../../src/systems/RoleAssigner";
import { createMockRoom, addPlayerToRoom, type MockGameRoom } from "../helpers/factories";
import {
  GamePhase,
  PlayerRole,
  WEAPON_DAMAGE,
  COUNTDOWN_DURATION,
  HIDE_PHASE_DURATION,
  SCORE_PROP_KILL,
  SCORE_PROP_SURVIVE_PER_SEC,
} from "@catch-and-run/shared";

describe("Full Gameplay Flow", () => {
  let room: MockGameRoom;
  let sm: MatchStateMachine;
  let scoring: ScoringSystem;
  let hitValidation: HitValidation;
  let snapshotBuffer: SnapshotBuffer;

  beforeEach(() => {
    room = createMockRoom();
    room.state.config.totalRounds = 1;
    room.state.config.roundTime = 300;
    room.state.totalRounds = 1;
    sm = new MatchStateMachine(room as any);
    scoring = new ScoringSystem(room as any);
    snapshotBuffer = new SnapshotBuffer();
    hitValidation = new HitValidation(room as any, snapshotBuffer);
  });

  function advancePhase(seconds: number) {
    sm.update(seconds * 1000 + 100);
  }

  describe("match lifecycle with kills", () => {
    it("should track kills and scores through a full round", () => {
      const hunter = addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER, isAlive: true });
      const prop1 = addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, isAlive: true, x: 10, y: 1, z: 0 });
      const prop2 = addPlayerToRoom(room, "p2", { role: PlayerRole.PROP, isAlive: true, x: 20, y: 1, z: 0 });

      sm.startMatch();
      advancePhase(COUNTDOWN_DURATION);
      advancePhase(HIDE_PHASE_DURATION);

      expect(room.state.phase).toBe(GamePhase.ACTIVE);

      scoring.updateSurvivalScores(3000);
      expect(prop1.score).toBe(SCORE_PROP_SURVIVE_PER_SEC * 3);
      expect(prop2.score).toBe(SCORE_PROP_SURVIVE_PER_SEC * 3);
      expect(hunter.score).toBe(0);

      scoring.onPropKilled("h1");
      expect(hunter.score).toBe(SCORE_PROP_KILL);

      prop1.isAlive = false;
      prop2.isAlive = false;
      sm.checkRoundEndCondition();
      expect(room.state.phase).toBe(GamePhase.ROUND_END);
    });

    it("should not award survival points to dead props", () => {
      addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER, isAlive: true });
      const prop = addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, isAlive: true });

      sm.startMatch();
      advancePhase(COUNTDOWN_DURATION);
      advancePhase(HIDE_PHASE_DURATION);

      scoring.updateSurvivalScores(2000);
      expect(prop.score).toBe(SCORE_PROP_SURVIVE_PER_SEC * 2);

      prop.isAlive = false;
      scoring.updateSurvivalScores(5000);
      expect(prop.score).toBe(SCORE_PROP_SURVIVE_PER_SEC * 2);
    });
  });

  describe("hit validation with movement", () => {
    it("should hit prop at direct line of sight", () => {
      addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER, x: 0, y: 1, z: 0 });
      addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, x: 5, y: 1, z: 0 });

      const result = hitValidation.processShot("h1", {
        originX: 0, originY: 1, originZ: 0,
        dirX: 1, dirY: 0, dirZ: 0,
        timestamp: Date.now(),
      });

      expect(result.hitPlayerSessionId).toBe("p1");
      expect(result.damage).toBe(WEAPON_DAMAGE);
    });

    it("should use snapshot rollback for lag-compensated hits", () => {
      addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER, x: 0, y: 1, z: 0 });
      const prop = addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, x: 50, y: 1, z: 0 });

      const pastPos = new Map<string, { x: number; y: number; z: number }>();
      pastPos.set("p1", { x: 8, y: 1, z: 0 });
      snapshotBuffer.push(1000, pastPos);

      prop.x = 50;

      const result = hitValidation.processShot("h1", {
        originX: 0, originY: 1, originZ: 0,
        dirX: 1, dirY: 0, dirZ: 0,
        timestamp: 1000,
      });

      expect(result.hitPlayerSessionId).toBe("p1");
    });
  });

  describe("role assignment fairness", () => {
    it("should rotate hunters across multiple rounds", () => {
      const assigner = new RoleAssigner();
      const players = ["a", "b", "c", "d"];
      const hunterCounts = new Map<string, number>();
      players.forEach((p) => hunterCounts.set(p, 0));

      for (let round = 0; round < 20; round++) {
        const roles = assigner.assignRoles(players, 4);
        roles.forEach((role, id) => {
          if (role === PlayerRole.HUNTER) {
            hunterCounts.set(id, (hunterCounts.get(id) ?? 0) + 1);
          }
        });
      }

      const counts = [...hunterCounts.values()];
      const maxDiff = Math.max(...counts) - Math.min(...counts);
      expect(maxDiff).toBeLessThanOrEqual(8);
    });
  });

  describe("phase transition edge cases", () => {
    it("should handle player disconnect during active phase", () => {
      addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER, isAlive: true });
      addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, isAlive: true });

      sm.startMatch();
      advancePhase(COUNTDOWN_DURATION);
      advancePhase(HIDE_PHASE_DURATION);

      expect(room.state.phase).toBe(GamePhase.ACTIVE);

      room.state.players.delete("p1");
      sm.checkRoundEndCondition();
      expect(room.state.phase).toBe(GamePhase.ROUND_END);
    });

    it("should not transition when both sides have alive players", () => {
      addPlayerToRoom(room, "h1", { role: PlayerRole.HUNTER, isAlive: true });
      addPlayerToRoom(room, "p1", { role: PlayerRole.PROP, isAlive: true });
      addPlayerToRoom(room, "p2", { role: PlayerRole.PROP, isAlive: false });

      sm.startMatch();
      advancePhase(COUNTDOWN_DURATION);
      advancePhase(HIDE_PHASE_DURATION);

      sm.checkRoundEndCondition();
      expect(room.state.phase).toBe(GamePhase.ACTIVE);
    });
  });
});
