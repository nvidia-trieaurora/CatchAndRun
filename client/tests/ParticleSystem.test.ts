import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ParticleSystem } from "../src/game/systems/ParticleSystem";

describe("ParticleSystem grenade effects", () => {
  it("waits for the authoritative server explosion instead of duplicating it locally", () => {
    const scene = new THREE.Scene();
    const particles = new ParticleSystem(scene);
    const explosionSpy = vi.spyOn(particles, "spawnExplosion");

    particles.spawnGrenade(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(1, 0, 0),
      0.1,
    );
    particles.update(0.2);

    expect(explosionSpy).not.toHaveBeenCalled();
    particles.dispose();
  });

  it("renders translucent blast particles without writing a black depth region", () => {
    const scene = new THREE.Scene();
    const particles = new ParticleSystem(scene);

    particles.spawnExplosion(new THREE.Vector3(0, 0, 0));

    const visibleBasicMaterials = scene.children
      .filter((object): object is THREE.Mesh => object instanceof THREE.Mesh && object.visible)
      .map((mesh) => mesh.material)
      .filter((material): material is THREE.MeshBasicMaterial =>
        material instanceof THREE.MeshBasicMaterial,
      );
    expect(visibleBasicMaterials.length).toBeGreaterThan(0);
    expect(visibleBasicMaterials.every((material) => !material.depthWrite)).toBe(true);
    particles.dispose();
  });
});
