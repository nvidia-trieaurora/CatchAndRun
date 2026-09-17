import * as THREE from "three";

// MapAssetLoader gives each live instance owned geometry. Keep rest positions
// outside userData (which is serialized/copied), released with the geometry.
const shutterRestPositions = new WeakMap<THREE.BufferGeometry, Float32Array>();

function retractShutter(mesh: THREE.Object3D, travel: number): void {
  if (!(mesh instanceof THREE.Mesh) || mesh.userData.gateTravelMode !== "retract") return;
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const position = geometry.getAttribute("position");
  let rest = shutterRestPositions.get(geometry);
  if (!rest) {
    rest = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) rest[i] = position.getY(i);
    shutterRestPositions.set(geometry, rest);
  }
  const top = Number(mesh.userData.gateRetractLocalY ?? .025);
  for (let i = 0; i < position.count; i++) {
    // Exposed geometry only translates, preserving slat spacing and lettering.
    // The capped portion is inside the authored opaque headbox, not a visible
    // simulation of the hidden spool. No material/shader allocation per frame.
    position.setY(i, travel === 0 ? rest[i] : Math.min(top, rest[i] + travel));
  }
  position.needsUpdate = true;
}

export function setHunterGateOpen(
  colliders: THREE.Box3[],
  collider: THREE.Box3 | null,
  mesh: THREE.Object3D | null,
  open: boolean,
): THREE.Box3 | null {
  if (mesh?.userData.gateMotion === "roller") {
    mesh.userData.gateOpen = open;
    // New hiding phase immediately restores a physical closed gate. Only the
    // release animates, so a fresh round cannot show an open but blocking exit.
    if (!open) {
      mesh.userData.gateProgress = 0;
      mesh.scale.y = 1;
      mesh.position.y = Number(mesh.userData.gateTopY ?? 5);
      mesh.visible = true;
      retractShutter(mesh, 0);
    }
  }
  if (open) {
    if (collider) {
      const index = colliders.indexOf(collider);
      if (index >= 0) colliders.splice(index, 1);
    }
    if (mesh && mesh.userData.gateMotion !== "roller") mesh.visible = false;
    return null;
  }

  if (collider && !colliders.includes(collider)) {
    colliders.push(collider);
  }
  if (mesh) mesh.visible = true;
  return collider;
}

/** RP05 retracts into its headbox; old assets retain the legacy fallback. */
export function updateHunterGateVisual(mesh: THREE.Object3D | null, dt: number): void {
  if (mesh?.userData.gateMotion !== "roller" || !mesh.userData.gateOpen) return;
  if (!Number.isFinite(dt) || dt <= 0 || Number(mesh.userData.gateProgress ?? 0) >= 1) return;
  const progress = Math.min(1, Number(mesh.userData.gateProgress ?? 0) + Math.max(0, dt) / 0.45);
  mesh.userData.gateProgress = progress;
  const ease = 1 - (1 - progress) ** 3;
  if (mesh.userData.gateTravelMode === "retract") {
    mesh.scale.y = 1;
    mesh.position.y = Number(mesh.userData.gateTopY ?? 5);
    retractShutter(mesh, ease * Number(mesh.userData.gateTravel ?? 5.06));
  } else {
    mesh.scale.y = Math.max(0.002, 1 - ease);
    mesh.position.y = Number(mesh.userData.gateTopY ?? 5) + ease * 0.2;
  }
  mesh.visible = progress < 1;
}
