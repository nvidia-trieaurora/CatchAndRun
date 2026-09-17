import { describe, expect, it, vi } from "vitest";
import { Matrix4, Mesh, PerspectiveCamera, Scene } from "three";
import { Lighting, type MeshBasicNodeMaterial } from "three/webgpu";
import RenderList from "three/src/renderers/common/RenderList.js";
import {
  createHarborWater,
  HARBOR_WATER_Y,
} from "../src/game/world/environment/harborWater";
import { resolveWeaponImpactKind } from "../src/game/world/weaponImpactSurfaces";

describe("Harbor animated water", () => {
  it.each([
    ["high", 8], ["medium", 6], ["low", 3],
  ] as const)("concentrates %s water geometry at the actual seawalls without separate tiled seams", (tier, minimumSamples) => {
    const water = createHarborWater(tier);
    const position = water.root.geometry.getAttribute("position");
    const xs = new Set<number>();
    const zs = new Set<number>();
    for (let i = 0; i < position.count; i++) {
      xs.add(position.getX(i) + water.root.position.x);
      zs.add(position.getZ(i) + water.root.position.z);
    }
    for (const edge of [-55.4, 63.4]) {
      expect([...xs].filter((x) => Math.abs(x - edge) <= 2).length).toBeGreaterThanOrEqual(minimumSamples);
    }
    for (const edge of [-43.4, 47.5]) {
      expect([...zs].filter((z) => Math.abs(z - edge) <= 2).length).toBeGreaterThanOrEqual(minimumSamples);
    }
    const expectedSegments = tier === "high" ? 96 : tier === "medium" ? 64 : 32;
    expect(position.count).toBe((expectedSegments + 1) ** 2);
    expect(water.root.geometry.index?.count).toBe(expectedSegments ** 2 * 6);
    expect(water.root.geometry.groups).toHaveLength(0);
    // No duplicate tile boundaries or reversed faces after redistributing rows.
    const orderedXs = [...xs];
    const orderedZs = [...zs];
    expect(orderedXs).toEqual([...orderedXs].sort((a, b) => a - b));
    expect(orderedZs).toEqual([...orderedZs].sort((a, b) => a - b));
    water.dispose();
  });
  it.each(["high", "medium", "low"] as const)("extends the %s ocean beyond the overview horizon without a visible card edge", (tier) => {
    const water = createHarborWater(tier);
    const positions = water.root.geometry.getAttribute("position");
    let minimumX = Infinity, maximumX = -Infinity, minimumZ = Infinity, maximumZ = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      minimumX = Math.min(minimumX, positions.getX(i));
      maximumX = Math.max(maximumX, positions.getX(i));
      minimumZ = Math.min(minimumZ, positions.getZ(i));
      maximumZ = Math.max(maximumZ, positions.getZ(i));
    }
    expect(minimumX).toBeLessThanOrEqual(-900);
    expect(maximumX).toBeGreaterThanOrEqual(900);
    expect(minimumZ).toBeLessThanOrEqual(-800);
    expect(maximumZ).toBeGreaterThanOrEqual(800);
    water.dispose();
  });
  it("animates on desktop tiers and is tagged for splash impacts", () => {
    const water = createHarborWater("high");
    const startHeight = water.sampleHeight(12, 18) as number;

    water.update(0.5);

    expect(water.root.position.y).toBe(HARBOR_WATER_Y);
    expect(water.sampleHeight(12, 18)).not.toBe(startHeight);
    expect(water.kind).toBe("gerstner");
    expect(resolveWeaponImpactKind(water.root)).toBe("water");
    expect(water.root.getObjectByName("harbor-shoreline-wash")).toBeDefined();
    water.dispose();
  });

  it.each([
    ["high", [-1.0245459969095212, -0.8257995181787151, -0.7608671093338631]],
    ["medium", [-1.0218070642732768, -0.8648997808554069, -0.7903445575961082]],
    ["low", [-1.003020901515569, -0.8588245313193607, -0.7306995621505054]],
  ] as const)("preserves RP03 %s water-height contracts during the foam-only upgrade", (tier, expected) => {
    // Fixed pre-upgrade Gerstner samples at world (13,52), t=0/0.7/3.4s.
    // Comparing two instances of the same new implementation would miss an
    // accidental change to shared wave amplitude, phase, or sea level.
    const water = createHarborWater(tier);
    expect(water.sampleHeight(13, 52)).toBeCloseTo(expected[0], 10);
    water.update(0.7);
    expect(water.sampleHeight(13, 52)).toBeCloseTo(expected[1], 10);
    water.update(2.7);
    expect(water.sampleHeight(13, 52)).toBeCloseTo(expected[2], 10);
    water.dispose();
  });

  it.each(["high", "medium", "low"] as const)("keeps the %s ocean out of the transmission double pass", (tier) => {
    const water = createHarborWater(tier);
    // Exercise Three's real render classification: even transmission=0.008
    // used to make the high-tier, double-sided ocean a two-pass object.
    const list = new RenderList(new Lighting(), new Scene(), new PerspectiveCamera());
    list.push(water.root, water.root.geometry, water.root.material, 0, 0, null, null);
    const wash = water.root.getObjectByName("harbor-shoreline-wash") as Mesh;
    if (Array.isArray(wash.material)) throw new Error("Shore wash must remain one material/draw");
    list.push(wash, wash.geometry, wash.material, 0, 0, null, null);

    expect(list.opaque).toHaveLength(1);
    expect(list.transparent).toHaveLength(1);
    expect(list.transparentDoublePass).toHaveLength(0);
    expect(water.root.material.transmission).toBe(0);
    water.dispose();
  });

  it.each(["high", "medium", "low"] as const)("puts %s wall wash outside the real seawall in one bounded draw", (tier) => {
    const water = createHarborWater(tier);
    const wash = water.root.getObjectByName("harbor-shoreline-wash") as Mesh;
    const material = wash.material as MeshBasicNodeMaterial;
    const positions = wash.geometry.getAttribute("position");
    expect(water.root.children).toHaveLength(1);
    expect(positions.count).toBe(16);
    expect(wash.geometry.index?.count).toBe(24);
    expect(material.forceSinglePass).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(wash.userData.ignoreWeaponRaycast).toBe(true);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) + water.root.position.x;
      const y = positions.getY(i) + water.root.position.y;
      const z = positions.getZ(i) + water.root.position.z;
      expect(x < -55.4 || x > 63.4 || z < -43.4 || z > 47.5).toBe(true);
      expect(y).toBeGreaterThanOrEqual(-1.651);
      expect(y).toBeLessThanOrEqual(0.051);
    }
    const geometryDispose = vi.spyOn(wash.geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    water.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("samples the same smooth ripple envelope used by the rendered surface", () => {
    const calm = createHarborWater("medium");
    const disturbed = createHarborWater("medium");
    disturbed.addRipple?.(13, 18, 1.4);
    calm.update(0.4);
    disturbed.update(0.4);
    const smoothstep = (x: number) => x * x * (3 - 2 * x);
    const radius = 1;
    const expected = Math.sin(radius * 4.6 - 0.4 * 9.5)
      * (1 - smoothstep(0.4 / 1.6))
      * (1 - smoothstep((radius - 0.2) / 6.8)) * 1.4 * 0.18;

    expect((disturbed.sampleHeight(14, 18) as number) - (calm.sampleHeight(14, 18) as number))
      .toBeCloseTo(expected, 10);
    calm.dispose();
    disturbed.dispose();
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
    const calm = createHarborWater("medium");
    const sampleX = 13;
    const sampleZ = 18;
    const before = water.sampleHeight(sampleX + 1, sampleZ) as number;

    water.addRipple?.(sampleX, sampleZ, 1.4);
    const after = water.sampleHeight(sampleX + 1, sampleZ) as number;

    expect(after).not.toBe(before);
    expect(water.sampleHeight(sampleX + 8, sampleZ)).toBe(calm.sampleHeight(sampleX + 8, sampleZ));
    water.update(2);
    calm.update(2);
    expect(water.sampleHeight(sampleX + 1, sampleZ)).toBe(calm.sampleHeight(sampleX + 1, sampleZ));
    water.dispose();
    calm.dispose();
  });

  it("keeps water geometry and shader stable during sustained gun impacts", () => {
    const water = createHarborWater("high");
    const geometry = water.root.geometry;
    const material = water.root.material;
    const shaderVersion = material.version;
    const childCount = water.root.children.length;

    for (let shot = 0; shot < 200; shot++) {
      water.addRipple?.(13 + shot % 8, 52, 1.4);
      water.update(1 / 60);
      expect(Number.isFinite(water.sampleHeight(15, 52))).toBe(true);
    }

    expect(water.root.geometry).toBe(geometry);
    expect(water.root.material).toBe(material);
    expect(material.version).toBe(shaderVersion);
    expect(water.root.children).toHaveLength(childCount);
    water.dispose();
  });

  it("updates real hull-pose masks without new draws, shader rebuilds or changing water physics", () => {
    const water = createHarborWater("high");
    const control = createHarborWater("high");
    const worldToLocal = new Matrix4().makeTranslation(15, 0.8, -48.6);
    const hull = { worldToLocal, minX: -1.5, maxX: 1.6, minZ: -0.45, maxZ: 0.45, floorY: 0.08 };
    const material = water.root.material;
    const version = material.version;
    const geometry = water.root.geometry;
    water.setHullInteriors([hull]);

    for (let frame = 0; frame < 120; frame++) {
      worldToLocal.makeRotationZ(Math.sin(frame * 0.1) * 0.02);
      worldToLocal.setPosition(15, 0.8 + Math.sin(frame * 0.1) * 0.15, -48.6);
      water.update(1 / 60);
      control.update(1 / 60);
      expect(water.sampleHeight(-15, 48.6)).toBe(control.sampleHeight(-15, 48.6));
    }

    water.setHullInteriors([]);
    expect(material.maskNode).toBeDefined();
    expect(material.version).toBe(version);
    expect(water.root.geometry).toBe(geometry);
    expect(water.root.children).toHaveLength(1);
    water.dispose();
    control.dispose();
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
