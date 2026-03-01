import * as THREE from "three";
import type { InputManager } from "../../input/InputManager";

export class SpectatorController {
  private camera: THREE.PerspectiveCamera;
  private input: InputManager;
  private euler = new THREE.Euler(0, 0, 0, "YXZ");
  private position = new THREE.Vector3(0, 10, 0);
  private speed = 10;

  constructor(camera: THREE.PerspectiveCamera, input: InputManager) {
    this.camera = camera;
    this.input = input;
    this.position.copy(camera.position);
  }

  update(dt: number) {
    if (!this.input.isPointerLocked()) return;

    const mouseDelta = this.input.consumeMouseDelta();
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= mouseDelta.x * 0.002;
    this.euler.x -= mouseDelta.y * 0.002;
    this.euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);

    const dir = new THREE.Vector3();
    const state = this.input.getState();

    if (state.forward) dir.z -= 1;
    if (state.backward) dir.z += 1;
    if (state.left) dir.x -= 1;
    if (state.right) dir.x += 1;
    if (state.jump) dir.y += 1;

    if (dir.lengthSq() > 0) {
      dir.normalize();
      dir.applyQuaternion(this.camera.quaternion);
      this.position.addScaledVector(dir, this.speed * dt);
    }

    this.camera.position.copy(this.position);
  }

  setPosition(x: number, y: number, z: number) {
    this.position.set(x, y, z);
    this.camera.position.copy(this.position);
  }
}
