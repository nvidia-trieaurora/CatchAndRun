import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildFerrisWheel } from "../src/game/world/maps/oldHarborFortnite";

describe("Harbor V2 map lifecycle", () => {
  it("keeps Ferris-wheel cabin colliders separate from appended GLB colliders", () => {
    const colliders: THREE.Box3[] = [];
    const { cabinColliders } = buildFerrisWheel(new THREE.Scene(), colliders);
    const warehouseCollider = new THREE.Box3(
      new THREE.Vector3(-1, 0, -1),
      new THREE.Vector3(1, 1, 1),
    );
    colliders.push(warehouseCollider);

    expect(cabinColliders).toHaveLength(40);
    expect(cabinColliders).not.toContain(warehouseCollider);
    expect(colliders.at(-1)).toBe(warehouseCollider);
    for (const collider of cabinColliders) {
      expect(colliders).toContain(collider);
    }
  });
});
