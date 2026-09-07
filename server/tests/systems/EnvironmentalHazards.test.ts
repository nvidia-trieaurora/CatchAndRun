import { describe, expect, it, vi } from "vitest";
import { PlayerRole, ServerMessage } from "@catch-and-run/shared";
import type { PlayerDrownedData } from "@catch-and-run/shared";
import { getMapData } from "../../src/data/maps";
import { findWaterHazard } from "../../src/systems/EnvironmentalHazards";
import { eliminatePlayerInWater } from "../../src/systems/EnvironmentalEliminationHandler";
import { createPlayer } from "../helpers/factories";

describe("Harbor environmental water hazards", () => {
  it("detects surrounding ocean without treating island ground as water", () => {
    const harbor = getMapData("harbor-warehouse");

    expect(findWaterHazard(harbor, 0, 0, 55)).toBe("ocean-south");
    expect(findWaterHazard(harbor, -65, 0, 0)).toBe("ocean-west");
    expect(findWaterHazard(harbor, 0, 0, 0)).toBeNull();
    expect(findWaterHazard(harbor, -48, 0, 38)).toBeNull();
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
