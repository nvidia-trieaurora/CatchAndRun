import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GamePhase, PlayerRole, ServerMessage, WATER_DROWN_GRACE_MS, type PlayerInputData, type PlayerDrownedData } from "@catch-and-run/shared";
import { actualHarborFleet } from "../../../client/tests/helpers/actualHarborFleet";
import { HunterController } from "../../../client/src/game/controllers/HunterController";
import { PropController } from "../../../client/src/game/controllers/PropController";
import type { InputManager, InputState } from "../../../client/src/input/InputManager";
import type { ClientConfig } from "../../../client/src/config/ClientConfig";
import { GameRoom } from "../../src/rooms/GameRoom";
import { AntiCheat } from "../../src/systems/AntiCheat";
import { DrowningTracker, findWaterHazard } from "../../src/systems/EnvironmentalHazards";
import { createGameState, createPlayer } from "../helpers/factories";
import { getMapData } from "../../src/data/maps";

const harbor = getMapData("harbor-warehouse");
const feet = (controller: HunterController | PropController) => controller instanceof HunterController ? controller.getFeetY() : controller.getPosition().y;
afterEach(() => vi.useRealTimers());

describe("shipped boat movement → room drowning authority", () => {
  it.each([
    ["high", PlayerRole.HUNTER], ["high", PlayerRole.PROP],
    ["low", PlayerRole.HUNTER], ["low", PlayerRole.PROP],
  ] as const)("%s %s survives all five real decks, then dies after leaving for the ocean", async (quality, role) => {
    const { boats, motion, water } = await actualHarborFleet(quality);
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    const state = createGameState({ phase: GamePhase.ACTIVE });
    state.config.mapId = harbor.id;
    const broadcast = vi.fn<(type: string, payload: PlayerDrownedData) => void>();
    const room = Object.assign(Object.create(GameRoom.prototype) as object, {
      state, broadcast, matchSM: { checkRoundEndCondition: vi.fn() },
      hunterBoostEnd: new Map(), drowning: new DrowningTracker(),
    }) as unknown as {
      antiCheat: AntiCheat;
      handlePlayerInput(client: { sessionId: string }, input: PlayerInputData): void;
      sweepDrowning(): void;
    };
    room.antiCheat = new AntiCheat(room as unknown as GameRoom);
    const actors = [[7, 50], [-8, 49.4], [-15.5, 48.6], [17.5, 48.7], [3, 57.5]].map(([x, z], index) => {
      const inputState = {} as InputState;
      const input = { isPointerLocked: () => true, consumeMouseDelta: () => ({ x: 0, y: 0 }), getState: () => inputState } as unknown as InputManager;
      const config = { get: () => ({ sensitivity: .002 }) } as ClientConfig;
      const controller = role === PlayerRole.HUNTER ? new HunterController(new THREE.PerspectiveCamera(), input, config) : new PropController(new THREE.PerspectiveCamera(), input, config);
      controller.setWaterVolumes(harbor.waterHazards);
      controller.setMovementBounds(-72, 80, -60, 64);
      controller.setBoatSupports(boats.colliders);
      controller.setPosition(x, 5, z);
      const player = createPlayer({ sessionId: `rider-${index}`, role, x, y: 5, z });
      state.players.set(player.sessionId, player);
      return { controller, inputState, player, enteredAt: null as number | null };
    });
    const delta = new THREE.Vector3();
    for (let frame = 0; frame < 3000; frame++) {
      vi.setSystemTime(100_000 + Math.round(frame * 1000 / 60));
      water.update(1 / 60); motion.update(1 / 60, water); boats.update();
      for (const actor of actors) {
        const { controller, inputState, player } = actor;
        if (!player.isAlive) continue;
        let pos = controller.getPosition();
        if (boats.carryDelta(pos.x, feet(controller), pos.z, delta)) controller.translatePosition(delta.x, delta.y, delta.z);
        inputState.backward = frame >= 1500;
        inputState.jump = frame >= 1500;
        controller.update(1 / 60, boats.colliders);
        pos = controller.getPosition();
        if (frame % 3 === 0) room.handlePlayerInput({ sessionId: player.sessionId }, {
          x: pos.x, y: feet(controller), z: pos.z, rotX: 0, rotY: 0,
          seq: frame + 1, timestamp: Date.now(), isAiming: false,
        });
        if (findWaterHazard(harbor, player.x, player.y, player.z) && actor.enteredAt === null) actor.enteredAt = Date.now();
      }
      room.sweepDrowning();
      if (frame < 1500) for (const actor of actors) expect(actor.player.isAlive, `false water death on vessel ${actor.player.sessionId} at frame ${frame}`).toBe(true);
      if (actors.every(({ player }) => !player.isAlive)) break;
    }
    for (const actor of actors) {
      expect(actor.player.isAlive).toBe(false);
      expect(actor.enteredAt).not.toBeNull();
      if (actor.enteredAt === null) throw new Error("Never entered the ocean");
      expect(Date.now() - actor.enteredAt).toBeGreaterThanOrEqual(WATER_DROWN_GRACE_MS);
    }
    const drownEvents = broadcast.mock.calls.filter(([name]) => name === ServerMessage.PLAYER_DROWNED);
    expect(drownEvents).toHaveLength(5);
    expect(new Set(drownEvents.map(([, payload]) => payload.victimSessionId)).size).toBe(5);
    water.dispose();
  });

  it("does not turn skiff hull corners, the water underneath, or other maps into safe zones", () => {
    expect(findWaterHazard(harbor, -15.5, -1.02, 48.6)).toBeNull();
    expect(findWaterHazard(harbor, 17.5, -1.02, 48.7)).toBeNull();
    for (const [x, y, z] of [[-15, -1.6, 48.6], [18, -1.6, 48.7], [-16.9, -1.02, 49.2], [20, -1.02, 49.3], [-15.5, -1.11, 48.6]]) {
      expect(findWaterHazard(harbor, x, y, z)).toBe("ocean-south");
    }
    expect(findWaterHazard({ ...harbor, id: "different-map" }, -15.5, -1.02, 48.6)).toBe("ocean-south");
  });
});
