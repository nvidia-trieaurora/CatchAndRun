import * as THREE from "three";

/**
 * Returns only movement colliders whose horizontal footprint can affect the
 * player during the next few frames. Large floor slabs are retained because
 * their bounds overlap the query square.
 */
export function collectNearbyColliders(
  colliders: readonly THREE.Box3[],
  position: THREE.Vector3,
  radius: number,
): THREE.Box3[] {
  const minX = position.x - radius;
  const maxX = position.x + radius;
  const minZ = position.z - radius;
  const maxZ = position.z + radius;
  return colliders.filter((collider) => (
    collider.min.x <= maxX
    && collider.max.x >= minX
    && collider.min.z <= maxZ
    && collider.max.z >= minZ
  ));
}
