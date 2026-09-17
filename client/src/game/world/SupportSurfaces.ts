import * as THREE from "three";

interface Bounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface SupportTransforms {
  current: THREE.Matrix4;
  inverseCurrent: THREE.Matrix4;
  previous: THREE.Matrix4;
  inversePrevious: THREE.Matrix4;
}

interface MovingSurface { local: THREE.Box3; transforms: SupportTransforms }
const surfaces = new WeakMap<object, MovingSurface>();
const localPoint = new THREE.Vector3();
const contactPoint = new THREE.Vector3();

/** Keep broadphase bounds unchanged; register only real, finite boat patches. */
export function registerMovingSupport(bounds: Bounds, local: THREE.Box3, transforms: SupportTransforms): void {
  surfaces.set(bounds, { local, transforms });
}

function heightAt(bounds: Bounds, x: number, z: number, radius: number, bottom: boolean, previous: boolean): number | null {
  const surface = surfaces.get(bounds);
  if (!surface) {
    return x + radius >= bounds.min.x && x - radius <= bounds.max.x
      && z + radius >= bounds.min.z && z - radius <= bounds.max.z
      ? (bottom ? bounds.min.y : bounds.max.y) : null;
  }
  const inverse = previous ? surface.transforms.inversePrevious : surface.transforms.inverseCurrent;
  const matrix = previous ? surface.transforms.previous : surface.transforms.current;
  const e = inverse.elements;
  // Intersect the world vertical line with local y=top (or underside), instead
  // of supporting every rider at a tilted AABB's highest global corner.
  if (e[5] <= 1e-6) return null;
  const localY = bottom ? surface.local.min.y : surface.local.max.y;
  const y = (localY - e[1] * x - e[9] * z - e[13]) / e[5];
  localPoint.set(x, y, z).applyMatrix4(inverse);
  contactPoint.set(
    THREE.MathUtils.clamp(localPoint.x, surface.local.min.x, surface.local.max.x),
    localY,
    THREE.MathUtils.clamp(localPoint.z, surface.local.min.z, surface.local.max.z),
  ).applyMatrix4(matrix);
  // Allow the same finite foot overlap as ordinary platforms, never an
  // infinite plane or the empty corners of a rotated world bounding box.
  if (Math.abs(contactPoint.x - x) > radius + 1e-6 || Math.abs(contactPoint.z - z) > radius + 1e-6) return null;
  return contactPoint.y;
}

export function getSupportHeightAt(bounds: Bounds, x: number, z: number, radius = .28, previous = false): number | null {
  return heightAt(bounds, x, z, radius, false, previous);
}

export function getCeilingHeightAt(bounds: Bounds, x: number, z: number, radius: number): number | null {
  return heightAt(bounds, x, z, radius, true, false);
}
