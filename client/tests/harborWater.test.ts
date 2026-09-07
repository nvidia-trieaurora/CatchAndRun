import { describe, expect, it, vi } from "vitest";
import {
  createHarborWater,
  HARBOR_WATER_Y,
} from "../src/game/world/environment/harborWater";
import { resolveWeaponImpactKind } from "../src/game/world/weaponImpactSurfaces";

describe("Harbor animated water", () => {
  it("animates on desktop tiers and is tagged for splash impacts", () => {
    const water = createHarborWater("high");
    const startHeight = water.sampleHeight(12, 18) as number;

    water.update(0.5);

    expect(water.root.position.y).toBe(HARBOR_WATER_Y);
    expect(water.sampleHeight(12, 18)).not.toBe(startHeight);
    expect(water.kind).toBe("gerstner");
    expect(resolveWeaponImpactKind(water.root)).toBe("water");
    expect(water.root.material.transmission).toBeGreaterThan(0);
    expect(water.root.getObjectByName("harbor-shoreline-caustics")).toBeDefined();
    water.dispose();
  });

  it("uses reduced low-tier geometry and disposes GPU resources", () => {
    const water = createHarborWater("low");
    const highWater = createHarborWater("high");
    const geometryDispose = vi.spyOn(water.root.geometry, "dispose");
    const materialDispose = vi.spyOn(water.root.material, "dispose");

    water.update(1);
    water.dispose();

    expect(water.root.geometry.attributes.position.count).toBeLessThan(
      highWater.root.geometry.attributes.position.count,
    );
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(water.root.getObjectByName("harbor-shoreline-caustics")).toBeUndefined();
    highWater.dispose();
  });

  it("injects a localized impact ripple into rendered and sampled height", () => {
    const water = createHarborWater("medium");
    const sampleX = 13;
    const sampleZ = 18;
    const before = water.sampleHeight(sampleX + 1, sampleZ) as number;

    water.addRipple?.(sampleX, sampleZ, 1.4);
    const after = water.sampleHeight(sampleX + 1, sampleZ) as number;

    expect(after).not.toBe(before);
    water.update(2);
    const expired = water.sampleHeight(sampleX + 1, sampleZ) as number;
    expect(Number.isFinite(expired)).toBe(true);
    water.dispose();
  });

  it("keeps visibly rolling directional waves on the low tier", () => {
    const water = createHarborWater("low");
    const heights = [
      water.sampleHeight(-40, 50),
      water.sampleHeight(-10, 50),
      water.sampleHeight(20, 50),
      water.sampleHeight(50, 50),
    ] as number[];

    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.12);
    water.dispose();
  });
});
