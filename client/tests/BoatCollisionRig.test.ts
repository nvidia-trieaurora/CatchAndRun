import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { actualHarborFleet as actualFleet } from "./helpers/actualHarborFleet";
import { HunterController } from "../src/game/controllers/HunterController";
import { PropController } from "../src/game/controllers/PropController";
import type { InputManager, InputState } from "../src/input/InputManager";
import type { ClientConfig } from "../src/config/ClientConfig";
import mapJson from "../src/game/world/harbor-warehouse.json";
import type { MapData } from "@catch-and-run/shared";
import { HARBOR_LOW_BOAT_DECKS } from "@catch-and-run/shared";
import { findWaterHazard, DrowningTracker } from "../../server/src/systems/EnvironmentalHazards";

function actor(role: "hunter" | "prop", x: number, y: number, z: number) {
  const state = {} as InputState;
  const input = { isPointerLocked: () => true, consumeMouseDelta: () => ({ x: 0, y: 0 }), getState: () => state } as unknown as InputManager;
  const config = { get: () => ({ sensitivity: .002 }) } as ClientConfig;
  const controller = role === "hunter"
    ? new HunterController(new THREE.PerspectiveCamera(), input, config)
    : new PropController(new THREE.PerspectiveCamera(), input, config);
  controller.setMovementBounds(-72, 80, -60, 64);
  controller.setWaterVolumes(mapJson.waterHazards);
  controller.setPosition(x, y, z);
  return { controller, state };
}
const feet = (controller: HunterController | PropController) => controller instanceof HunterController ? controller.getFeetY() : controller.getPosition().y;

