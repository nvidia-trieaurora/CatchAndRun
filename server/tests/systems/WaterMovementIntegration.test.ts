import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GamePhase, PlayerRole, ServerMessage, WATER_DROWN_GRACE_MS, type PlayerInputData } from "@catch-and-run/shared";
import type { ClientConfig } from "../../../client/src/config/ClientConfig";
import type { InputManager, InputState } from "../../../client/src/input/InputManager";
import { HunterController } from "../../../client/src/game/controllers/HunterController";
import { PropController } from "../../../client/src/game/controllers/PropController";
import { GameRoom } from "../../src/rooms/GameRoom";
import { AntiCheat } from "../../src/systems/AntiCheat";
import { DrowningTracker, findWaterHazard } from "../../src/systems/EnvironmentalHazards";
import { getMapData } from "../../src/data/maps";
import { createGameState, createPlayer } from "../helpers/factories";

const harbor = getMapData("harbor-warehouse");
const config = { get: () => ({ sensitivity: 0.002 }) } as ClientConfig;

function createHarness(role: PlayerRole.HUNTER | PlayerRole.PROP, jump: boolean, feetY = 8) {
  const inputState = { jump } as InputState;
  const input = {
    isPointerLocked: () => true,
    consumeMouseDelta: () => ({ x: 0, y: 0 }),
    getState: () => inputState,
  } as unknown as InputManager;
  const controller = role === PlayerRole.HUNTER
    ? new HunterController(new THREE.PerspectiveCamera(), input, config)
    : new PropController(new THREE.PerspectiveCamera(), input, config);
  controller.setMovementBounds(harbor.bounds.min.x, harbor.bounds.max.x, harbor.bounds.min.z, harbor.bounds.max.z);
  controller.setWaterVolumes(harbor.waterHazards);
  controller.setPosition(7, feetY, 50); // water beside the actual moored workboat

  const player = createPlayer({ sessionId: "swimmer", role, x: 7, y: feetY, z: 50 });
  const state = createGameState({ phase: GamePhase.ACTIVE });
  state.config.mapId = harbor.id;
  state.players.set(player.sessionId, player);
  const room = Object.assign(Object.create(GameRoom.prototype), {
    state,
    broadcast: vi.fn(),
    matchSM: { checkRoundEndCondition: vi.fn() },
    hunterBoostEnd: new Map(),
    drowning: new DrowningTracker(),
  });
  room.antiCheat = new AntiCheat(room);
  const client = { sessionId: player.sessionId };
  let seq = 0;
  const send = () => {
    const pos = controller.getPosition();
    const data: PlayerInputData = {
      x: pos.x,
      y: controller instanceof HunterController ? controller.getFeetY() : pos.y,
      z: pos.z,
      rotX: 0, rotY: 0, seq: ++seq, timestamp: Date.now(), isAiming: false,
    };
    room.handlePlayerInput(client, data);
  };
  return { controller, player, room, send, inputState };
}

afterEach(() => vi.useRealTimers());

describe("real movement → anti-cheat → room water elimination", () => {
  it.each([
    [PlayerRole.HUNTER, false], [PlayerRole.HUNTER, true],
    [PlayerRole.PROP, false], [PlayerRole.PROP, true],
  ] as const)("%s falling into open water dies after 3 seconds (holding jump: %s)", (role, jump) => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { controller, player, room, send } = createHarness(role, jump);
    let enteredAt: number | null = null;
    for (let frame = 0; frame < 600 && player.isAlive; frame++) {
      vi.setSystemTime(100_000 + Math.round(frame * 1000 / 60));
      controller.update(1 / 60, []);
      // Match the network's 20 Hz feet updates; room timer also runs without a
      // fresh input, so quitting input cannot prevent an already-started death.
      if (frame % 3 === 0) send();
      if (enteredAt === null && findWaterHazard(harbor, player.x, player.y, player.z)) enteredAt = Date.now();
      room.sweepDrowning();
    }
    expect(enteredAt).not.toBeNull();
    expect(player.isAlive).toBe(false);
    expect(Date.now() - enteredAt!).toBeGreaterThanOrEqual(WATER_DROWN_GRACE_MS);
    expect(Date.now() - enteredAt!).toBeLessThan(WATER_DROWN_GRACE_MS + 60);
    expect(player.health).toBe(0);
    expect(room.broadcast).toHaveBeenCalledExactlyOnceWith(ServerMessage.PLAYER_DROWNED, expect.objectContaining({ victimSessionId: "swimmer" }));
    expect(room.matchSM.checkRoundEndCondition).toHaveBeenCalledOnce();
  });

  it("a solid dry boat/platform deck remains safe while crouching or standing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { controller, player, room, send, inputState } = createHarness(PlayerRole.HUNTER, false, -0.35);
    const deck = new THREE.Box3(new THREE.Vector3(3, -0.6, 48), new THREE.Vector3(11, -0.35, 52));
    for (let frame = 0; frame < 300; frame++) {
      vi.setSystemTime(100_000 + Math.round(frame * 1000 / 60));
      inputState.crouch = frame < 150;
      controller.update(1 / 60, [deck]);
      if (frame % 3 === 0) send();
      room.sweepDrowning();
    }
    expect(player.y).toBeCloseTo(-0.35, 5);
    expect(player.isAlive).toBe(true);
    expect(room.broadcast).not.toHaveBeenCalled();
  });

  it("the room still drowns a submerged player when network inputs stop", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { player, room, send } = createHarness(PlayerRole.HUNTER, false, -1.6);
    send();
    vi.setSystemTime(102_999);
    room.sweepDrowning();
    expect(player.isAlive).toBe(true);
    vi.setSystemTime(103_000);
    room.sweepDrowning();
    expect(player.isAlive).toBe(false);
    room.sweepDrowning();
    expect(room.broadcast).toHaveBeenCalledTimes(1);
  });
});
