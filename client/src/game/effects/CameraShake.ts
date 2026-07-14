import * as THREE from "three";

/**
 * Trauma-based camera shake. Applied additively to camera rotation each
 * frame AFTER controllers update (controllers overwrite rotation from input
 * state every frame, so the offset never accumulates).
 */
export class CameraShake {
  private trauma = 0;
  private time = 0;

  add(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    if (this.trauma <= 0) return;
    this.time += dt * 30;
    const shake = this.trauma * this.trauma;
    camera.rotation.x += 0.015 * shake * (Math.cos(this.time * 1.7) + Math.sin(this.time * 2.3) * 0.5);
    camera.rotation.y += 0.015 * shake * (Math.sin(this.time * 1.3) + Math.sin(this.time * 2.7) * 0.5);
    camera.rotation.z += 0.008 * shake * Math.sin(this.time * 2.1);
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
  }
}
