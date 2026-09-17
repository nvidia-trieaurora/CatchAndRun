import { describe, expect, it, vi } from "vitest";

// Evaluate the actual TSL expression with scalar arithmetic. This is not a
// second CPU foam formula: only the small set of TSL scalar operators is
// substituted, so a disconnected oscillator or reversed crest fails here.
vi.mock("three/tsl", () => {
  interface Scalar {
    value: number;
    add(other: number | Scalar): Scalar;
    sub(other: number | Scalar): Scalar;
    mul(other: number | Scalar): Scalar;
    clamp(low: number, high: number): Scalar;
  }
  const value = (input: number | Scalar) => typeof input === "number" ? input : input.value;
  const scalar = (input: number | Scalar): Scalar => {
    const n = value(input);
    return {
      value: n,
      add: (other) => scalar(n + value(other)),
      sub: (other) => scalar(n - value(other)),
      mul: (other) => scalar(n * value(other)),
      clamp: (low, high) => scalar(Math.max(low, Math.min(high, n))),
    };
  };
  return {
    float: scalar,
    abs: (input: number | Scalar) => scalar(Math.abs(value(input))),
    max: (a: number | Scalar, b: number | Scalar) => scalar(Math.max(value(a), value(b))),
    mix: (a: number | Scalar, b: number | Scalar, t: number | Scalar) =>
      scalar(value(a) + (value(b) - value(a)) * value(t)),
    smoothstep: (a: number | Scalar, b: number | Scalar, input: number | Scalar) => {
      const t = Math.max(0, Math.min(1, (value(input) - value(a)) / (value(b) - value(a))));
      return scalar(t * t * (3 - 2 * t));
    },
  };
});

import { float } from "three/tsl";
import { createHarborShoreFoam } from "../src/game/world/environment/harborShoreFoam";

const read = (node: unknown) => (node as { value: number }).value;
const sample = (shoreDistance: number, normalizedHeight: number, patch = 1) => {
  const result = createHarborShoreFoam(float(shoreDistance), float(normalizedHeight), float(patch));
  return {
    foam: read(result.surfaceFoam),
    wash: read(result.washStrength),
  };
};

describe("Wave-linked harbor shore foam", () => {
  it("breaks at the known Gerstner crest, not at the trough", () => {
    const crest = sample(0.35, 1);
    const trough = sample(0.35, -1);
    expect(crest.foam).toBeGreaterThan(0.35);
    expect(trough.foam).toBe(0);
    expect(crest.wash).toBeGreaterThan(trough.wash * 2);
    // Negative control: reversing the two wave heights must fail the visual
    // contract. A time-only foam oscillator yields equal values and fails too.
    const crestContract = (high: number, low: number) => high > 0.35 && low === 0;
    expect(crestContract(crest.foam, trough.foam)).toBe(true);
    expect(crestContract(trough.foam, crest.foam)).toBe(false);
    expect(crestContract(crest.foam, crest.foam)).toBe(false);
  });

  it("keeps the thin residual waterline while the wash recedes", () => {
    expect(sample(0, -1).foam).toBeGreaterThan(0);
    expect(sample(0, -1).foam).toBeLessThan(0.15);
    expect(sample(0.4, -1).foam).toBe(0);
    expect(sample(0, 1).foam).toBeGreaterThan(sample(0, -1).foam * 4);
  });

  it("confines foam to the wet side of the quay and a narrow crest band", () => {
    for (const height of [-1, -0.5, 0, 0.5, 1]) {
      expect(sample(-0.1, height).foam).toBe(0);
      expect(sample(1.4, height).foam).toBe(0);
      expect(sample(25, height).foam).toBe(0);
      expect(sample(0.4, height).foam).toBeGreaterThanOrEqual(0);
      expect(sample(0, height).foam).toBeLessThanOrEqual(0.7);
    }
  });

  it("uses the same broken patches on the surface and wall wash", () => {
    const bright = sample(0.2, 1, 1);
    const gap = sample(0.2, 1, 0);
    expect(gap.foam / bright.foam).toBeCloseTo(0.25, 10);
    expect(gap.wash / bright.wash).toBeCloseTo(0.25, 10);
    expect(sample(0.2, 1, -4)).toEqual(gap);
    expect(sample(0.2, 1, 4)).toEqual(bright);
  });
});
