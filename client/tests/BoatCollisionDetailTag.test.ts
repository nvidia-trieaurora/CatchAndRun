import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BoatCollisionRig } from "../src/game/world/zones/BoatCollisionRig";
import { WaterVolumes } from "../src/game/controllers/WaterSwim";

describe("render-only boat fittings", () => {
  it.each(["mesh", "group"] as const)("%s decoration never creates a dry floor; removing its tag exposes the phantom support", (tagLocation) => {
    const root = new THREE.Group();
    root.name = "RIG_FERRIS_HARBOR_BOAT_FIXTURE";
    root.userData.ambientMotion = "boat-fixture";
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    cargo.position.set(0, -.5, 50);
    root.add(cargo);
    const decoration = new THREE.Mesh(new THREE.BoxGeometry(1, .1, 1), new THREE.MeshBasicMaterial());
    decoration.position.set(0, -1.25, 54);
    const group = new THREE.Group();
    group.add(decoration);
    root.add(group);
    const tagged = tagLocation === "mesh" ? decoration : group;
    tagged.userData.boatDetailOnly = true;
    root.updateMatrixWorld(true);
    const rig = new BoatCollisionRig([root]);
    expect(rig.colliders).toHaveLength(1);
    expect(rig.colliders[0].max.y).toBeCloseTo(0, 5);
    const water = new WaterVolumes();
    water.setBoxes([{ min: { x: -10, y: -10, z: 48 }, max: { x: 10, y: 1, z: 60 } }]);
    water.setDrySupports(rig.colliders);
    expect(water.isIn(0, -1.2, 54)).toBe(true);

    delete tagged.userData.boatDetailOnly;
    const unsafe = new BoatCollisionRig([root]);
    expect(unsafe.colliders).toHaveLength(2);
    water.setDrySupports(unsafe.colliders);
    expect(water.isIn(0, -1.2, 54)).toBe(false);
    cargo.geometry.dispose(); cargo.material.dispose();
    decoration.geometry.dispose(); decoration.material.dispose();
  });
});
