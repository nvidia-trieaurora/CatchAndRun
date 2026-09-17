import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { WATER_DROWN_GRACE_MS, WATER_SURFACE_Y, WATER_SWIM_FEET_Y } from "@catch-and-run/shared";
import type { ClientConfig } from "../src/config/ClientConfig";
import type { InputManager, InputState } from "../src/input/InputManager";
import { HunterController } from "../src/game/controllers/HunterController";
import { PropController } from "../src/game/controllers/PropController";
import mapData from "../src/game/world/harbor-warehouse.json";
import { WATER_CLIMB_OUT_LIFT, WaterVolumes } from "../src/game/controllers/WaterSwim";
import { formatDrowningCountdown } from "../src/game/systems/WaterProximityWarning";

function createInput(state: Partial<InputState> = {}): InputManager {
  const inputState: InputState = {
    forward: false, backward: false, left: false, right: false, jump: false, crouch: false,
    shoot: false, reload: false, interact: false, lockPose: false, ability: false, ability2: false,
    scoreboard: false, soulMode: false, ...state,
  };
  return {
    isPointerLocked: () => true,
    consumeMouseDelta: () => ({ x: 0, y: 0 }),
    getState: () => inputState,
  } as unknown as InputManager;
}
const config = { get: () => ({ sensitivity: 0.002 }) } as ClientConfig;
// the north seawall cap the player walks off (z -43.45..-42.55, top 0.9)
const SEAWALL = new THREE.Box3(new THREE.Vector3(-55, 0, -43.45), new THREE.Vector3(63, 0.9, -42.55));

// Harbor: land x -55..63, z -43..47; the sea boxes start 1 cm outside that.
const water = new WaterVolumes();
water.setBoxes(mapData.waterHazards);

