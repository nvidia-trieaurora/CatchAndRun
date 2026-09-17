import * as THREE from "three";
import type { QualityTier } from "../../../config/QualityManager";

/** Two fixed, shadow-free practicals under the authored ceiling panels. The
 * source GLB remains renderer-independent; Low uses environment light only.
 * Zone-root ownership means normal map teardown also removes these lights.
 */
export function attachHarborMarketLighting(root: THREE.Group, quality: QualityTier): void {
  if (quality === "low" || root.getObjectByName("harbor-market-practical-0")) return;
  const names = new Set<string>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const assigned = object.material as THREE.Material | THREE.Material[];
    for (const material of Array.isArray(assigned) ? assigned : [assigned]) names.add(material.name);
  });
  if (!names.has("MAT_MARKET_RP04_LIMESTONE")) return;
  for (const [index, [x, z]] of [[45, -36.6], [49.4, -39]].entries()) {
    const light = new THREE.PointLight(0xffe6c3, 18, 8, 2);
    light.name = `harbor-market-practical-${index}`;
    light.position.set(x, 4.05, z);
    light.castShadow = false;
    root.add(light);
  }
}
