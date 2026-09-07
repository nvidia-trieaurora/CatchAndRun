import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { sampleDrowningCinematic } from "../src/game/cinematics/DrowningCinematic";

describe("Drowning camera cinematic", () => {
  it("pulls the camera away with a raised midpoint arc", () => {
    const start = new THREE.Vector3(0, 1, 48);
    const end = new THREE.Vector3(0, 6, 56);
    const frame = sampleDrowningCinematic({
      elapsed: 1.2,
      duration: 2.4,
      start,
      end,
      target: new THREE.Vector3(0, -0.5, 48),
    });

    expect(frame.completed).toBe(false);
    expect(frame.position.z).toBeGreaterThan(start.z);
    expect(frame.position.y).toBeGreaterThan(4);
    expect(frame.target.y).toBeCloseTo(-0.25);
  });

  it("finishes exactly at the server-provided camera position", () => {
    const end = new THREE.Vector3(8, 6, 55);
    const frame = sampleDrowningCinematic({
      elapsed: 3,
      duration: 2.4,
      start: new THREE.Vector3(0, 1, 48),
      end,
      target: new THREE.Vector3(0, -0.5, 48),
    });

    expect(frame.completed).toBe(true);
    expect(frame.position.toArray()).toEqual(end.toArray());
  });
});
