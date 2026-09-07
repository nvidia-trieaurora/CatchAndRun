import * as THREE from "three";

/**
 * Adapter between the Ferris Harbor zone GLB and the existing Ferris gameplay.
 *
 * `buildFerrisWheel` still owns the gameplay contract (hub (-10, 12, 34), mount
 * radius 8.5, eight cabins, the 40 dynamic cabin colliders and the platform
 * carry in GameManager). When the zone GLB is active its procedural meshes are
 * stripped and this rig drives the authored nodes instead:
 *
 *   RIG_FERRIS_HARBOR_WHEEL_ROOT   rotation.z = wheel angle (rims, spokes, hub, bulbs, yokes)
 *     RIG_FERRIS_HARBOR_MOUNT_<i>   fixed offset on the mount radius
 *       RIG_FERRIS_HARBOR_CABIN_<i> rotation.z = -angle so the gondola hangs upright
 *
 * Cabin meshes stay ordinary meshes under their pivot, so bullet marks parented
 * by WeaponSystem ride along, and the root's `dynamicWeaponRaycast` extra makes
 * the whole wheel a moving hit surface.
 */
export const FERRIS_WHEEL_ROOT_NAME = "RIG_FERRIS_HARBOR_WHEEL_ROOT";
export const FERRIS_CABIN_PREFIX = "RIG_FERRIS_HARBOR_CABIN_";

export class FerrisHarborRig {
  readonly wheelRoot: THREE.Object3D;
  readonly cabins: THREE.Object3D[];
  private angle = 0;

  private constructor(wheelRoot: THREE.Object3D, cabins: THREE.Object3D[]) {
    this.wheelRoot = wheelRoot;
    this.cabins = cabins;
    wheelRoot.userData.dynamicWeaponRaycast = true;
    wheelRoot.userData.ferrisRig = true;
  }

  /** Find the rig in any of the given roots; null when the zone is not active. */
  static fromRoots(roots: readonly THREE.Object3D[]): FerrisHarborRig | null {
    for (const root of roots) {
      const wheel = root.getObjectByName(FERRIS_WHEEL_ROOT_NAME);
      if (!wheel) continue;
      const cabins: THREE.Object3D[] = [];
      wheel.traverse((object) => {
        if (object.name.startsWith(FERRIS_CABIN_PREFIX)) cabins.push(object);
      });
      cabins.sort((a, b) => cabinIndex(a) - cabinIndex(b));
      return new FerrisHarborRig(wheel, cabins);
    }
    return null;
  }

  /** Drive the authored wheel from the gameplay angle (radians about +z). */
  setAngle(angle: number): void {
    this.angle = angle;
    this.wheelRoot.rotation.z = angle;
    for (const cabin of this.cabins) cabin.rotation.z = -angle;
  }

  getAngle(): number {
    return this.angle;
  }

  /** World position of a cabin pivot (matches the collider formula centre). */
  cabinWorldPosition(index: number, target: THREE.Vector3): THREE.Vector3 {
    const cabin = index >= 0 && index < this.cabins.length ? this.cabins[index] : undefined;
    if (cabin === undefined) return target.set(NaN, NaN, NaN);
    cabin.updateWorldMatrix(true, false);
    return cabin.getWorldPosition(target);
  }
}

function cabinIndex(object: THREE.Object3D): number {
  const fromExtra: unknown = (object.userData as Record<string, unknown>).cabinIndex;
  if (typeof fromExtra === "number") return fromExtra;
  const parsed = Number.parseInt(object.name.slice(FERRIS_CABIN_PREFIX.length), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