describe("actual animated Harbor boat decks", () => {
  it.each(["high", "low"] as const)("%s derives solid decks for every shipped vessel without filling the sea around them", async (quality) => {
    const { root, asset, boats, water } = await actualFleet(quality);
    const fleet = boats.getBoats();
    expect(fleet).toHaveLength(5);
    // Reproduction: exported static movement boxes omit every vessel, even
    // though a downward render ray hits their actual timber/roof surfaces.
    for (const [x, z] of [[7, 50], [-8, 49.4], [-15, 48.6], [18, 48.7], [3, 57.5]]) {
      expect(asset.colliders.some((box) => x > box.min.x && x < box.max.x && z > box.min.z && z < box.max.z)).toBe(false);
    }
    const ray = new THREE.Raycaster();
    for (const boat of fleet) {
      expect(boat.boxes.length, boat.name).toBeGreaterThan(0);
      for (const box of boat.boxes) {
        const center = box.getCenter(new THREE.Vector3());
        ray.set(new THREE.Vector3(center.x, box.max.y + .06, center.z), new THREE.Vector3(0, -1, 0));
        ray.far = .09;
        expect(ray.intersectObject(root, true).some((hit) => Math.abs(hit.point.y - box.max.y) < .025), `${boat.name} phantom support at ${center.toArray().join(",")}`).toBe(true);
      }
    }
    for (const [x, z] of [[7, 53], [-8, 53], [24, 50], [3, 62]]) {
      expect(boats.colliders.some((box) => x > box.min.x && x < box.max.x && z > box.min.z && z < box.max.z)).toBe(false);
    }
    expect(boats.hullInteriors).toHaveLength(quality === "high" ? 2 : 0);
    if (quality === "high") for (const deck of HARBOR_LOW_BOAT_DECKS) {
      const measured = fleet.find((boat) => boat.name === deck.rig)?.boxes.find((box) => Math.abs(box.max.y - deck.restY) < .001);
      expect(measured, `server contract missing real ${deck.rig} floor`).toBeDefined();
      if (!measured) throw new Error(`Missing ${deck.rig} floor`);
      expect(measured.min.x).toBeCloseTo(deck.minX, 3);
      expect(measured.max.x).toBeCloseTo(deck.maxX, 3);
      expect(measured.min.z).toBeCloseTo(deck.minZ, 3);
      expect(measured.max.z).toBeCloseTo(deck.maxZ, 3);
    }
    water.dispose();
  });

  it.each(["high", "low"] as const)("%s Hunter and Prop land on all five boats and stay dry through the real wave cycle", async (quality) => {
    const { boats, motion, water } = await actualFleet(quality);
    const positions = [[7, 50], [-8, 49.4], [-15.5, 48.6], [17.5, 48.7], [3, 57.5], [-15.5, 49.19], [17.5, 49.29]];
    const actors = positions.flatMap(([x, z]) => [actor("hunter", x, 5, z), actor("prop", x, 5, z)]);
    for (const { controller } of actors) controller.setBoatSupports(boats.colliders);
    const delta = new THREE.Vector3();
    let lowestSupportedFeet = Infinity;
    for (let frame = 0; frame < 1500; frame++) {
      water.update(1 / 60); motion.update(1 / 60, water); boats.update();
      for (const { controller } of actors) {
        const pos = controller.getPosition();
        if (boats.carryDelta(pos.x, feet(controller), pos.z, delta)) controller.translatePosition(delta.x, delta.y, delta.z);
        controller.update(1 / 60, boats.colliders);
        if (frame > 120) {
          lowestSupportedFeet = Math.min(lowestSupportedFeet, feet(controller));
          expect(feet(controller), `fell through a boat at ${controller.getPosition().toArray().join(",")}`).toBeGreaterThan(-1.3);
          expect(controller.isInWater(), `dry deck incorrectly submerged at frame ${frame}: ${controller.getPosition().toArray().join(",")}`).toBe(false);
          expect(findWaterHazard(mapJson as unknown as MapData, pos.x, feet(controller), pos.z), `server falsely drowns ${quality} rider at frame ${frame}`).toBeNull();
        }
      }
    }
    if (quality === "high") expect(lowestSupportedFeet).toBeLessThan(-.9);
    water.dispose();
  });

  it.each(["hunter", "prop"] as const)("%s jumps from the seawall onto a workboat, then dies after jumping back into the sea", async (role) => {
    const { boats, motion, water } = await actualFleet("high");
    const { controller, state } = actor(role, 7.7, .9, 46.8);
    controller.setBoatSupports(boats.colliders);
    const seawall = new THREE.Box3(new THREE.Vector3(-55, 0, 46.55), new THREE.Vector3(63, .9, 47.45));
    const colliders = [seawall, ...boats.colliders];
    const delta = new THREE.Vector3(), drowning = new DrowningTracker();
    let landed = false, entered = false, died = false;
    for (let frame = 0; frame < 850; frame++) {
      water.update(1 / 60); motion.update(1 / 60, water); boats.update();
      let pos = controller.getPosition();
      if (boats.carryDelta(pos.x, feet(controller), pos.z, delta)) controller.translatePosition(delta.x, delta.y, delta.z);
      state.backward = (frame < 80 && pos.z < 49.8) || frame >= 240;
      state.jump = frame === 0 || frame >= 240;
      controller.update(1 / 60, colliders);
      pos = controller.getPosition();
      const status = drowning.update(role, findWaterHazard(mapJson as unknown as MapData, pos.x, feet(controller), pos.z) !== null, frame * 1000 / 60);
      if (frame === 220) {
        expect(pos.z).toBeGreaterThan(48.45);
        expect(pos.z).toBeLessThan(51.35);
        expect(controller.isInWater()).toBe(false);
        expect(boats.carryDelta(pos.x, feet(controller), pos.z, delta)).toBe(true);
        landed = true;
      }
      if (status === "entered") entered = true;
      if (status === "drowned") { died = true; break; }
    }
    expect(landed).toBe(true); expect(entered, `final ${controller.getPosition().toArray().join(",")}, feet ${feet(controller)}`).toBe(true); expect(died).toBe(true);
    water.dispose();
  });
});
