import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { setHunterGateOpen, updateHunterGateVisual } from "../src/game/world/HunterGateState";

describe("Hunter spawn gate state", () => {
  it("retracts exposed lettering rigidly, caps hidden vertices inside the headbox, and restores next round", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      0, -4, 0, 0, -3.5, 0, 0, -.1, 0,
    ], 3));
    const mesh = new THREE.Mesh(geometry);
    mesh.position.set(-35, 5, 0);
    mesh.userData = { gateMotion: "roller", gateTravelMode: "retract", gateTravel: 5.06, gateRetractLocalY: .025, gateTopY: 5 };
    const original = Array.from(geometry.attributes.position.array);
    setHunterGateOpen([], null, mesh, true);
    updateHunterGateVisual(mesh, .045);
    const position = geometry.attributes.position;
    expect(mesh.scale.y).toBe(1);
    expect(position.getY(1) - position.getY(0)).toBeCloseTo(.5, 5);
    expect(position.getY(0)).toBeGreaterThan(-4);
    expect(position.getY(2)).toBeCloseTo(.025, 5);
    updateHunterGateVisual(mesh, .405);
    expect(mesh.visible).toBe(false);
    setHunterGateOpen([], null, mesh, false);
    expect(Array.from(geometry.attributes.position.array)).toEqual(original);
    updateHunterGateVisual(mesh, .1);
    expect(Array.from(geometry.attributes.position.array)).toEqual(original);
  });
  it("rolls the authored shutter into its top header and restores it next round", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.25, 5, 14).translate(0, -2.5, 0));
    mesh.position.set(-35, 5, 0);
    mesh.userData = { gateMotion: "roller", gateTopY: 5 };
    const gate = new THREE.Box3().setFromObject(mesh);
    const colliders = [gate];
    setHunterGateOpen(colliders, gate, mesh, true);
    updateHunterGateVisual(mesh, .225);
    const midway = new THREE.Box3().setFromObject(mesh);
    expect(midway.min.y).toBeGreaterThan(4);
    expect(midway.max.y).toBeLessThanOrEqual(5.2);
    expect(colliders).toHaveLength(0);
    updateHunterGateVisual(mesh, .225);
    expect(mesh.visible).toBe(false);
    setHunterGateOpen(colliders, gate, mesh, false);
    expect(mesh.visible).toBe(true);
    expect(mesh.scale.y).toBe(1);
    expect(new THREE.Box3().setFromObject(mesh).equals(gate)).toBe(true);
    expect(colliders).toEqual([gate]);
  });
  it("opens on ACTIVE and closes again for the next HIDING phase", () => {
    const gate = new THREE.Box3(
      new THREE.Vector3(-35.2, 0, -7),
      new THREE.Vector3(-34.8, 5, 7),
    );
    const wall = new THREE.Box3(
      new THREE.Vector3(-49.2, 0, -7),
      new THREE.Vector3(-48.8, 5, 7),
    );
    const mesh = new THREE.Mesh();
    const colliders = [wall, gate];

    const activeGate = setHunterGateOpen(colliders, gate, mesh, true);
    expect(activeGate).toBeNull();
    expect(colliders).toEqual([wall]);
    expect(mesh.visible).toBe(false);

    const hidingGate = setHunterGateOpen(
      colliders,
      gate,
      mesh,
      false,
    );
    expect(hidingGate).toBe(gate);
    expect(colliders).toContain(gate);
    expect(mesh.visible).toBe(true);

    setHunterGateOpen(colliders, gate, mesh, false);
    expect(colliders.filter((collider) => collider === gate)).toHaveLength(1);
  });
});
