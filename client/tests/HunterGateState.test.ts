import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { setHunterGateOpen } from "../src/game/world/HunterGateState";

describe("Hunter spawn gate state", () => {
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
