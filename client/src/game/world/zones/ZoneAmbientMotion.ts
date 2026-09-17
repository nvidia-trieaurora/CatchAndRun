import * as THREE from "three";
import type { MeshStandardNodeMaterial, Renderer } from "three/webgpu";
import {
  float,
  mix,
  normalLocal,
  positionLocal,
  positionWorld,
  sin,
  uniform,
  vec3,
} from "three/tsl";

/**
 * Cheap, GPU-side ambient motion for zone GLBs (AC garden, AD construction, AB operations).
 *
 * Meshes carry an `ambientMotion` extra written by the Blender zone kit:
 *   sway-canopy / sway-shrub / sway-grass / sway-reed  -> TSL vertex wind sway
 *   lily-bob                                             -> tiny vertical bob
 *   pond-ripple                                          -> normal wobble on the water
 *   lamp-flicker                                         -> emissive intensity flicker
 *   hang-sway / davit-sway                               -> TSL pendulum drift below a pivot
 *   status-pulse / beacon-flash                          -> slow cyan pulse / sharp amber flash
 *   spin                                                 -> CPU rotation about `spinAxis` at `spinRpm`
 *
 * Every vertex derives its phase from its own world position, so each
 * instance of a tuft, card or leaf cluster swings on its own beat instead of
 * the whole zone pulsing in sync. The materials are converted to node
 * materials through the renderer's node library, which keeps the glTF PBR
 * inputs intact on both WebGPU and the WebGL2 fallback.
 *
 * Only vertex/emissive/transform work happens here; collision keeps using the
 * static CPU colliders (sway amplitude stays well under 15 cm; spinning rotors
 * carry `ignoreWeaponRaycast`) and any mesh tagged `ambientMotion` is treated as
 * a dynamic weapon-raycast target by WeaponSystem. Emissive kinds clone the
 * material once so a pulsing strip never modulates the shared lamp palette.
 */

export type MotionKind =
  | "sway-canopy" | "sway-shrub" | "sway-grass" | "sway-reed" | "lily-bob"
  | "pond-ripple" | "lamp-flicker" | "hang-sway"
  | "davit-sway" | "status-pulse" | "beacon-flash" | "spin";

interface SwayProfile {
  amplitude: number;
  frequency: number;
  /** Height (m) over which the sway ramps in from the mesh base. */
  rampHeight: number;
}

type SwayKind = "sway-canopy" | "sway-shrub" | "sway-grass" | "sway-reed" | "lily-bob";
type EmissiveKind = "lamp-flicker" | "status-pulse" | "beacon-flash";

const SWAY_PROFILES: Record<SwayKind, SwayProfile> = {
  "sway-canopy": { amplitude: 0.12, frequency: 0.55, rampHeight: 6.0 },
  "sway-shrub": { amplitude: 0.05, frequency: 1.1, rampHeight: 1.2 },
  "sway-grass": { amplitude: 0.06, frequency: 1.6, rampHeight: 0.6 },
  "sway-reed": { amplitude: 0.09, frequency: 1.0, rampHeight: 2.6 },
  "lily-bob": { amplitude: 0.012, frequency: 0.7, rampHeight: 0.01 },
};

interface PendulumProfile {
  pivotY: number;
  length: number;
  amplitude: number;
}

/** Crane hoist cable + hook (AD): pendulum-like drift growing with distance below the trolley. */
const HANG_PROFILE: PendulumProfile = { pivotY: 26.6, length: 12.5, amplitude: 0.16 };
/** Seawall service davit (AB): 1.8 m cable + hook block hanging from the boom pulley at 4.85 m. */
const DAVIT_PROFILE: PendulumProfile = { pivotY: 4.85, length: 2.4, amplitude: 0.07 };

/** Restrained cyan status light: slow breathing between 55 % and 100 % of the authored emissive. */
export const STATUS_PULSE_MIN = 0.55;
export const STATUS_PULSE_PERIOD = 4.4;
/** Amber beacon: 1.2 s period, ~0.15 s bright flash decaying to an 8 % idle glow. */
export const BEACON_PERIOD = 1.2;
export const BEACON_IDLE = 0.08;
const DEFAULT_SPIN_RPM = 18;

const MAX_MOTION_KEYS: MotionKind[] = [
  "sway-canopy", "sway-shrub", "sway-grass", "sway-reed", "lily-bob", "pond-ripple", "lamp-flicker", "hang-sway",
  "davit-sway", "status-pulse", "beacon-flash", "spin",
];

export function isMotionKind(value: unknown): value is MotionKind {
  return typeof value === "string" && (MAX_MOTION_KEYS as string[]).includes(value);
}

function isEmissiveKind(kind: MotionKind): kind is EmissiveKind {
  return kind === "lamp-flicker" || kind === "status-pulse" || kind === "beacon-flash";
}

