import type * as THREE from "three";

export type WeaponImpactKind = "solid" | "foliage" | "water";

const IMPACT_KIND_KEY = "weaponImpactKind";

export function tagWeaponImpactSurface(
  object: THREE.Object3D,
  kind: Exclude<WeaponImpactKind, "solid">,
): void {
  object.userData[IMPACT_KIND_KEY] = kind;
}

export function resolveWeaponImpactKind(
  object: THREE.Object3D,
): WeaponImpactKind {
  let current: THREE.Object3D | null = object;
  while (current) {
    const kind = current.userData[IMPACT_KIND_KEY];
    if (kind === "foliage" || kind === "water") return kind;
    current = current.parent;
  }
  return "solid";
}
