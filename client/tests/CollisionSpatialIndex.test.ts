import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CollisionSpatialIndex, collectNearbyColliders } from "../src/game/world/collisionBroadphase";

function box(x: number, z: number, width = 1): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(x, 0, z), new THREE.Vector3(x + width, 3, z + width));
}

describe("map collision spatial index", () => {
  it("matches a full scan across cell edges and negative coordinates, in source order", () => {
    const colliders: THREE.Box3[] = [box(-500, -500, 1000)];
    for (let i = 0; i < 1500; i++) colliders.push(box((i * 13.7) % 240 - 120, (i * 7.3) % 150 - 75, 0.2 + i % 15));
    const index = new CollisionSpatialIndex();
    index.rebuild(colliders);
    for (let i = 0; i < 120; i++) {
      const position = new THREE.Vector3((i * 19) % 240 - 120, 0, (i * 23) % 150 - 75);
      expect(index.collectNearby(position, i % 24)).toEqual(collectNearbyColliders(colliders, position, i % 24));
    }
  });

  it("uses live cabin/decoy bounds even when they move between grid cells", () => {
    const cabin = box(-80, -80);
    const wall = box(3, 3);
    const index = new CollisionSpatialIndex();
    index.rebuild([cabin, wall], [cabin]);
    const origin = new THREE.Vector3();
    expect(index.collectNearby(origin, 5)).toEqual([wall]);
    cabin.translate(new THREE.Vector3(80, 0, 80));
    expect(index.collectNearby(origin, 5)).toEqual([cabin, wall]);
    cabin.makeEmpty();
    expect(index.collectNearby(origin, 5)).toEqual([wall]);
  });

  it("drops opened gates and removed decoys on rebuild, without stale output entries", () => {
    const gate = box(1, 1);
    const wall = box(3, 3);
    const source = [gate, wall];
    const index = new CollisionSpatialIndex();
    const output: THREE.Box3[] = [];
    index.rebuild(source);
    expect(index.collectNearby(new THREE.Vector3(), 5, output)).toBe(output);
    expect(output).toEqual([gate, wall]);
    source.splice(0, 1);
    index.rebuild(source);
    index.collectNearby(new THREE.Vector3(), 5, output);
    expect(output).toEqual([wall]);
    index.rebuild([]);
    expect(index.collectNearby(new THREE.Vector3(), 5, output)).toEqual([]);
  });

  it("does not scan distant districts for a local movement query", () => {
    const colliders: THREE.Box3[] = [];
    for (let x = -50; x < 50; x++) for (let z = -30; z < 30; z++) colliders.push(box(x * 3, z * 3));
    const index = new CollisionSpatialIndex();
    index.rebuild(colliders);
    const position = new THREE.Vector3(0, 2, 0);
    expect(index.collectNearby(position, 16)).toEqual(collectNearbyColliders(colliders, position, 16));
    expect(index.lastCandidateCount).toBeLessThan(colliders.length / 10);
  });

  it("supports world-wide debug queries without duplicating oversized floors", () => {
    const floor = box(-500, -500, 1000);
    const colliders = [floor, box(10, 10), box(-10, -10)];
    const index = new CollisionSpatialIndex();
    index.rebuild(colliders);
    expect(index.collectNearby(new THREE.Vector3(), 100000)).toEqual(colliders);
    expect(index.lastCandidateCount).toBe(3);
  });
});
