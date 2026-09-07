import { describe, expect, it } from "vitest";
import { getWaterWarningLevel } from "../src/game/systems/WaterProximityWarning";

describe("Harbor water proximity warning", () => {
  it("stays safe in the island interior", () => {
    expect(getWaterWarningLevel("harbor-warehouse", { x: 0, z: 0 }))
      .toBe("safe");
  });

  it("warns before the player reaches the seawall", () => {
    expect(getWaterWarningLevel("harbor-warehouse", { x: 0, z: 44.5 }))
      .toBe("warning");
  });

  it("becomes critical at and beyond the water edge", () => {
    expect(getWaterWarningLevel("harbor-warehouse", { x: 0, z: 46.2 }))
      .toBe("critical");
    expect(getWaterWarningLevel("harbor-warehouse", { x: 0, z: 49 }))
      .toBe("critical");
  });

  it("does not show Harbor warnings on other maps", () => {
    expect(getWaterWarningLevel("school", { x: 47, z: 39 })).toBe("safe");
  });
});
