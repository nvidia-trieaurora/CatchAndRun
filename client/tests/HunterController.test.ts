import * as THREE from "three";
import {
  HUNTER_AIM_SPEED_MULTIPLIER,
  HUNTER_SPEED,
} from "@catch-and-run/shared";
import { describe, expect, it } from "vitest";
import type { ClientConfig } from "../src/config/ClientConfig";
import {
  getHunterMovementSpeed,
  HunterController,
} from "../src/game/controllers/HunterController";
import type { InputManager, InputState } from "../src/input/InputManager";

function createInput(state: Partial<InputState> = {}): InputManager {
  const inputState: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    crouch: false,
    shoot: false,
    reload: false,
    interact: false,
    lockPose: false,
    ability: false,
    ability2: false,
    scoreboard: false,
    soulMode: false,
    ...state,
  };

  return {
    isPointerLocked: () => true,
    consumeMouseDelta: () => ({ x: 0, y: 0 }),
    getState: () => inputState,
  } as unknown as InputManager;
}

const config = {
  get: () => ({ sensitivity: 0.002 }),
} as ClientConfig;

describe("HunterController movement", () => {
  it("keeps boosted ADS at the same 30% movement cap", () => {
    expect(getHunterMovementSpeed(false, true)).toBe(
      HUNTER_SPEED * HUNTER_AIM_SPEED_MULTIPLIER,
    );
    expect(getHunterMovementSpeed(true, true)).toBe(
      HUNTER_SPEED * HUNTER_AIM_SPEED_MULTIPLIER,
    );
    expect(getHunterMovementSpeed(true, false)).toBe(HUNTER_SPEED * 2);
  });

  it("moves at 30% speed while aiming", () => {
    const controller = new HunterController(
      new THREE.PerspectiveCamera(),
      createInput({ forward: true }),
      config,
    );
    controller.setPosition(0, 0, 0);
    controller.setMovementTuning(
      HUNTER_SPEED * HUNTER_AIM_SPEED_MULTIPLIER,
      13,
    );

    const position = controller.update(0.1, []);

    expect(position.z).toBeCloseTo(
      -HUNTER_SPEED * HUNTER_AIM_SPEED_MULTIPLIER * 0.1,
    );
  });

  it("can face the east-side Hunter gate at spawn", () => {
    const controller = new HunterController(
      new THREE.PerspectiveCamera(),
      createInput({ forward: true }),
      config,
    );
    controller.setPosition(-40, 0, 0);
    controller.setRotation(0, -Math.PI / 2);

    const position = controller.update(0.1, []);

    expect(position.x).toBeGreaterThan(-40);
    expect(position.z).toBeCloseTo(0);
  });
});
