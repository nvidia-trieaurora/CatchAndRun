import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { HarborAmbientMotion } from "../src/game/world/environment/HarborAmbientMotion";
import type { HarborWaterSurface } from "../src/game/world/environment/harborWater";

describe("Harbor boat ambient motion", () => {
  it("groups authored boat parts and never wakes a moored fleet", () => {
    const root = new THREE.Group();
    const hull = new THREE.Object3D();
    hull.userData.ambientMotion = "boat-workboat";
    hull.position.set(10, 0, 20);
    const cabin = new THREE.Object3D();
    cabin.userData.ambientMotion = "boat-workboat";
    cabin.position.set(10, 1, 20);
    const skiff = new THREE.Object3D();
    skiff.userData.ambientMotion = "boat-skiff";
    skiff.position.set(-10, 0, 20);
    root.add(hull, cabin, skiff);
    root.updateMatrixWorld(true);
    const addRipple = vi.fn();
    const water = { addRipple } as unknown as HarborWaterSurface;
    const motion = new HarborAmbientMotion(root, true);

    motion.update(3, water);
    root.updateMatrixWorld(true);

    expect(motion.getGroupCount()).toBe(2);
    expect(hull.position.y).not.toBe(0);
    expect(cabin.position.y).not.toBe(1);
    // wakes need velocity; nothing in the harbor is under way
    expect(addRipple).not.toHaveBeenCalled();
  });

  it("does not create automatic wakes on lower quality tiers", () => {
    const root = new THREE.Group();
    const boat = new THREE.Object3D();
    boat.userData.ambientMotion = "boat-workboat";
    root.add(boat);
    const addRipple = vi.fn();
    const motion = new HarborAmbientMotion(root, false);

    motion.update(3, { addRipple } as unknown as HarborWaterSurface);

    expect(addRipple).not.toHaveBeenCalled();
  });

  it("rides the sampled water: heave from the surface, pitch and roll from its slope, damped when moored", () => {
    const zone = new THREE.Group();
    const workboat = new THREE.Object3D();
    workboat.userData.ambientMotion = "boat-workboat";
    workboat.userData.boatMoored = false;
    workboat.userData.boatLength = 10;
    workboat.position.set(7, -0.8, 49.9);
    const skiff = new THREE.Object3D();
    skiff.userData.ambientMotion = "boat-skiff_red";
    skiff.userData.boatMoored = true;
    skiff.userData.boatLength = 4.2;
    skiff.position.set(-15, -0.8, 48.6);
    const buoy = new THREE.Object3D();
    buoy.userData.ambientMotion = "buoy-0";
    buoy.position.set(-6, -0.8, 52.5);
    zone.add(workboat, skiff, buoy);
    zone.updateMatrixWorld(true);
    // a tilted water sheet: +0.3 m at the boats, rising 0.1 m per metre along +x
    const water = {
      sampleHeight: (x: number) => -0.8 + 0.3 + 0.1 * (x - 7),
      addRipple: vi.fn(),
    } as unknown as HarborWaterSurface;
    const motion = new HarborAmbientMotion([zone], true);

    motion.update(1 / 60, water);

    expect(motion.getGroupKeys()).toEqual(["boat-workboat", "boat-skiff_red", "buoy-0"]);
    // free-floating: full heave (0.3 m +- the small seeded wobble) and a real pitch
    expect(workboat.position.y).toBeGreaterThan(-0.8 + 0.25);
    expect(workboat.position.y).toBeLessThan(-0.8 + 0.35);
    const pitch = new THREE.Euler().setFromQuaternion(workboat.quaternion, "XYZ");
    expect(Math.abs(pitch.z)).toBeCloseTo(Math.atan(0.1), 2);
    expect(Math.abs(pitch.x)).toBeLessThan(1e-6);
    // moored skiff sits on the same sheet but with damped motion
    const skiffHeave = skiff.position.y + 0.8;
    const skiffSample = 0.3 + 0.1 * (-15 - 7);
    expect(Math.abs(skiffHeave)).toBeLessThan(Math.abs(skiffSample) * 0.55);
    expect(Math.abs(skiffHeave)).toBeGreaterThan(Math.abs(skiffSample) * 0.35);
    // buoys only heave
    expect(buoy.quaternion.equals(new THREE.Quaternion())).toBe(true);
    expect(buoy.position.y).not.toBe(-0.8);
  });
});
