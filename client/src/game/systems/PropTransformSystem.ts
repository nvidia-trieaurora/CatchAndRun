import * as THREE from "three";
import type { PropRegistry } from "../world/PropRegistry";

export class PropTransformSystem {
  private scene: THREE.Scene;
  private registry: PropRegistry;
  private currentMesh: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene, registry: PropRegistry) {
    this.scene = scene;
    this.registry = registry;
  }

  transform(propId: string, position: THREE.Vector3): THREE.Mesh | null {
    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      this.currentMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else if (child.material) {
            child.material.dispose();
          }
        }
      });
      this.currentMesh = null;
    }

    const mesh = this.registry.createMesh(propId);
    if (!mesh) return null;

    mesh.position.copy(position);
    this.scene.add(mesh);
    this.currentMesh = mesh;
    return mesh;
  }

  getCurrentMesh(): THREE.Mesh | null {
    return this.currentMesh;
  }

  dispose() {
    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      this.currentMesh.geometry.dispose();
      (this.currentMesh.material as THREE.Material).dispose();
      this.currentMesh = null;
    }
  }
}