/** Deterministic emissive envelope for the CPU-side kinds (exported for tests). */
export function emissiveEnvelope(kind: EmissiveKind, elapsed: number, phase: number): number {
  if (kind === "lamp-flicker") {
    return 1 + Math.sin(elapsed * 9.7 + phase) * 0.025 + Math.sin(elapsed * 23.3 + phase * 1.7) * 0.015;
  }
  if (kind === "status-pulse") {
    const wave = 0.5 + 0.5 * Math.sin((elapsed / STATUS_PULSE_PERIOD) * Math.PI * 2 + phase);
    return STATUS_PULSE_MIN + (1 - STATUS_PULSE_MIN) * wave;
  }
  const cycle = ((elapsed + phase * (BEACON_PERIOD / (Math.PI * 2))) / BEACON_PERIOD) % 1;
  const flash = Math.max(0, 1 - cycle / 0.15);
  return BEACON_IDLE + (1 - BEACON_IDLE) * flash * flash;
}

interface SpinEntry {
  object: THREE.Mesh;
  axis: THREE.Vector3;
  radiansPerSecond: number;
  phase: number;
  /** Plain meshes: authored orientation. Instanced meshes: authored per-instance matrices. */
  baseQuaternion: THREE.Quaternion | null;
  baseMatrices: THREE.Matrix4[] | null;
}

interface EmissiveEntry {
  kind: EmissiveKind;
  material: THREE.MeshStandardMaterial;
  base: number;
  phase: number;
}

function spinAxis(value: unknown): THREE.Vector3 {
  if (value === "x") return new THREE.Vector3(1, 0, 0);
  if (value === "z") return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(0, 1, 0);
}

interface NodeLibraryLike {
  fromMaterial(material: THREE.Material): THREE.Material | null;
}

function toNodeMaterial(renderer: Renderer, material: THREE.Material): MeshStandardNodeMaterial | null {
  const library = (renderer as unknown as { library?: NodeLibraryLike }).library;
  if (!library) return null;
  const converted = library.fromMaterial(material);
  if (!converted || !("positionNode" in converted)) return null;
  return converted as MeshStandardNodeMaterial;
}

export class ZoneAmbientMotion {
  private readonly time = uniform(0);
  private readonly windStrength = uniform(1);
  private readonly emissives: EmissiveEntry[] = [];
  private readonly spinners: SpinEntry[] = [];
  private readonly scratchQuaternion = new THREE.Quaternion();
  private readonly scratchMatrix = new THREE.Matrix4();
  private converted = 0;
  private elapsed = 0;

