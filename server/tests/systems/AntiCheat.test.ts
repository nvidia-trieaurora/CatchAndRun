import { describe, it, expect, beforeEach, vi } from "vitest";
import { AntiCheat } from "../../src/systems/AntiCheat";
import { createMockRoom, createPlayer, type MockGameRoom } from "../helpers/factories";
import {
  PlayerRole,
  HUNTER_SPEED,
  PROP_SPEED,
  ANTI_CHEAT_SPEED_TOLERANCE,
  ANTI_CHEAT_MIN_FIRE_INTERVAL_MS,
} from "@catch-and-run/shared";

describe("AntiCheat", () => {
  let room: MockGameRoom;
  let antiCheat: AntiCheat;

  beforeEach(() => {
    room = createMockRoom();
    antiCheat = new AntiCheat(room as any);
  });

  describe("validateMovement", () => {
    it("should accept movement within map bounds", () => {
      const player = createPlayer({ x: 0, y: 1, z: 0, lastPositionTime: 0 });
      const input = { x: 5, y: 1, z: 5, rotX: 0, rotY: 0, seq: 1, timestamp: 0 };

      expect(antiCheat.validateMovement(player, input)).toBe(true);
    });

    it("should reject movement outside map bounds", () => {
      const player = createPlayer({ x: 0, y: 1, z: 0, lastPositionTime: 0 });
      const input = { x: 9999, y: 1, z: 0, rotX: 0, rotY: 0, seq: 1, timestamp: 0 };

      expect(antiCheat.validateMovement(player, input)).toBe(false);
    });

    it("should reject movement below killzone Y", () => {
      const player = createPlayer({ x: 0, y: 1, z: 0, lastPositionTime: 0 });
      const input = { x: 0, y: -999, z: 0, rotX: 0, rotY: 0, seq: 1, timestamp: 0 };

      expect(antiCheat.validateMovement(player, input)).toBe(false);
    });

    it("should accept movement at valid speed for hunter", () => {
      const now = Date.now();
      const dt = 1;
      const player = createPlayer({
        role: PlayerRole.HUNTER,
        x: 0, y: 1, z: 0,
        lastPositionTime: now - dt * 1000,
      });

      vi.spyOn(Date, "now").mockReturnValue(now);
      const maxDist = HUNTER_SPEED * ANTI_CHEAT_SPEED_TOLERANCE * dt;
      const input = { x: maxDist - 0.5, y: 1, z: 0, rotX: 0, rotY: 0, seq: 1, timestamp: 0 };

      expect(antiCheat.validateMovement(player, input)).toBe(true);
      vi.restoreAllMocks();
    });

    it("should reject teleport-like speed hack for hunter", () => {
      const now = Date.now();
      const dt = 0.05; // 50ms tick
      const player = createPlayer({
        role: PlayerRole.HUNTER,
        x: 0, y: 1, z: 0,
        lastPositionTime: now - dt * 1000,
      });

      vi.spyOn(Date, "now").mockReturnValue(now);
      const input = { x: 30, y: 1, z: 0, rotX: 0, rotY: 0, seq: 1, timestamp: 0 };

      expect(antiCheat.validateMovement(player, input)).toBe(false);
      vi.restoreAllMocks();
    });

    it("should accept movement at valid speed for prop", () => {
      const now = Date.now();
      const dt = 1;
      const player = createPlayer({
        role: PlayerRole.PROP,
        x: 0, y: 1, z: 0,
        lastPositionTime: now - dt * 1000,
      });

      vi.spyOn(Date, "now").mockReturnValue(now);
      const maxDist = PROP_SPEED * ANTI_CHEAT_SPEED_TOLERANCE * dt;
      const input = { x: maxDist - 0.5, y: 1, z: 0, rotX: 0, rotY: 0, seq: 1, timestamp: 0 };

      expect(antiCheat.validateMovement(player, input)).toBe(true);
      vi.restoreAllMocks();
    });

    it("should allow first movement (lastPositionTime === 0)", () => {
      const player = createPlayer({ x: 0, y: 1, z: 0, lastPositionTime: 0 });
      const input = { x: 5, y: 1, z: 5, rotX: 0, rotY: 0, seq: 1, timestamp: 0 };

      expect(antiCheat.validateMovement(player, input)).toBe(true);
    });
  });

  describe("validateFireRate", () => {
    it("should allow shooting when enough time has passed", () => {
      const player = createPlayer({ lastFireTime: Date.now() - 500 });
      expect(antiCheat.validateFireRate(player)).toBe(true);
    });

    it("should reject rapid fire (below minimum interval)", () => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);
      const player = createPlayer({ lastFireTime: now - (ANTI_CHEAT_MIN_FIRE_INTERVAL_MS - 10) });

      expect(antiCheat.validateFireRate(player)).toBe(false);
      vi.restoreAllMocks();
    });

    it("should allow fire exactly at minimum interval", () => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);
      const player = createPlayer({ lastFireTime: now - ANTI_CHEAT_MIN_FIRE_INTERVAL_MS });

      expect(antiCheat.validateFireRate(player)).toBe(true);
      vi.restoreAllMocks();
    });

    it("should allow first shot (lastFireTime === 0)", () => {
      const player = createPlayer({ lastFireTime: 0 });
      expect(antiCheat.validateFireRate(player)).toBe(true);
    });
  });
});
