import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  configureFirstPersonViewmodel,
  FIRST_PERSON_RENDER_ORDER,
} from "../src/game/rendering/FirstPersonViewmodel";

describe("first-person viewmodel render contract", () => {
  it("places opaque viewmodel materials after transparent world surfaces", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    root.add(mesh);

    configureFirstPersonViewmodel(root);

    expect(mesh.renderOrder).toBe(FIRST_PERSON_RENDER_ORDER);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(1);
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
  });

  it("preserves a higher muzzle-flash order and configures material arrays", () => {
    const root = new THREE.Group();
    const materials = [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshStandardMaterial(),
    ];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), materials);
    mesh.renderOrder = FIRST_PERSON_RENDER_ORDER + 1;
    root.add(mesh);

    configureFirstPersonViewmodel(root);

    expect(mesh.renderOrder).toBe(FIRST_PERSON_RENDER_ORDER + 1);
    for (const material of materials) {
      expect(material.transparent).toBe(true);
      expect(material.depthTest).toBe(false);
      expect(material.depthWrite).toBe(false);
    }
  });
});