  constructor(roots: THREE.Object3D[], renderer: Renderer, enabled: boolean) {
    if (!enabled) return;
    const materialCache = new Map<THREE.Material, Map<MotionKind, THREE.Material>>();
    const replacedOriginals = new Set<THREE.Material>();
    for (const root of roots) root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const data = object.userData as Record<string, unknown>;
      const kind = data.ambientMotion;
      if (!isMotionKind(kind)) return;
      const material = object.material as THREE.Material;
      if (kind === "spin") {
        this.registerSpinner(object, data);
        return;
      }
      if (isEmissiveKind(kind)) {
        if (material instanceof THREE.MeshStandardMaterial) {
          // isolate the emissive so the pulse never rides on a palette shared with other batches
          const isolated = material.clone();
          object.material = isolated;
          replacedOriginals.add(material);
          this.emissives.push({ kind, material: isolated, base: isolated.emissiveIntensity, phase: hashPhase(object.name) });
        }
        return;
      }
      let byKind = materialCache.get(material);
      if (!byKind) {
        byKind = new Map();
        materialCache.set(material, byKind);
      }
      let replacement = byKind.get(kind);
      if (!replacement) {
        const node = toNodeMaterial(renderer, material);
        if (!node) return;
        this.applyMotion(node, kind);
        replacement = node;
        byKind.set(kind, replacement);
        replacedOriginals.add(material);
        this.converted++;
      }
      object.material = replacement;
    });
    // originals that no mesh references any more (an emissive batch owned its material alone)
    for (const root of roots) root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) replacedOriginals.delete(material);
    });
    for (const orphan of replacedOriginals) orphan.dispose();
  }

  private registerSpinner(object: THREE.Mesh, data: Record<string, unknown>) {
    const rpm = typeof data.spinRpm === "number" && Number.isFinite(data.spinRpm) ? data.spinRpm : DEFAULT_SPIN_RPM;
    const entry: SpinEntry = {
      object,
      axis: spinAxis(data.spinAxis),
      radiansPerSecond: (rpm / 60) * Math.PI * 2,
      phase: hashPhase(object.name),
      baseQuaternion: null,
      baseMatrices: null,
    };
    if (object instanceof THREE.InstancedMesh) {
      entry.baseMatrices = [];
      for (let i = 0; i < object.count; i++) {
        const matrix = new THREE.Matrix4();
        object.getMatrixAt(i, matrix);
        entry.baseMatrices.push(matrix);
      }
    } else {
      entry.baseQuaternion = object.quaternion.clone();
    }
    this.spinners.push(entry);
  }

  private applyMotion(material: MeshStandardNodeMaterial, kind: MotionKind) {
    if (kind === "lamp-flicker" || kind === "status-pulse" || kind === "beacon-flash" || kind === "spin") return;
    if (kind === "hang-sway" || kind === "davit-sway") {
      const profile = kind === "hang-sway" ? HANG_PROFILE : DAVIT_PROFILE;
      const t = this.time;
      const depth = float(profile.pivotY).sub(positionLocal.y).div(float(profile.length)).clamp(0, 1);
      const swing = sin(t.mul(0.42)).mul(0.75).add(sin(t.mul(0.97).add(1.3)).mul(0.25));
      const drift = vec3(swing.mul(profile.amplitude), 0, sin(t.mul(0.31).add(0.6)).mul(profile.amplitude * 0.5)).mul(depth);
      material.positionNode = positionLocal.add(drift);
      return;
    }
    if (kind === "pond-ripple") {
      // gentle normal wobble: two low-frequency sine ridges crossing the pond
      const p = positionWorld;
      const t = this.time;
      const dx = sin(p.x.mul(1.7).add(t.mul(0.9))).mul(0.035);
      const dz = sin(p.z.mul(2.3).sub(t.mul(0.7))).mul(0.03);
      material.normalNode = vec3(dx, float(1.0), dz).normalize();
      return;
    }
    const profile = SWAY_PROFILES[kind];
    const p = positionWorld;
    const t = this.time;
    // per-vertex phase from world position -> seeded, unsynchronised instances
    const phase = p.x.mul(0.37).add(p.z.mul(0.53));
    // zone batches are baked in world space (object at origin), so local y is
    // height above the harbor ground; sway ramps in from the ground up
    const ramp = positionLocal.y.div(float(profile.rampHeight)).clamp(0, 1);
    const gust = sin(t.mul(profile.frequency).add(phase)).mul(0.7)
      .add(sin(t.mul(profile.frequency * 2.31).add(phase.mul(1.9))).mul(0.3));
    const amp = float(profile.amplitude).mul(this.windStrength);
    if (kind === "lily-bob") {
      material.positionNode = positionLocal.add(vec3(0, gust.mul(amp), 0));
      return;
    }
    // wind mostly along +x with a little z, stronger toward the top of the mesh
    const offset = vec3(gust.mul(amp), gust.abs().mul(amp).mul(-0.15), gust.mul(amp).mul(0.35)).mul(ramp);
    material.positionNode = positionLocal.add(offset);
    // fake a touch of shading variation on cards so the motion reads
    material.normalNode = mix(normalLocal, normalLocal.add(vec3(gust.mul(0.15), 0, 0)).normalize(), ramp);
  }

  /** dt is clamped here (and by the caller); motion pauses naturally when the tab is hidden. */
  update(dt: number) {
    this.elapsed += Math.min(Math.max(dt, 0), 0.05);
    this.time.value = this.elapsed;
    for (const entry of this.emissives) {
      entry.material.emissiveIntensity = entry.base * emissiveEnvelope(entry.kind, this.elapsed, entry.phase);
    }
    for (const spinner of this.spinners) {
      const angle = this.elapsed * spinner.radiansPerSecond + spinner.phase;
      this.scratchQuaternion.setFromAxisAngle(spinner.axis, angle);
      if (spinner.baseMatrices && spinner.object instanceof THREE.InstancedMesh) {
        const instances = spinner.object;
        for (let i = 0; i < spinner.baseMatrices.length; i++) {
          this.scratchMatrix.makeRotationFromQuaternion(this.scratchQuaternion);
          this.scratchMatrix.premultiply(spinner.baseMatrices[i]);
          instances.setMatrixAt(i, this.scratchMatrix);
        }
        instances.instanceMatrix.needsUpdate = true;
      } else if (spinner.baseQuaternion) {
        spinner.object.quaternion.copy(spinner.baseQuaternion).multiply(this.scratchQuaternion);
      }
    }
  }

  setWindStrength(value: number) {
    this.windStrength.value = value;
  }

  getStats() {
    return {
      convertedMaterials: this.converted,
      lampMaterials: this.emissives.length,
      emissiveMaterials: this.emissives.length,
      spinners: this.spinners.length,
    };
  }
}

function hashPhase(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 628) / 100;
}
