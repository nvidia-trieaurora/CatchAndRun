import * as THREE from "three";

export const FIRST_PERSON_RENDER_ORDER = 999;

/**
 * First-person meshes must be in the transparent render queue. World water and
 * glass render after opaque objects, and the viewmodel intentionally does not
 * write depth, so leaving it opaque lets those distant surfaces blend over it.
 */
export function configureFirstPersonViewmodel(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    object.renderOrder = Math.max(
      object.renderOrder,
      FIRST_PERSON_RENDER_ORDER,
    );
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      material.transparent = true;
      material.depthTest = false;
      material.depthWrite = false;
      material.needsUpdate = true;
    }
  });
}
