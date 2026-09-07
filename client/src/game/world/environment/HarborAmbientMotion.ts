import * as THREE from "three";
import type { HarborWaterSurface } from "./harborWater";

interface MotionPart {
  object: THREE.Object3D;
  basePosition: THREE.Vector3;
  baseQuaternion: THREE.Quaternion;
}

interface MotionGroup {
  key: string;
  phase: number;
  parts: MotionPart[];
  /** Half length / half beam used to sample the water slope (metres). */
  sampleX: number;
  sampleZ: number;
  /** 1 for a boat riding the swell, smaller for one tied to the quay, small for buoys. */
  amplitude: number;
  /** Pitch/roll follow the water slope for boats; buoys only heave. */
  tilts: boolean;
  /** Only moving craft leave wakes; the fleet is moored, so this stays false. */
  moving: boolean;
}

const motionEuler = new THREE.Euler();
const motionQuaternion = new THREE.Quaternion();
const anchorScratch = new THREE.Vector3();
const HARBOR_WATER_Y = -0.8;

/**
 * Bobs boats and buoys tagged with an `ambientMotion` extra of `boat-<id>` or
 * `buoy-<id>` (cinematic GLB parts or a zone GLB rig root). When the Gerstner
 * water can be sampled synchronously the heave follows the real surface and
 * pitch/roll follow its slope under the hull; otherwise (Water Pro returns a
 * promise) a seeded sine bob is used. Nothing is allocated per frame.
 */
export class HarborAmbientMotion {
  private elapsed = 0;
  private wakeElapsed = 0;
  private wakeIndex = 0;
  private groups: MotionGroup[];

  constructor(
    roots: THREE.Object3D | readonly THREE.Object3D[],
    private enableWakes: boolean,
  ) {
    const groups = new Map<string, MotionGroup>();
    // Array.isArray does not narrow readonly arrays; spell the list type out.
    const rootList: readonly THREE.Object3D[] = roots instanceof THREE.Object3D ? [roots] : roots;
    for (const root of rootList) {
      root.traverse((object) => {
        const key = (object.userData as Record<string, unknown>).ambientMotion;
        if (typeof key !== "string" || !(key.startsWith("boat-") || key.startsWith("buoy-"))) return;
        const isBuoy = key.startsWith("buoy-");
        const moored = object.userData.boatMoored === true;
        const length = typeof object.userData.boatLength === "number" ? object.userData.boatLength : 4;
        const group = groups.get(key) ?? {
          key,
          phase: hashPhase(key),
          parts: [],
          sampleX: Math.max(0.6, length * 0.35),
          sampleZ: Math.max(0.4, length * 0.12),
          amplitude: isBuoy ? 0.7 : moored ? 0.45 : 1.0,
          tilts: !isBuoy,
          moving: false,
        };
        group.parts.push({
          object,
          basePosition: object.position.clone(),
          baseQuaternion: object.quaternion.clone(),
        });
        groups.set(key, group);
      });
    }
    this.groups = [...groups.values()];
  }

  update(dt: number, water: HarborWaterSurface | null) {
    this.elapsed += dt;
    this.wakeElapsed += dt;
    const sampler = water && typeof water.sampleHeight === "function" ? water : null;

    for (const group of this.groups) {
      const t = this.elapsed;
      let heave = Math.sin(t * 0.9 + group.phase) * 0.09;
      let pitch = Math.sin(t * 0.55 + group.phase) * 0.012;
      let roll = Math.cos(t * 0.72 + group.phase) * 0.02;
      const anchor = group.parts[0];
      if (sampler) {
        anchor.object.getWorldPosition(anchorScratch);
        const x = anchorScratch.x;
        const z = anchorScratch.z;
        const centre = sampler.sampleHeight(x, z);
        if (typeof centre === "number") {
          heave = centre - HARBOR_WATER_Y;
          if (group.tilts) {
            const fore = sampler.sampleHeight(x + group.sampleX, z) as number;
            const aft = sampler.sampleHeight(x - group.sampleX, z) as number;
            const port = sampler.sampleHeight(x, z - group.sampleZ) as number;
            const starboard = sampler.sampleHeight(x, z + group.sampleZ) as number;
            // slope -> rotation about z (pitch, bow along +/-x) and about x (roll)
            pitch = Math.atan2(fore - aft, 2 * group.sampleX);
            roll = Math.atan2(starboard - port, 2 * group.sampleZ);
          } else {
            pitch = 0;
            roll = 0;
          }
          // tiny seeded wobble keeps neighbouring hulls from moving in lock-step
          heave += Math.sin(t * 1.3 + group.phase) * 0.015;
        }
      }
      heave *= group.amplitude;
      pitch *= group.amplitude;
      roll *= group.amplitude;
      motionEuler.set(roll, 0, -pitch);
      motionQuaternion.setFromEuler(motionEuler);
      for (const part of group.parts) {
        part.object.position.copy(part.basePosition);
        part.object.position.y += heave;
        part.object.quaternion.copy(part.baseQuaternion).multiply(motionQuaternion);
      }
    }

    if (
      this.enableWakes
      && water
      && this.wakeElapsed >= 2.8
    ) {
      this.wakeElapsed = 0;
      const moving = this.groups.filter((group) => group.moving);
      if (moving.length > 0) {
        const group = moving[this.wakeIndex % moving.length];
        this.wakeIndex++;
        group.parts[0].object.getWorldPosition(anchorScratch);
        water.addRipple?.(anchorScratch.x, anchorScratch.z, 0.4);
      }
    }
  }

  getGroupCount(): number {
    return this.groups.length;
  }

  /** Motion groups that ride the water (boats + buoys), for tests and metrics. */
  getGroupKeys(): string[] {
    return this.groups.map((group) => group.key);
  }
}

function hashPhase(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 628) / 100;
}
