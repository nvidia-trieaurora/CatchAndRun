import { describe, it, expect, beforeEach } from "vitest";
import { HitValidation } from "../../src/systems/HitValidation";
import { SnapshotBuffer } from "../../src/utils/SnapshotBuffer";
import { createMockRoom, addPlayerToRoom, type MockGameRoom } from "../helpers/factories";
import { PlayerRole, WEAPON_DAMAGE, WEAPON_RANGE } from "@catch-and-run/shared";

describe("HitValidation", () => {
  let room: MockGameRoom;
  let snapshotBuffer: SnapshotBuffer;
  let hitValidation: HitValidation;

  beforeEach(() => {
    room = createMockRoom();
    snapshotBuffer = new SnapshotBuffer();
    hitValidation = new HitValidation(room as any, snapshotBuffer);
  });

  describe("processShot — hit detection", () => {
    it("should detect a hit when shooting directly at a prop", () => {
      const shooter = addPlayerToRoom(room, "hunter-1", {
        role: PlayerRole.HUNTER, x: 0, y: 1, z: 0,
      });
      const target = addPlayerToRoom(room, "prop-1", {
        role: PlayerRole.PROP, x: 10, y: 1, z: 0,
      });

      const result = hitValidation.processShot("hunter-1", {
        originX: 0, originY: 1, originZ: 0,
        dirX: 1, dirY: 0, dirZ: 0,
        timestamp: Date.now(),
      });

      expect(result.hitPlayerSessionId).toBe("prop-1");
      expect(result.damage).toBe(WEAPON_DAMAGE);
    });

    it("should miss when shooting away from the prop", () => {
      addPlayerToRoom(room, "hunter-1", {
        role: PlayerRole.HUNTER, x: 0, y: 1, z: 0,
      });
      addPlayerToRoom(room, "prop-1", {
        role: PlayerRole.PROP, x: 10, y: 1, z: 0,
      });

      const result = hitValidation.processShot("hunter-1", {
        originX: 0, originY: 1, originZ: 0,
        dirX: -1, dirY: 0, dirZ: 0,
        timestamp: Date.now(),
      });

      expect(result.hitPlayerSessionId).toBeNull();
      expect(result.hitEnvironment).toBe(true);
    });

    it("should not hit self", () => {
      addPlayerToRoom(room, "hunter-1", {
        role: PlayerRole.HUNTER, x: 0, y: 1, z: 0,
      });

      const result = hitValidation.processShot("hunter-1", {
        originX: 0, originY: 1, originZ: 0,
        dirX: 1, dirY: 0, dirZ: 0,
        timestamp: Date.now(),
      });

      expect(result.hitPlayerSessionId).toBeNull();
    });

    it("should not hit other hunters", () => {
      addPlayerToRoom(room, "hunter-1", {
        role: PlayerRole.HUNTER, x: 0, y: 1, z: 0,
      });
      addPlayerToRoom(room, "hunter-2", {
        role: PlayerRole.HUNTER, x: 10, y: 1, z: 0,
      });

      const result = hitValidation.processShot("hunter-1", {
        originX: 0, originY: 1, originZ: 0,
        dirX: 1, dirY: 0, dirZ: 0,
        timestamp: Date.now(),
      });

      expect(result.hitPlayerSessionId).toBeNull();
    });

    it("should not hit dead props", () => {
      addPlayerToRoom(room, "hunter-1", {
        role: PlayerRole.HUNTER, x: 0, y: 1, z: 0,
      });
      addPlayerToRoom(room, "prop-1", {
        role: PlayerRole.PROP, x: 10, y: 1, z: 0, isAlive: false,
      });

      const result = hitValidation.processShot("hunter-1", {
        originX: 0, originY: 1, originZ: 0,
        dirX: 1, dirY: 0, dirZ: 0,
        timestamp: Date.now(),
      });

      expect(result.hitPlayerSessionId).toBeNull();
    });

    it("should hit the closest prop when multiple are in line", () => {
      addPlayerToRoom(room, "hunter-1", {
        role: PlayerRole.HUNTER, x: 0, y: 1, z: 0,
      });
      addPlayerToRoom(room, "prop-near", {
        role: PlayerRole.PROP, x: 5, y: 1, z: 0,
      });
      addPlayerToRoom(room, "prop-far", {
        role: PlayerRole.PROP, x: 20, y: 1, z: 0,
      });

      const result = hitValidation.processShot("hunter-1", {
        originX: 0, originY: 1, originZ: 0,
        dirX: 1, dirY: 0, dirZ: 0,
        timestamp: Date.now(),
      });

      expect(result.hitPlayerSessionId).toBe("prop-near");
    });

    it("should miss when target is beyond WEAPON_RANGE", () => {
      addPlayerToRoom(room, "hunter-1", {
        role: PlayerRole.HUNTER, x: 0, y: 1, z: 0,
      });
      addPlayerToRoom(room, "prop-1", {
        role: PlayerRole.PROP, x: WEAPON_RANGE + 10, y: 1, z: 0,
      });

      const result = hitValidation.processShot("hunter-1", {
        originX: 0, originY: 1, originZ: 0,
        dirX: 1, dirY: 0, dirZ: 0,
        timestamp: Date.now(),
      });

      expect(result.hitPlayerSessionId).toBeNull();
    });
  });

  describe("processShot — zero direction vector", () => {
    it("should return no hit for zero-length direction", () => {
      addPlayerToRoom(room, "hunter-1", {
        role: PlayerRole.HUNTER, x: 0, y: 1, z: 0,
      });
      addPlayerToRoom(room, "prop-1", {
        role: PlayerRole.PROP, x: 10, y: 1, z: 0,
      });

      const result = hitValidation.processShot("hunter-1", {
        originX: 0, originY: 1, originZ: 0,
        dirX: 0, dirY: 0, dirZ: 0,
        timestamp: Date.now(),
      });

      expect(result.hitPlayerSessionId).toBeNull();
      expect(result.hitEnvironment).toBe(false);
      expect(result.damage).toBe(0);
    });
  });

  describe("processShot — snapshot rollback", () => {
    it("should use snapshot positions for lag-compensated hit detection", () => {
      addPlayerToRoom(room, "hunter-1", {
        role: PlayerRole.HUNTER, x: 0, y: 1, z: 0,
      });
      const prop = addPlayerToRoom(room, "prop-1", {
        role: PlayerRole.PROP, x: 20, y: 1, z: 0,
      });

      const pastPositions = new Map<string, { x: number; y: number; z: number }>();
      pastPositions.set("prop-1", { x: 10, y: 1, z: 0 });
      snapshotBuffer.push(1000, pastPositions);

      prop.x = 20;

      const result = hitValidation.processShot("hunter-1", {
        originX: 0, originY: 1, originZ: 0,
        dirX: 1, dirY: 0, dirZ: 0,
        timestamp: 1000,
      });

      expect(result.hitPlayerSessionId).toBe("prop-1");
    });
  });

  describe("rayVsAABB — edge cases", () => {
    it("should detect hit from different angles", () => {
      addPlayerToRoom(room, "hunter-1", {
        role: PlayerRole.HUNTER, x: 0, y: 1, z: -10,
      });
      addPlayerToRoom(room, "prop-1", {
        role: PlayerRole.PROP, x: 0, y: 1, z: 0,
      });

      const result = hitValidation.processShot("hunter-1", {
        originX: 0, originY: 1, originZ: -10,
        dirX: 0, dirY: 0, dirZ: 1,
        timestamp: Date.now(),
      });

      expect(result.hitPlayerSessionId).toBe("prop-1");
    });

    it("should miss when shooting parallel but offset", () => {
      addPlayerToRoom(room, "hunter-1", {
        role: PlayerRole.HUNTER, x: 0, y: 1, z: 0,
      });
      addPlayerToRoom(room, "prop-1", {
        role: PlayerRole.PROP, x: 10, y: 1, z: 5,
      });

      const result = hitValidation.processShot("hunter-1", {
        originX: 0, originY: 1, originZ: 0,
        dirX: 1, dirY: 0, dirZ: 0,
        timestamp: Date.now(),
      });

      expect(result.hitPlayerSessionId).toBeNull();
    });
  });
});