describe("water: falling in, swimming, climbing out", () => {
  it.each(["hunter", "prop"] as const)("%s cannot climb or bounce on any outer ocean boundary", (role) => {
    for (const [x, z, direction] of [[7, 64, "backward"], [7, -60, "forward"], [-72, 0, "left"], [80, 0, "right"]] as const) {
      const input = createInput({ jump: true, [direction]: true });
      const controller = role === "hunter"
        ? new HunterController(new THREE.PerspectiveCamera(), input, config)
        : new PropController(new THREE.PerspectiveCamera(), input, config);
      controller.setMovementBounds(-72, 80, -60, 64);
      controller.setWaterVolumes(mapData.waterHazards);
      controller.setPosition(x, WATER_SWIM_FEET_Y, z);
      for (let frame = 0; frame < 240; frame++) {
        controller.update(1 / 60, []);
        expect(controller.isInWater(), `${role} escaped ocean boundary ${direction}`).toBe(true);
      }
    }
  });

  it("real foot contact on a low boat is dry, but the water beneath and beside it is not", () => {
    const volume = new WaterVolumes();
    volume.setBoxes(mapData.waterHazards);
    volume.setDrySupports([new THREE.Box3(new THREE.Vector3(16.5, -1.08, 48.25), new THREE.Vector3(19.6, -1.04, 49.15))]);
    expect(volume.isIn(17.5, -1.04, 49.29)).toBe(false);
    expect(volume.speedMultiplier(17.5, -1.04, 49.29)).toBe(1);
    expect(volume.isIn(17.5, -1.6, 49.29)).toBe(true);
    expect(volume.isIn(17.5, -1.04, 49.5)).toBe(true);
    volume.setDrySupports([]);
    expect(volume.isIn(17.5, -1.04, 49.29)).toBe(true);
  });

  it.each(["hunter", "prop"] as const)("%s cannot bounce off the swim plane to reset drowning", (role) => {
    const controller = role === "hunter"
      ? new HunterController(new THREE.PerspectiveCamera(), createInput({ jump: true }), config)
      : new PropController(new THREE.PerspectiveCamera(), createInput({ jump: true }), config);
    controller.setMovementBounds(mapData.bounds.min.x, mapData.bounds.max.x, mapData.bounds.min.z, mapData.bounds.max.z);
    controller.setWaterVolumes(mapData.waterHazards);
    controller.setPosition(7, WATER_SWIM_FEET_Y, 50);
    // Longer than the full grace period: holding Space must not create a dry
    // sample every time the buoyancy plane catches the player.
    for (let i = 0; i < 240; i++) {
      controller.update(1 / 60, []);
      expect(controller.isInWater()).toBe(true);
    }
  });

  it.each(["hunter", "prop"] as const)("%s may still jump from a dry boat deck above the sea", (role) => {
    const controller = role === "hunter"
      ? new HunterController(new THREE.PerspectiveCamera(), createInput({ jump: true }), config)
      : new PropController(new THREE.PerspectiveCamera(), createInput({ jump: true }), config);
    controller.setMovementBounds(mapData.bounds.min.x, mapData.bounds.max.x, mapData.bounds.min.z, mapData.bounds.max.z);
    controller.setWaterVolumes(mapData.waterHazards);
    controller.setPosition(7, 0.15, 50);
    const deck = new THREE.Box3(new THREE.Vector3(3, -0.2, 48), new THREE.Vector3(11, 0.15, 52));
    const startY = controller.getPosition().y;
    controller.update(1 / 60, [deck]);
    expect(controller.getPosition().y).toBeGreaterThan(startY);
    expect(controller.isInWater()).toBe(false);
  });

  it("Hunter respawns at the requested feet height after crouching", () => {
    const input = createInput({ crouch: true });
    const controller = new HunterController(new THREE.PerspectiveCamera(), input, config);
    controller.setPosition(0, 0, 0);
    for (let i = 0; i < 60; i++) controller.update(1 / 60, []);
    input.getState().crouch = false;
    controller.setPosition(0, 0, 0);
    controller.update(1 / 60, []);
    expect(controller.getPosition().y).toBeCloseTo(1.6, 5);
  });

  it("Hunter physical feet remain above the water while crouching on a low boat deck", () => {
    const input = createInput({ crouch: true });
    const controller = new HunterController(new THREE.PerspectiveCamera(), input, config);
    controller.setMovementBounds(mapData.bounds.min.x, mapData.bounds.max.x, mapData.bounds.min.z, mapData.bounds.max.z);
    controller.setWaterVolumes(mapData.waterHazards);
    controller.setPosition(7, -0.35, 50);
    const deck = new THREE.Box3(new THREE.Vector3(3, -0.6, 48), new THREE.Vector3(11, -0.35, 52));
    for (let i = 0; i < 60; i++) controller.update(1 / 60, [deck]);
    // A hardcoded standing eye subtraction would send -1.05 and falsely drown
    // this player, even though the supported physical feet are dry.
    expect(controller.getPosition().y - 1.6).toBeLessThan(WATER_SURFACE_Y);
    expect(controller.getFeetY()).toBeCloseTo(-0.35, 5);
    expect(controller.isInWater()).toBe(false);
  });

  it("only the sea footprint drops the ground plane to the swim level", () => {
    expect(water.fallbackGroundY(0, 0, 0)).toBe(0);
    expect(water.fallbackGroundY(45, -43.3, 0)).toBe(WATER_SWIM_FEET_Y);   // just off the north seawall
    expect(water.fallbackGroundY(-60, 10, 0)).toBe(WATER_SWIM_FEET_Y);
    expect(water.fallbackGroundY(38, 50, 0)).toBe(WATER_SWIM_FEET_Y);
  });

  it("a body standing on a seawall or pier over the water is not in the water", () => {
    expect(water.isIn(45, 0.9, -43.3)).toBe(false);
    expect(water.isIn(38, 0.6, 50)).toBe(false);
    // ... until it drops below the surface
    expect(water.isIn(45, WATER_SURFACE_Y - 0.05, -43.3)).toBe(true);
    expect(water.isIn(45, WATER_SWIM_FEET_Y, -43.3)).toBe(true);
    // the map's hazard boxes agree with the client (server kills only under the surface)
    for (const box of mapData.waterHazards) expect(box.max.y).toBeLessThan(WATER_SURFACE_Y);
  });

  it("swims slower than it walks and climbs out when it reaches the shore", () => {
    expect(water.speedMultiplier(45, WATER_SWIM_FEET_Y, -43.3)).toBeLessThan(1);
    expect(water.speedMultiplier(45, 0.9, -43.3)).toBe(1);
    // swimming south from the north sea onto the island lifts the body onto the land
    expect(water.climbOut(45, -43.3, 45, -42.9, WATER_SWIM_FEET_Y, 0)).toBe(WATER_CLIMB_OUT_LIFT);
    // walking along the shore on land, or staying in the water, changes nothing
    expect(water.climbOut(45, -42.9, 45, -42.5, 0, 0)).toBeNull();
    expect(water.climbOut(45, -43.3, 45, -43.6, WATER_SWIM_FEET_Y, 0)).toBeNull();
    // a body still above the shore height (mid-air over the edge) is not "climbing out"
    expect(water.climbOut(45, -43.3, 45, -42.9, -0.2, 0)).toBeNull();
  });

  it("shows the server's grace as a countdown", () => {
    expect(WATER_DROWN_GRACE_MS).toBe(3000);
    expect(formatDrowningCountdown(2.96)).toBe("IN THE WATER — CLIMB OUT! 3.0 s");
    expect(formatDrowningCountdown(-0.2)).toBe("IN THE WATER — CLIMB OUT! 0.0 s");
  });

  it("Hunter: walks off the seawall, falls to the swim level, swims back and climbs out", () => {
    const controller = new HunterController(new THREE.PerspectiveCamera(), createInput({ forward: true }), config);
    controller.setMovementBounds(mapData.bounds.min.x, mapData.bounds.max.x, mapData.bounds.min.z, mapData.bounds.max.z);
    controller.setWaterVolumes(mapData.waterHazards);
    controller.setPosition(45, 0.9, -43.0);      // standing on the north seawall cap
    controller.setRotation(0, 0);                // forward = -z (north, toward the sea)
    let feet = 0.9;
    for (let i = 0; i < 90; i++) {
      const pos = controller.update(1 / 60, [SEAWALL]);
      feet = pos.y - 1.6;
    }
    // 1.5 s later the body floats at the swim level, under the surface, over the sea
    expect(feet).toBeCloseTo(WATER_SWIM_FEET_Y, 1);
    expect(controller.isInWater()).toBe(true);
    const swimming = controller.getPosition();
    expect(swimming.z).toBeLessThan(-43.45);
    // turn around and swim south: the shore lifts the body, gravity lands it on the seawall cap
    controller.setRotation(0, Math.PI);
    let climbed = false;
    for (let i = 0; i < 240 && !climbed; i++) {
      const pos = controller.update(1 / 60, [SEAWALL]);
      climbed = !controller.isInWater() && pos.y - 1.6 >= 0.85 && pos.z > -43.01;
    }
    expect(climbed).toBe(true);
    // and once on land the slow swim speed is gone: a dry step covers the full walk distance
    const before = controller.getPosition();
    const after = controller.update(0.1, [SEAWALL]);
    expect(after.distanceTo(before)).toBeGreaterThan(0.6);
  });

  it("Prop: drops into the water off the south edge and floats at the swim level", () => {
    const controller = new PropController(new THREE.PerspectiveCamera(), createInput({ forward: true }), config);
    controller.setMovementBounds(mapData.bounds.min.x, mapData.bounds.max.x, mapData.bounds.min.z, mapData.bounds.max.z);
    controller.setWaterVolumes(mapData.waterHazards);
    controller.setPosition(38, 0, 46.8);
    // PropController forward is -z relative to yaw; yaw π walks toward +z (south, the sea)
    (controller as unknown as { targetYaw: number; currentYaw: number }).targetYaw = Math.PI;
    (controller as unknown as { targetYaw: number; currentYaw: number }).currentYaw = Math.PI;
    let pos = new THREE.Vector3();
    for (let i = 0; i < 90; i++) pos = controller.update(1 / 60, []);
    expect(pos.z).toBeGreaterThan(47.01);
    expect(pos.y).toBeCloseTo(WATER_SWIM_FEET_Y, 1);
    expect(controller.isInWater()).toBe(true);
  });
});
