import { describe, expect, it, vi } from "vitest";
import { PlayerRole, ServerMessage } from "@catch-and-run/shared";
import type { PlayerDrownedData } from "@catch-and-run/shared";
import { getMapData } from "../../src/data/maps";
import { DrowningTracker, findWaterHazard } from "../../src/systems/EnvironmentalHazards";
import { eliminatePlayerInWater } from "../../src/systems/EnvironmentalEliminationHandler";
import { createPlayer } from "../helpers/factories";

describe("Harbor environmental water hazards", () => {
  it("detects a body under the sea surface without treating island ground as water", () => {
    const harbor = getMapData("harbor-warehouse");

    // feet below the surface (-0.8): swimming / sinking
    expect(findWaterHazard(harbor, 0, -1.6, 55)).toBe("ocean-south");
    expect(findWaterHazard(harbor, -65, -1.6, 0)).toBe("ocean-west");
    expect(findWaterHazard(harbor, 0, -1.6, 0)).toBeNull();
    expect(findWaterHazard(harbor, -48, -1.6, 38)).toBeNull();
  });

  it("never counts a player standing on a seawall, pier or fence above the water", () => {
    const harbor = getMapData("harbor-warehouse");

    // north seawall cap (z -43.45..-42.55, top 0.9) and the BD seawall walkway
    expect(findWaterHazard(harbor, 45, 0.9, -43.3)).toBeNull();
    expect(findWaterHazard(harbor, 63.5, 0, 0)).toBeNull();
    // Ferris pier deck out over the south water
    expect(findWaterHazard(harbor, 38, 0.6, 50)).toBeNull();
    // ... but the water right under those spots is lethal
    expect(findWaterHazard(harbor, 45, -1.0, -43.3)).toBe("ocean-north");
    expect(findWaterHazard(harbor, 38, -1.0, 50)).toBe("ocean-south");
  });

  it("gives a player who fell in the full grace period to climb out", () => {
    const tracker = new DrowningTracker(3000);

    expect(tracker.update("a", true, 1000)).toBe("entered");
    expect(tracker.update("a", true, 2500)).toBe("submerged");
    expect(tracker.secondsLeft("a", 2500)).toBeCloseTo(1.5, 5);
    // climbed out at 3.9 s: clock resets, nothing happens
    expect(tracker.update("a", false, 3900)).toBe("dry");
    expect(tracker.update("a", true, 4000)).toBe("entered");
    expect(tracker.update("a", true, 6999)).toBe("submerged");
    expect(tracker.update("a", true, 7000)).toBe("drowned");
    // drowned players are dropped from the clock
    expect(tracker.secondsLeft("a", 7000)).toBeNull();
  });

  it("reports players whose inputs stopped while they were under water", () => {
    const tracker = new DrowningTracker(3000);
    tracker.update("a", true, 0);
    tracker.update("b", true, 2000);
    expect(tracker.expired(2999)).toEqual([]);
    expect(tracker.expired(3000)).toEqual(["a"]);
    tracker.clear("a");
    expect(tracker.expired(5000)).toEqual(["b"]);
    tracker.clear();
    expect(tracker.expired(9000)).toEqual([]);
  });

  it("does not add water deaths to the school map", () => {
    expect(findWaterHazard(getMapData("school"), 0, 0, 39)).toBeNull();
  });

  it.each([PlayerRole.HUNTER, PlayerRole.PROP])(
    "eliminates a %s in water without awarding a combat kill",
    (role) => {
      const player = createPlayer({
        role,
        isAlive: true,
        health: 50,
        x: 0,
        y: 0,
        z: 55,
        currentPropId: role === PlayerRole.PROP ? "crate" : "",
        isLocked: role === PlayerRole.PROP,
      });
      const room = {
        broadcast: vi.fn(),
        matchSM: { checkRoundEndCondition: vi.fn() },
      };

      eliminatePlayerInWater(room, "victim", player);

      expect(player.isAlive).toBe(false);
      expect(player.role).toBe(PlayerRole.SPECTATOR);
      expect(player.health).toBe(0);
      expect(player.currentPropId).toBe("");
      expect(player.isLocked).toBe(false);
      expect(room.broadcast).toHaveBeenCalledWith(
        ServerMessage.PLAYER_DROWNED,
        expect.objectContaining({
          victimSessionId: "victim",
          z: 55,
          cinematicMs: 2400,
          cameraX: expect.any(Number),
          cameraY: expect.any(Number),
          cameraZ: expect.any(Number),
        }),
      );
      const payload = room.broadcast.mock.calls.at(0)?.[1] as PlayerDrownedData;
      expect(payload.cameraZ).toBeGreaterThan(55);
      expect(payload.cameraY).toBeGreaterThan(player.y);
      expect(room.matchSM.checkRoundEndCondition).toHaveBeenCalledOnce();
    },
  );
});
