import type * as THREE from "three";

export function setHunterGateOpen(
  colliders: THREE.Box3[],
  collider: THREE.Box3 | null,
  mesh: THREE.Object3D | null,
  open: boolean,
): THREE.Box3 | null {
  if (open) {
    if (collider) {
      const index = colliders.indexOf(collider);
      if (index >= 0) colliders.splice(index, 1);
    }
    if (mesh) mesh.visible = false;
    return null;
  }

  if (collider && !colliders.includes(collider)) {
    colliders.push(collider);
  }
  if (mesh) mesh.visible = true;
  return collider;
}
