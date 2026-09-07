import * as THREE from "three";
import {
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
} from "three/webgpu";
import {
  abs,
  cameraPosition,
  color,
  cos,
  distance,
  float,
  max,
  mix,
  normalWorld,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  uniform,
  vec3,
} from "three/tsl";
import type { QualityTier } from "../../../config/QualityManager";
import { tagWeaponImpactSurface } from "../weaponImpactSurfaces";
import type { OceanBackend } from "./OceanBackend";

export const HARBOR_WATER_Y = -0.8;

export interface HarborWaterSurface extends OceanBackend {
  readonly kind: "gerstner";
  root: THREE.Mesh<THREE.PlaneGeometry, MeshPhysicalNodeMaterial>;
  update(dt: number): void;
  dispose(): void;
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
  const segments = quality === "high" ? 96 : quality === "medium" ? 64 : 32;
  const geometry = new THREE.PlaneGeometry(300, 260, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  let elapsed = 0;
  const timeNode = uniform(0);
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
  }));
  const totalAmplitude = waves.reduce((sum, wave) => sum + wave.amplitude, 0);
  const waveNodes = waves.map((wave) => {
    const waveNumber = (Math.PI * 2) / wave.wavelength;
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

  const rippleNodes = rippleSlots.map((ripple) => {
    const delta = positionLocal.xz.sub(ripple.center);
    const radialDistance = distance(positionLocal.xz, ripple.center);
    const life = float(1).sub(smoothstep(0, 1.6, ripple.age));
    const radiusFade = float(1).sub(smoothstep(0.2, 7, radialDistance));
    const phase = radialDistance.mul(4.6).sub(ripple.age.mul(9.5));
    const strength = life.mul(radiusFade).mul(ripple.strength).mul(0.18);
    const height = sin(phase).mul(strength);
    const radialSlope = cos(phase).mul(4.6).mul(strength);
    const safeDistance = radialDistance.add(0.001);
    return {
      height,
      slopeX: radialSlope.mul(delta.x.div(safeDistance)),
      slopeZ: radialSlope.mul(delta.y.div(safeDistance)),
    };
  });
  const rippleDisplacement = rippleNodes.map((ripple) => ripple.height).reduce(
    (sum, ripple) => sum.add(ripple),
  );
  const rippleSlopeX = rippleNodes.map((ripple) => ripple.slopeX).reduce(
    (sum, slope) => sum.add(slope),
  );
  const rippleSlopeZ = rippleNodes.map((ripple) => ripple.slopeZ).reduce(
    (sum, slope) => sum.add(slope),
  );
  const displacement = baseDisplacement.add(vec3(0, rippleDisplacement, 0));

  const material = new MeshPhysicalNodeMaterial({
    color: 0x174d59,
    roughness: quality === "low" ? 0.56 : 0.5,
    metalness: 0,
    clearcoat: quality === "low" ? 0.04 : 0.1,
    clearcoatRoughness: 0.42,
    ior: 1.333,
    transmission: quality === "high" ? 0.008 : 0,
    thickness: 2.5,
    attenuationColor: new THREE.Color(0x174c57),
    attenuationDistance: 12,
    envMapIntensity: 0.12,
    specularIntensity: 0.12,
    specularColor: new THREE.Color(0x466c75),
    side: THREE.DoubleSide,
  });
  material.positionNode = positionLocal.add(displacement);

  const microStrength = quality === "high" ? 0.075 : quality === "medium" ? 0.05 : 0.025;
  const microPhaseA = positionLocal.x.mul(0.92)
    .add(positionLocal.z.mul(0.37))
    .sub(timeNode.mul(1.45));
  const microPhaseB = positionLocal.x.mul(-0.48)
    .add(positionLocal.z.mul(1.15))
    .add(timeNode.mul(1.1));
  const slopeX = baseSlopeX.add(rippleSlopeX)
    .add(cos(microPhaseA).mul(microStrength))
    .add(cos(microPhaseB).mul(microStrength * 0.55));
  const slopeZ = baseSlopeZ.add(rippleSlopeZ)
    .add(cos(microPhaseA).mul(microStrength * 0.4))
    .add(cos(microPhaseB).mul(microStrength));
  material.normalNode = vec3(slopeX.negate(), 1, slopeZ.negate()).normalize();

  const islandEdge = max(
    abs(positionLocal.x).sub(59),
    abs(positionLocal.z).sub(45),
  );
  const shoreline = float(1).sub(smoothstep(0, 4.5, islandEdge));
  const verticalDisplacement = baseVertical.add(rippleDisplacement);
  const waveTint = verticalDisplacement.div(totalAmplitude)
    .mul(0.5)
    .add(0.5)
    .clamp(0, 1);
  const waterColor = mix(color(0x061f2b), color(0x155762), waveTint);
  const viewDirection = cameraPosition.sub(positionWorld).normalize();
  const fresnel = float(1)
    .sub(abs(normalWorld.dot(viewDirection)))
    .pow(5)
    .mul(quality === "low" ? 0.18 : 0.28);
  const reflectedWater = mix(waterColor, color(0x355d66), fresnel);
  const rippleGlint = abs(sin(microPhaseA).mul(cos(microPhaseB)))
    .pow(6)
    .mul(quality === "low" ? 0.025 : 0.07);
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
  const foamAmount = max(
    shoreline.mul(0.14),
    crest.mul(foamNoise).mul(quality === "low" ? 0.015 : 0.03),
  ).clamp(0, 0.16);
  material.colorNode = mix(
    detailedWater,
    color(0x527f7b),
    foamAmount,
  );

  const root = new THREE.Mesh(geometry, material);
  root.name = "harbor-ocean";
  root.userData.oceanBackend = "gerstner";
  root.position.set(4, HARBOR_WATER_Y, 2);
  root.receiveShadow = true;
  root.renderOrder = -10;
  tagWeaponImpactSurface(root, "water");
  const caustics = quality === "high"
    ? createShorelineCaustics(timeNode)
    : null;
  if (caustics) root.add(caustics);

  return {
    kind: "gerstner",
    root,
    update(dt: number) {
      elapsed = (elapsed + dt) % 10_000;
      timeNode.value = elapsed;
      for (const ripple of rippleSlots) {
        ripple.ageSeconds += dt;
        ripple.age.value = ripple.ageSeconds;
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
        const waveNumber = (Math.PI * 2) / wave.wavelength;
        const phase = (
          (localX * wave.dirX + localZ * wave.dirZ) * waveNumber
          - elapsed * wave.speed
        );
        height += Math.sin(phase) * wave.amplitude;
      }
      for (const ripple of rippleSlots) {
        if (ripple.ageSeconds >= 1.6) continue;
        const dx = localX - ripple.center.value.x;
        const dz = localZ - ripple.center.value.y;
        const radialDistance = Math.hypot(dx, dz);
        const life = 1 - Math.min(1, ripple.ageSeconds / 1.6);
        const radiusFade = 1 - Math.min(1, Math.max(0, (radialDistance - 0.2) / 6.8));
        height += Math.sin(
          radialDistance * 4.6 - ripple.ageSeconds * 9.5,
        ) * life * radiusFade * ripple.strength.value * 0.18;
      }
      return height;
    },
    dispose() {
      root.removeFromParent();
      if (caustics) disposeObjectMaterials(caustics);
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Analytic shoreline caustics adapted from the MIT-licensed wave/caustic
 * concepts in https://github.com/jeantimex/threejs-water. The implementation
 * is TSL-based so WebGPU and the WebGL2 fallback share the same material graph.
 */
function createShorelineCaustics(
  timeNode: ReturnType<typeof uniform>,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "harbor-shoreline-caustics";
  group.userData.ignoreWeaponRaycast = true;

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const bands = abs(
    sin(positionWorld.x.mul(1.35).add(timeNode.mul(1.15)))
      .mul(cos(positionWorld.y.mul(2.1).sub(timeNode.mul(0.72))))
      .mul(sin(positionWorld.z.mul(1.6).add(timeNode.mul(0.9)))),
  ).pow(5);
  material.colorNode = color(0x76d8d1);
  material.opacityNode = bands.mul(0.14);

  const northSouthGeometry = new THREE.PlaneGeometry(118, 1.5, 1, 1);
  for (const z of [-45, 45]) {
    const receiver = new THREE.Mesh(northSouthGeometry, material);
    receiver.position.set(0, 0.15, z);
    group.add(receiver);
  }

  const eastWestGeometry = new THREE.PlaneGeometry(90, 1.5, 1, 1);
  for (const x of [-59, 59]) {
    const receiver = new THREE.Mesh(eastWestGeometry, material);
    receiver.position.set(x, 0.15, 0);
    receiver.rotation.y = Math.PI / 2;
    group.add(receiver);
  }
  return group;
}

function disposeObjectMaterials(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry as THREE.BufferGeometry);
    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of meshMaterials) materials.add(material as THREE.Material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
