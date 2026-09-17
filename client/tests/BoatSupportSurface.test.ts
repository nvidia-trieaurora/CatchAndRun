import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BoatCollisionRig } from "../src/game/world/zones/BoatCollisionRig";
import { getCeilingHeightAt, getSupportHeightAt } from "../src/game/world/SupportSurfaces";
import { findGroundSurface } from "../src/game/controllers/GroundCollision";
import { WaterVolumes } from "../src/game/controllers/WaterSwim";

function fixture() {
  const root = new THREE.Group();
  root.name = "RIG_FERRIS_HARBOR_BOAT_SURFACE";
  root.userData.ambientMotion = "boat-surface";
  root.position.set(0, -.95, 50);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, .1, 2), new THREE.MeshBasicMaterial());
  root.add(mesh);
  const rig = new BoatCollisionRig([root]);
  const box = rig.colliders[0];
  return { root, mesh, rig, box, dispose: () => { mesh.geometry.dispose(); mesh.material.dispose(); } };
}

describe("exact registered boat support planes", () => {
  it("samples tilted top and underside at the body, not the global AABB corner", () => {
    const { root, mesh, rig, box, dispose } = fixture();
    try {
      root.rotation.set(.09, .2, .13);
      rig.update(); root.updateMatrixWorld(true);
      const x = -.5, z = 50.1;
      const topRay = new THREE.Raycaster(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0), 0, 4);
      const bottomRay = new THREE.Raycaster(new THREE.Vector3(x, -3, z), new THREE.Vector3(0, 1, 0), 0, 4);
      const visibleTop = topRay.intersectObject(mesh)[0].point.y;
      const visibleBottom = bottomRay.intersectObject(mesh)[0].point.y;
      expect(getSupportHeightAt(box, x, z, 0)).toBeCloseTo(visibleTop, 6);
      expect(getCeilingHeightAt(box, x, z, 0)).toBeCloseTo(visibleBottom, 6);
      expect(findGroundSurface([box], { x, z, previousY: 1, currentY: -2, radius: 0, stepUp: .5, stepDown: .5, allowStepTransition: false, fallbackY: -3 })).toBeCloseTo(visibleTop, 6);
      // Losing registration reproduces the old hovering bug on the same bounds.
      const oldHeight = getSupportHeightAt(box.clone(), x, z, 0);
      expect(oldHeight).not.toBeNull();
      if (oldHeight === null) throw new Error("Missing original AABB support");
      expect(oldHeight - visibleTop).toBeGreaterThan(.2);
      const water = new WaterVolumes();
      water.setBoxes([{ min: { x: -5, y: -5, z: 45 }, max: { x: 5, y: 1, z: 55 } }]);
      water.setDrySupports([box]);
      expect(water.isIn(x, visibleTop, z)).toBe(false);
      water.setDrySupports([box.clone()]);
      expect(water.isIn(x, visibleTop, z)).toBe(true);
    } finally { dispose(); }
  });

  it("rejects empty rotated AABB corners but permits finite edge-foot overlap", () => {
    const { root, rig, box, dispose } = fixture();
    try {
      root.rotation.y = Math.PI / 4;
      rig.update();
      const x = box.min.x + .02, z = box.min.z + .02;
      expect(getSupportHeightAt(box.clone(), x, z, 0)).not.toBeNull();
      expect(getSupportHeightAt(box, x, z, .28)).toBeNull();
      const beyond = new THREE.Vector3(2.1, .05, 0).applyMatrix4(root.matrixWorld);
      expect(getSupportHeightAt(box, beyond.x, beyond.z, 0)).toBeNull();
      expect(getSupportHeightAt(box, beyond.x, beyond.z, .28)).toBeCloseTo(beyond.y, 6);
    } finally { dispose(); }
  });

  it("carries a supported local contact exactly once and leaves a high airborne body alone", () => {
    const { root, rig, dispose } = fixture();
    try {
      const local = new THREE.Vector3(.7, .05, -.2);
      const previous = local.clone().applyMatrix4(root.matrixWorld);
      root.position.add(new THREE.Vector3(.03, .04, -.02));
      root.rotation.set(.04, 0, .06);
      rig.update();
      const expected = local.clone().applyMatrix4(root.matrixWorld);
      const delta = new THREE.Vector3();
      expect(rig.carryDelta(previous.x, previous.y, previous.z, delta)).toBe(true);
      expect(previous.clone().add(delta).distanceTo(expected)).toBeLessThan(1e-6);
      expect(rig.carryDelta(previous.x, previous.y + .5, previous.z, delta)).toBe(false);
      expect(delta.length()).toBe(0);
    } finally { dispose(); }
  });
});
