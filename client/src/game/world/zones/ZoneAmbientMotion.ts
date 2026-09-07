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
 * Cheap, GPU-side ambient motion for zone GLBs (AC garden, AD construction).
 *
 * Meshes carry an `ambientMotion` extra written by the Blender zone kit:
 *   sway-canopy / sway-shrub / sway-grass / sway-reed  -> TSL vertex wind sway
 *   lily-bob                                             -> tiny vertical bob
 *   pond-ripple                                          -> normal wobble on the water
 *   lamp-flicker                                         -> emissive intensity flicker
 *
 * Every vertex derives its phase from its own world position, so each
 * instance of a tuft, card or leaf cluster swings on its own beat instead of
 * the whole zone pulsing in sync. The materials are converted to node
 * materials through the renderer's node library, which keeps the glTF PBR
 * inputs intact on both WebGPU and the WebGL2 fallback.
 *
 * Only vertex/emissive work happens here; collision and weapon raycasts keep
 * using the static CPU geometry (sway amplitude stays well under 15 cm).
 */

type MotionKind =
  | "sway-canopy" | "sway-shrub" | "sway-grass" | "sway-reed" | "lily-bob"
  | "pond-ripple" | "lamp-flicker" | "hang-sway";

interface SwayProfile {
  amplitude: number;
  frequency: number;
  /** Height (m) over which the sway ramps in from the mesh base. */
  rampHeight: number;
}

const SWAY_PROFILES: Record<Exclude<MotionKind, "pond-ripple" | "lamp-flicker" | "hang-sway">, SwayProfile> = {
  "sway-canopy": { amplitude: 0.12, frequency: 0.55, rampHeight: 6.0 },
  "sway-shrub": { amplitude: 0.05, frequency: 1.1, rampHeight: 1.2 },
  "sway-grass": { amplitude: 0.06, frequency: 1.6, rampHeight: 0.6 },
  "sway-reed": { amplitude: 0.09, frequency: 1.0, rampHeight: 2.6 },
  "lily-bob": { amplitude: 0.012, frequency: 0.7, rampHeight: 0.01 },
};

/** Crane hoist cable + hook: pendulum-like drift growing with distance below the trolley. */
const HANG_PIVOT_Y = 26.6;
const HANG_LENGTH = 12.5;
const HANG_AMPLITUDE = 0.16;

const MAX_MOTION_KEYS: MotionKind[] = [
  "sway-canopy", "sway-shrub", "sway-grass", "sway-reed", "lily-bob", "pond-ripple", "lamp-flicker", "hang-sway",
];

function isMotionKind(value: unknown): value is MotionKind {
  return typeof value === "string" && (MAX_MOTION_KEYS as string[]).includes(value);
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
  private readonly lampMaterials: { material: THREE.MeshStandardMaterial; base: number; phase: number }[] = [];
  private converted = 0;
  private elapsed = 0;

  constructor(roots: THREE.Object3D[], renderer: Renderer, enabled: boolean) {
    if (!enabled) return;
    const materialCache = new Map<THREE.Material, THREE.Material>();
    for (const root of roots) root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const kind = (object.userData as Record<string, unknown>).ambientMotion;
      if (!isMotionKind(kind)) return;
      const material = object.material as THREE.Material;
      if (kind === "lamp-flicker") {
        if (material instanceof THREE.MeshStandardMaterial) {
          this.lampMaterials.push({ material, base: material.emissiveIntensity, phase: hashPhase(object.name) });
        }
        return;
      }
      let replacement = materialCache.get(material);
      if (!replacement) {
        const node = toNodeMaterial(renderer, material);
        if (!node) return;
        this.applyMotion(node, kind);
        replacement = node;
        materialCache.set(material, replacement);
        this.converted++;
      }
      object.material = replacement;
    });
  }

  private applyMotion(material: MeshStandardNodeMaterial, kind: MotionKind) {
    if (kind === "lamp-flicker") return;
    if (kind === "hang-sway") {
      const t = this.time;
      const depth = float(HANG_PIVOT_Y).sub(positionLocal.y).div(float(HANG_LENGTH)).clamp(0, 1);
      const swing = sin(t.mul(0.42)).mul(0.75).add(sin(t.mul(0.97).add(1.3)).mul(0.25));
      const drift = vec3(swing.mul(HANG_AMPLITUDE), 0, sin(t.mul(0.31).add(0.6)).mul(HANG_AMPLITUDE * 0.5)).mul(depth);
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

  /** dt is clamped by the caller; motion pauses naturally when the tab is hidden. */
  update(dt: number) {
    this.elapsed += Math.min(dt, 0.05);
    this.time.value = this.elapsed;
    for (const lamp of this.lampMaterials) {
      const flicker = 1
        + Math.sin(this.elapsed * 9.7 + lamp.phase) * 0.025
        + Math.sin(this.elapsed * 23.3 + lamp.phase * 1.7) * 0.015;
      lamp.material.emissiveIntensity = lamp.base * flicker;
    }
  }

  setWindStrength(value: number) {
    this.windStrength.value = value;
  }

  getStats() {
    return { convertedMaterials: this.converted, lampMaterials: this.lampMaterials.length };
  }
}

function hashPhase(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 628) / 100;
}
