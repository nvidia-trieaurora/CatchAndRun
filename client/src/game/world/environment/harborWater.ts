import * as THREE from "three";
import {
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
} from "three/webgpu";
import {
  abs,
  bool,
  cameraPosition,
  color,
  cos,
  distance,
  float,
  Fn,
  fwidth,
  If,
  max,
  min,
  mix,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { QualityTier } from "../../../config/QualityManager";
import { tagWeaponImpactSurface } from "../weaponImpactSurfaces";
import type { OceanBackend } from "./OceanBackend";
import { createHarborShoreFoam } from "./harborShoreFoam";
import {
  createCoastalWaterGeometry,
  createShoreWashGeometry,
  HARBOR_OCEAN_ORIGIN,
  HARBOR_SHORELINE,
} from "./harborShoreline";

export const HARBOR_WATER_Y = -0.8;
const RIPPLE_LIFETIME = 1.6;
const RIPPLE_RADIUS = 7;
const RIPPLE_INNER_RADIUS = 0.2;

export interface HarborWaterSurface extends OceanBackend {
  readonly kind: "gerstner";
  root: THREE.Mesh<THREE.PlaneGeometry, MeshPhysicalNodeMaterial>;
  setHullInteriors(interiors: readonly HarborHullInterior[]): void;
  update(dt: number): void;
  dispose(): void;
}

/** Stable references supplied by the boat rig after updating its real pose. */
export interface HarborHullInterior {
  worldToLocal: THREE.Matrix4;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floorY: number;
}

interface GerstnerWave {
  dirX: number;
  dirZ: number;
  wavelength: number;
  amplitude: number;
  speed: number;
  steepness: number;
}

const GERSTNER_WAVES: GerstnerWave[] = [
  { dirX: 0.981, dirZ: 0.196, wavelength: 32, amplitude: 0.32, speed: 1.1, steepness: 0.55 },
  { dirX: 0.287, dirZ: 0.958, wavelength: 18, amplitude: 0.18, speed: 0.82, steepness: 0.45 },
  { dirX: -0.848, dirZ: 0.53, wavelength: 9, amplitude: 0.1, speed: 0.64, steepness: 0.34 },
  { dirX: 0.707, dirZ: 0.707, wavelength: 5, amplitude: 0.055, speed: 0.48, steepness: 0.24 },
];

export function createHarborWater(
  quality: QualityTier,
): HarborWaterSurface {
  const geometry = createCoastalWaterGeometry(quality);

  let elapsed = 0;
  const timeNode = uniform(0);
  // The two open skiffs have actual inset floors. Clip only their interiors,
  // never a broad boat bounding box that would erase water outside the hull.
  const hullSlots = Array.from({ length: 2 }, () => ({
    active: uniform(0),
    worldToLocal: uniform(new THREE.Matrix4()),
    localBounds: uniform(new THREE.Vector4()),
    worldBounds: uniform(new THREE.Vector4()),
    floorY: uniform(0),
  }));
  let hullInteriors: readonly HarborHullInterior[] = [];
  const hullToWorld = new THREE.Matrix4();
  const hullCorner = new THREE.Vector3();
  const updateHullMasks = () => {
    for (let i = 0; i < hullSlots.length; i++) {
      const slot = hullSlots[i];
      const hull = hullInteriors.at(i);
      slot.active.value = hull ? 1 : 0;
      if (!hull) continue;
      slot.worldToLocal.value.copy(hull.worldToLocal);
      slot.localBounds.value.set(hull.minX, hull.maxX, hull.minZ, hull.maxZ);
      slot.floorY.value = hull.floorY;
      hullToWorld.copy(hull.worldToLocal).invert();
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      // Include a metre above the floor so a tilted hull cannot move the crest
      // out of the cheap world-space broad phase before exact local clipping.
      for (let corner = 0; corner < 8; corner++) {
        hullCorner.set(corner & 1 ? hull.maxX : hull.minX,
          hull.floorY + (corner & 2 ? 1 : -0.04), corner & 4 ? hull.maxZ : hull.minZ)
          .applyMatrix4(hullToWorld);
        minX = Math.min(minX, hullCorner.x); maxX = Math.max(maxX, hullCorner.x);
        minZ = Math.min(minZ, hullCorner.z); maxZ = Math.max(maxZ, hullCorner.z);
      }
      slot.worldBounds.value.set(minX, maxX, minZ, maxZ);
    }
  };
  const rippleCount = quality === "high" ? 8 : quality === "medium" ? 6 : 4;
  const rippleSlots = Array.from({ length: rippleCount }, () => ({
    center: uniform(new THREE.Vector2(100_000, 100_000)),
    age: uniform(10),
    strength: uniform(0),
    ageSeconds: 10,
  }));
  const waveCount = quality === "high" ? 4 : quality === "medium" ? 3 : 2;
  const amplitudeScale = quality === "high" ? 1 : quality === "medium" ? 0.82 : 0.62;
  const waves = GERSTNER_WAVES.slice(0, waveCount).map((wave) => ({
    ...wave,
    amplitude: wave.amplitude * amplitudeScale,
    waveNumber: (Math.PI * 2) / wave.wavelength,
  }));
  const totalAmplitude = waves.reduce((sum, wave) => sum + wave.amplitude, 0);
  const waveNodes = waves.map((wave) => {
    const waveNumber = wave.waveNumber;
    const phase = positionLocal.x.mul(wave.dirX)
      .add(positionLocal.z.mul(wave.dirZ))
      .mul(waveNumber)
      .sub(timeNode.mul(wave.speed));
    const horizontal = cos(phase).mul(wave.steepness * wave.amplitude);
    const vertical = sin(phase).mul(wave.amplitude);
    return {
      displacement: vec3(
        horizontal.mul(wave.dirX),
        vertical,
        horizontal.mul(wave.dirZ),
      ),
      vertical,
      slopeX: cos(phase).mul(wave.amplitude * waveNumber * wave.dirX),
      slopeZ: cos(phase).mul(wave.amplitude * waveNumber * wave.dirZ),
    };
  });
  const displacementNodes = waveNodes.map((wave) => wave.displacement);
  const baseDisplacement = displacementNodes.slice(1).reduce(
    (sum, wave) => sum.add(wave),
    displacementNodes[0].add(vec3(0, 0, 0)),
  );
  const baseVertical = waveNodes
    .map((wave) => wave.vertical)
    .reduce((sum, wave) => sum.add(wave));
  const baseSlopeX = waveNodes
    .map((wave) => wave.slopeX)
    .reduce((sum, slope) => sum.add(slope));
  const baseSlopeZ = waveNodes
    .map((wave) => wave.slopeZ)
    .reduce((sum, slope) => sum.add(slope));

  const rippleInfluence = Fn(() => {
    const result = vec3(0).toVar();
    for (const ripple of rippleSlots) {
      // Uniform branches skip the expensive distance/sine/cosine work for all
      // inactive slots without recompiling the water shader for every impact.
      If(ripple.strength.greaterThan(0), () => {
        const delta = positionLocal.xz.sub(ripple.center);
        const radialDistance = distance(positionLocal.xz, ripple.center);
        const life = float(1).sub(smoothstep(0, RIPPLE_LIFETIME, ripple.age));
        const radiusFade = float(1).sub(smoothstep(RIPPLE_INNER_RADIUS, RIPPLE_RADIUS, radialDistance));
        const phase = radialDistance.mul(4.6).sub(ripple.age.mul(9.5));
        const strength = life.mul(radiusFade).mul(ripple.strength).mul(0.18);
        const height = sin(phase).mul(strength);
        const radialSlope = cos(phase).mul(4.6).mul(strength);
        const safeDistance = radialDistance.add(0.001);
        result.addAssign(vec3(
          height,
          radialSlope.mul(delta.x.div(safeDistance)),
          radialSlope.mul(delta.y.div(safeDistance)),
        ));
      });
    }
    return result;
  })();
  const rippleDisplacement = rippleInfluence.x;
  const rippleSlopeX = rippleInfluence.y;
  const rippleSlopeZ = rippleInfluence.z;
  const displacement = baseDisplacement.add(vec3(0, rippleDisplacement, 0));

  const material = new MeshPhysicalNodeMaterial({
    color: 0x174d59,
    roughness: quality === "low" ? 0.48 : 0.4,
    metalness: 0,
    clearcoat: quality === "low" ? 0.04 : 0.1,
    clearcoatRoughness: 0.42,
    ior: 1.333,
    // A deep, turbid harbor does not need the framebuffer-copy/refraction path.
    // Even 0.008 transmission put this DoubleSide mesh into two render passes.
    transmission: 0,
    thickness: 2.5,
    attenuationColor: new THREE.Color(0x174c57),
    attenuationDistance: 12,
    envMapIntensity: 0.18,
    specularIntensity: 0.24,
    specularColor: new THREE.Color(0x466c75),
    side: THREE.DoubleSide,
  });
  material.positionNode = positionLocal.add(displacement);
  material.maskNode = Fn(() => {
    const visible = bool(true).toVar();
    for (const hull of hullSlots) {
      If(hull.active.greaterThan(0), () => {
        const bounds = hull.worldBounds;
        If(positionWorld.x.greaterThan(bounds.x).and(positionWorld.x.lessThan(bounds.y))
          .and(positionWorld.z.greaterThan(bounds.z)).and(positionWorld.z.lessThan(bounds.w)), () => {
          const local = hull.worldToLocal.mul(vec4(positionWorld, 1));
          const bounds = hull.localBounds;
          const inside = local.x.greaterThan(bounds.x).and(local.x.lessThan(bounds.y))
            .and(local.z.greaterThan(bounds.z)).and(local.z.lessThan(bounds.w))
            .and(local.y.greaterThan(hull.floorY.sub(0.03)));
          visible.assign(visible.and(inside.not()));
        });
      });
    }
    return visible;
  })();

  const microPhaseA = positionLocal.x.mul(8.7)
    .add(positionLocal.z.mul(3.9))
    .sub(timeNode.mul(2.15)).add(baseVertical.mul(1.4))
    .add(sin(positionLocal.x.mul(1.13).add(positionLocal.z.mul(0.67))
      .add(timeNode.mul(0.27))).mul(2.2));
  const microPhaseB = positionLocal.x.mul(-4.3)
    .add(positionLocal.z.mul(7.1))
    .add(timeNode.mul(1.63)).sub(baseVertical.mul(0.85))
    .add(cos(positionLocal.x.mul(0.71).sub(positionLocal.z.mul(1.27))
      .sub(timeNode.mul(0.31))).mul(1.7));
  // Sub-metre capillary detail, not the old six-metre repeating specular blobs.
  // Derivative filtering suppresses shimmer at grazing angles before Nyquist;
  // distance fading avoids spending contrast on unreadable distant ripples.
  const microVisibility = float(1).sub(smoothstep(16, 130, distance(cameraPosition, positionWorld)))
    .mul(float(1).sub(smoothstep(0.25, 1.2, max(fwidth(microPhaseA), fwidth(microPhaseB)))));
  const microStrength = microVisibility.mul(quality === "high" ? 0.115 : quality === "medium" ? 0.08 : 0.045);
  const slopeX = baseSlopeX.add(rippleSlopeX)
    .add(cos(microPhaseA).mul(microStrength))
    .add(cos(microPhaseB).mul(microStrength).mul(0.55));
  const slopeZ = baseSlopeZ.add(rippleSlopeZ)
    .add(cos(microPhaseA).mul(microStrength).mul(0.4))
    .add(cos(microPhaseB).mul(microStrength));
  // NodeMaterial expects view-space normals. Supplying a local up-vector made
  // the specular response rotate with the camera rather than the water surface.
  const waterNormalWorld = vec3(slopeX.negate(), 1, slopeZ.negate()).normalize();
  const surfaceNormal = transformNormalToView(waterNormalWorld).normalize();
  material.normalNode = surfaceNormal;
  material.clearcoatNormalNode = surfaceNormal;

  // Anchor the contact to displaced world coordinates, not the ocean origin:
  // the visible concrete face is 40cm outside the old rectangular centerline.
  // A signed rectangle distance stays continuous around all four corners.
  const shoreX = abs(positionWorld.x.sub((HARBOR_SHORELINE.minX + HARBOR_SHORELINE.maxX) / 2))
    .sub((HARBOR_SHORELINE.maxX - HARBOR_SHORELINE.minX) / 2);
  const shoreZ = abs(positionWorld.z.sub((HARBOR_SHORELINE.minZ + HARBOR_SHORELINE.maxZ) / 2))
    .sub((HARBOR_SHORELINE.maxZ - HARBOR_SHORELINE.minZ) / 2);
  const shoreDistance = distance(vec2(max(shoreX, 0), max(shoreZ, 0)), vec2(0))
    .add(min(max(shoreX, shoreZ), 0));
  const foamPatch = smoothstep(-0.45, 0.7,
    sin(positionWorld.x.mul(1.73).add(positionWorld.z.mul(1.21)).sub(timeNode.mul(0.24)))
      .mul(cos(positionWorld.x.mul(0.47).sub(positionWorld.z.mul(0.81)).add(timeNode.mul(0.31)))),
  );
  const shoreFoam = Fn(() => {
    const foam = float(0).toVar();
    // Most ocean pixels are nowhere near land. Keep shore-only trigonometry
    // out of the open-water path, including on the low-quality fallback.
    If(shoreDistance.greaterThan(-0.08).and(shoreDistance.lessThan(2.4)), () => {
      // Reuse the real wave height instead of a separate moving stripe clock.
      // The contact band expands at a crest and leaves only a thin residual
      // waterline at a trough. No additional geometry, texture or render pass.
      foam.assign(createHarborShoreFoam(
        shoreDistance, baseVertical.div(totalAmplitude), foamPatch,
      ).surfaceFoam);
    });
    return foam;
  })();
  const verticalDisplacement = baseVertical.add(rippleDisplacement);
  const waveTint = verticalDisplacement.div(totalAmplitude)
    .mul(0.5)
    .add(0.5)
    .clamp(0, 1);
  const waterColor = mix(color(0x071f29), color(0x164b55), waveTint);
  const viewDirection = cameraPosition.sub(positionWorld).normalize();
  const fresnel = float(1)
    .sub(abs(waterNormalWorld.dot(viewDirection)))
    .pow(5)
    .mul(quality === "low" ? 0.18 : 0.28);
  const reflectedWater = mix(waterColor, color(0x355d66), fresnel);
  const rippleGlint = abs(sin(microPhaseA).mul(cos(microPhaseB)))
    .pow(6)
    .mul(quality === "low" ? 0.025 : 0.07).mul(microVisibility);
  const detailedWater = mix(
    reflectedWater,
    color(0x4f8791),
    rippleGlint,
  );
  const crest = smoothstep(0.86, 0.995, waveTint);
  const foamNoise = sin(
    positionLocal.x.mul(0.65)
      .add(positionLocal.z.mul(0.41))
      .add(timeNode.mul(1.2)),
  ).mul(0.5).add(0.5);
  const foamAmount = max(shoreFoam,
    crest.mul(foamNoise).mul(quality === "low" ? 0.015 : 0.03));
  material.colorNode = mix(
    detailedWater,
    color(0xa2b5aa),
    foamAmount,
  );
  material.roughnessNode = mix(float(material.roughness), float(0.78), foamAmount);

  const root = new THREE.Mesh(geometry, material);
  root.name = "harbor-ocean";
  root.userData.oceanBackend = "gerstner";
  root.position.set(HARBOR_OCEAN_ORIGIN.x, HARBOR_WATER_Y, HARBOR_OCEAN_ORIGIN.z);
  root.receiveShadow = true;
  // Let opaque land fill depth first so water fragments hidden beneath the
  // entire island are rejected before evaluating the ocean's lighting graph.
  root.renderOrder = 1;
  tagWeaponImpactSurface(root, "water");
  // One eight-triangle receiver replaces four caustic planes previously buried
  // inside the walls. It follows exactly the same analytical wave height.
  const washMaterial = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    toneMapped: true,
  });
  const waterContact = abs(positionLocal.y.sub(baseVertical));
  const washBand = float(1).sub(smoothstep(0.025, 0.17, waterContact));
  washMaterial.colorNode = color(0x9fbaaf);
  washMaterial.opacityNode = washBand.mul(createHarborShoreFoam(
    shoreDistance, baseVertical.div(totalAmplitude), foamPatch,
  ).washStrength);
  const shoreWash = new THREE.Mesh(createShoreWashGeometry(), washMaterial);
  shoreWash.name = "harbor-shoreline-wash";
  shoreWash.userData.ignoreWeaponRaycast = true;
  shoreWash.renderOrder = 2;
  root.add(shoreWash);

  return {
    kind: "gerstner",
    root,
    setHullInteriors(interiors) {
      hullInteriors = interiors;
      updateHullMasks();
    },
    update(dt: number) {
      elapsed = (elapsed + dt) % 10_000;
      timeNode.value = elapsed;
      updateHullMasks();
      for (const ripple of rippleSlots) {
        if (ripple.strength.value === 0) continue;
        ripple.ageSeconds = Math.min(RIPPLE_LIFETIME, ripple.ageSeconds + dt);
        ripple.age.value = ripple.ageSeconds;
        if (ripple.ageSeconds >= RIPPLE_LIFETIME) ripple.strength.value = 0;
      }
    },
    addRipple(x: number, z: number, strength = 1) {
      const ripple = rippleSlots.reduce((oldest, candidate) =>
        candidate.ageSeconds > oldest.ageSeconds ? candidate : oldest
      );
      ripple.center.value.set(
        x - root.position.x,
        z - root.position.z,
      );
      ripple.ageSeconds = 0;
      ripple.age.value = 0;
      ripple.strength.value = Math.max(0.25, Math.min(2, strength));
    },
    sampleHeight(x: number, z: number) {
      const localX = x - root.position.x;
      const localZ = z - root.position.z;
      let height = HARBOR_WATER_Y;
      for (const wave of waves) {
        const phase = (
          (localX * wave.dirX + localZ * wave.dirZ) * wave.waveNumber
          - elapsed * wave.speed
        );
        height += Math.sin(phase) * wave.amplitude;
      }
      for (const ripple of rippleSlots) {
        if (ripple.strength.value === 0) continue;
        const dx = localX - ripple.center.value.x;
        const dz = localZ - ripple.center.value.y;
        const radialDistance = Math.hypot(dx, dz);
        if (radialDistance >= RIPPLE_RADIUS) continue;
        const life = 1 - THREE.MathUtils.smoothstep(ripple.ageSeconds, 0, RIPPLE_LIFETIME);
        const radiusFade = 1 - THREE.MathUtils.smoothstep(radialDistance, RIPPLE_INNER_RADIUS, RIPPLE_RADIUS);
        height += Math.sin(
          radialDistance * 4.6 - ripple.ageSeconds * 9.5,
        ) * life * radiusFade * ripple.strength.value * 0.18;
      }
      return height;
    },
    dispose() {
      root.removeFromParent();
      shoreWash.geometry.dispose();
      washMaterial.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
