import * as THREE from "three";
import type { QualityTier } from "../../../config/QualityManager";

/** Attached ceiling practicals; emissive strips alone cannot light the soffit.
 * No shadow maps, no per-frame updates. Root teardown owns both lights.
 */
export function attachResponseStationLighting(root: THREE.Group, quality: QualityTier): void {
  if (quality === "low" || root.getObjectByName("response-station-practical-0")) return;
  let hasReviewedStation = false;
  root.traverse((object) => {
    if (object.userData.gameplayRole === "hunterGate" && object.userData.gateTravelMode === "retract") hasReviewedStation = true;
  });
  if (!hasReviewedStation) return;
  for (const [index, z] of [-4.6, 4.6].entries()) {
    const light = new THREE.PointLight(0xe3f1ef, 10, 9, 2);
    light.name = `response-station-practical-${index}`;
    light.position.set(-42, 4.55, z);
    light.castShadow = false;
    root.add(light);
  }
}
