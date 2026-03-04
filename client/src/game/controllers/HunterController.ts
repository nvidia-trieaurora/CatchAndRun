import * as THREE from "three";
import type { InputManager } from "../../input/InputManager";
import type { ClientConfig } from "../../config/ClientConfig";
import { HUNTER_SPEED } from "@catch-and-run/shared";

const RADIUS = 0.35;
const EYE_H = 1.6;
const CROUCH_EYE_H = 0.9;
const BODY_H = 1.8;
const CROUCH_BODY_H = 1.1;
const GROUND_Y = 0.0;
const STEP_UP = 0.55;
const CROUCH_SPEED = 0.45;

export class HunterController {
  private camera: THREE.PerspectiveCamera;
  private input: InputManager;
  private config: ClientConfig;

  private euler = new THREE.Euler(0, 0, 0, "YXZ");
  private velocity = new THREE.Vector3();
  private position = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private feetY = 0;

  private speed = HUNTER_SPEED;
  private gravity = -28;
  private jumpSpeed = 13;
  private onGround = true;
  private verticalVelocity = 0;
  private isCrouching = false;
  private currentEyeH = EYE_H;
  private smoothFeetY = 0;

  private bobTimer = 0;

  constructor(camera: THREE.PerspectiveCamera, input: InputManager, config: ClientConfig) {
    this.camera = camera;
    this.input = input;
    this.config = config;
    // Don't copy camera position -- wait for setPosition call
    this.position.set(0, EYE_H, 0);
    this.feetY = 0;
    this.smoothFeetY = 0;
  }

  update(dt: number, colliders: THREE.Box3[]): THREE.Vector3 {
    if (!this.input.isPointerLocked()) return this.position;

    const sens = this.config.get().sensitivity;
    const mouseDelta = this.input.consumeMouseDelta();
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= mouseDelta.x * sens;
    this.euler.x -= mouseDelta.y * sens;
    this.euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);

    const state = this.input.getState();

    // Crouch
    this.isCrouching = state.crouch;
    const targetEye = this.isCrouching ? CROUCH_EYE_H : EYE_H;
    this.currentEyeH += (targetEye - this.currentEyeH) * Math.min(1, dt * 12);

    const bodyH = this.isCrouching ? CROUCH_BODY_H : BODY_H;
    const moveSpeed = this.isCrouching ? this.speed * CROUCH_SPEED : this.speed;

    // Movement direction
    this.direction.set(0, 0, 0);
    if (state.forward) this.direction.z -= 1;
    if (state.backward) this.direction.z += 1;
    if (state.left) this.direction.x -= 1;
    if (state.right) this.direction.x += 1;
    if (this.direction.lengthSq() > 0) this.direction.normalize();

    this.velocity.copy(this.direction);
    this.velocity.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.euler.y, 0)));
    this.velocity.multiplyScalar(moveSpeed * dt);

    // Update feet position
    this.feetY = this.position.y - this.currentEyeH;

    // Move with slide collision (substeps to prevent tunneling)
    const dx = this.velocity.x, dz = this.velocity.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const MAX_STEP = RADIUS;
    if (dist <= MAX_STEP) {
      this.moveAndSlide(dx, dz, colliders, bodyH);
    } else {
      const steps = Math.ceil(dist / MAX_STEP);
      const sx = dx / steps, sz = dz / steps;
      for (let i = 0; i < steps; i++) this.moveAndSlide(sx, sz, colliders, bodyH);
    }

    // Jump
    if (state.jump && this.onGround && !this.isCrouching) {
      this.verticalVelocity = this.jumpSpeed;
      this.onGround = false;
    }

    // Gravity
    this.verticalVelocity += this.gravity * dt;
    this.position.y += this.verticalVelocity * dt;
    this.feetY = this.position.y - this.currentEyeH;

    // Ceiling collision (prevent jumping through roofs)
    if (this.verticalVelocity > 0) {
      const ceiling = this.findCeiling(colliders, bodyH);
      if (ceiling !== null) {
        const maxEyeY = ceiling - (bodyH - this.currentEyeH);
        if (this.position.y > maxEyeY) {
          this.position.y = maxEyeY;
          this.feetY = this.position.y - this.currentEyeH;
          this.verticalVelocity = 0;
        }
      }
    }

    // Ground
    const ground = this.findGround(colliders);
    const eyeGround = ground + this.currentEyeH;
    if (this.position.y <= eyeGround) {
      const targetFeetY = ground;
      const heightDiff = targetFeetY - this.smoothFeetY;
      
      if (heightDiff > 0.05 && heightDiff < STEP_UP + 0.2) {
        this.smoothFeetY += heightDiff * Math.min(1, dt * 20);
      } else {
        this.smoothFeetY = targetFeetY;
      }
      
      this.feetY = targetFeetY;
      this.position.y = this.smoothFeetY + this.currentEyeH;
      this.verticalVelocity = 0;
      this.onGround = true;
    }

    // Unstuck - only push horizontally, skip vertical to avoid roof jitter
    this.pushOutHorizontal(colliders, bodyH);

    // Head bob
    const isMoving = this.direction.lengthSq() > 0 && this.onGround;
    if (isMoving) {
      const bobSpd = this.isCrouching ? 7 : 12;
      const bobAmt = this.isCrouching ? 0.015 : 0.035;
      this.bobTimer += dt * bobSpd;
      this.camera.position.set(
        this.position.x + Math.cos(this.bobTimer * 0.5) * bobAmt * 0.5,
        this.position.y + Math.sin(this.bobTimer) * bobAmt,
        this.position.z
      );
    } else {
      this.bobTimer = 0;
      this.camera.position.copy(this.position);
    }

    return this.position.clone();
  }

  private moveAndSlide(dx: number, dz: number, colliders: THREE.Box3[], bodyH: number) {
    // Try full movement first
    this.position.x += dx;
    this.position.z += dz;
    if (!this.isColliding(colliders, bodyH)) return;

    // Try X only
    this.position.z -= dz;
    if (!this.isColliding(colliders, bodyH)) {
      // Slide along X axis only
      return;
    }

    // Try Z only
    this.position.x -= dx;
    this.position.z += dz;
    if (!this.isColliding(colliders, bodyH)) {
      // Slide along Z axis only
      return;
    }

    // Try reduced diagonal (helps with corner stuttering)
    this.position.z -= dz;
    this.position.x += dx * 0.5;
    this.position.z += dz * 0.5;
    if (!this.isColliding(colliders, bodyH)) return;

    // Fully blocked
    this.position.x -= dx * 0.5;
    this.position.z -= dz * 0.5;
  }

  private isColliding(colliders: THREE.Box3[], bodyH: number): boolean {
    const box = new THREE.Box3(
      new THREE.Vector3(this.position.x - RADIUS, this.feetY + STEP_UP, this.position.z - RADIUS),
      new THREE.Vector3(this.position.x + RADIUS, this.feetY + bodyH, this.position.z + RADIUS)
    );
    for (const c of colliders) {
      if (box.intersectsBox(c)) return true;
    }
    return false;
  }

  private findGround(colliders: THREE.Box3[]): number {
    let best = GROUND_Y;
    // Wider probe with more generous height tolerance for smoother stair climbing
    const probe = new THREE.Box3(
      new THREE.Vector3(this.position.x - RADIUS * 0.8, this.feetY - 0.3, this.position.z - RADIUS * 0.8),
      new THREE.Vector3(this.position.x + RADIUS * 0.8, this.feetY + STEP_UP + 0.1, this.position.z + RADIUS * 0.8)
    );
    for (const c of colliders) {
      if (probe.intersectsBox(c) && c.max.y > best && c.max.y <= this.feetY + STEP_UP + 0.35) {
        best = c.max.y;
      }
    }
    return best;
  }

  private findCeiling(colliders: THREE.Box3[], bodyH: number): number | null {
    const headY = this.feetY + bodyH;
    const probe = new THREE.Box3(
      new THREE.Vector3(this.position.x - RADIUS * 0.6, headY, this.position.z - RADIUS * 0.6),
      new THREE.Vector3(this.position.x + RADIUS * 0.6, headY + 1.0, this.position.z + RADIUS * 0.6)
    );
    let lowestCeiling: number | null = null;
    for (const c of colliders) {
      if (probe.intersectsBox(c) && c.min.y >= headY - 0.1) {
        if (lowestCeiling === null || c.min.y < lowestCeiling) {
          lowestCeiling = c.min.y;
        }
      }
    }
    return lowestCeiling;
  }

  private pushOutHorizontal(colliders: THREE.Box3[], bodyH: number) {
    // Only check body above step-up height to avoid fighting with findGround
    const box = new THREE.Box3(
      new THREE.Vector3(this.position.x - RADIUS, this.feetY + STEP_UP + 0.05, this.position.z - RADIUS),
      new THREE.Vector3(this.position.x + RADIUS, this.feetY + bodyH, this.position.z + RADIUS)
    );

    for (const c of colliders) {
      if (!box.intersectsBox(c)) continue;

      const ox1 = box.max.x - c.min.x;
      const ox2 = c.max.x - box.min.x;
      const oz1 = box.max.z - c.min.z;
      const oz2 = c.max.z - box.min.z;
      const overlapX = Math.min(ox1, ox2);
      const overlapZ = Math.min(oz1, oz2);

      if (overlapX <= overlapZ) {
        if (ox1 < ox2) this.position.x -= ox1 + 0.02;
        else this.position.x += ox2 + 0.02;
      } else {
        if (oz1 < oz2) this.position.z -= oz1 + 0.02;
        else this.position.z += oz2 + 0.02;
      }

      this.feetY = this.position.y - this.currentEyeH;
      box.min.set(this.position.x - RADIUS, this.feetY + STEP_UP + 0.05, this.position.z - RADIUS);
      box.max.set(this.position.x + RADIUS, this.feetY + bodyH, this.position.z + RADIUS);
    }
  }

  getIsCrouching(): boolean { return this.isCrouching; }

  setPosition(x: number, y: number, z: number) {
    this.position.set(x, y + EYE_H, z);
    this.feetY = y;
    this.smoothFeetY = y;
    this.verticalVelocity = 0;
    this.onGround = true;
    this.camera.position.copy(this.position);
  }

  getRotation(): { x: number; y: number } {
    return { x: this.euler.x, y: this.euler.y };
  }

  getForwardDirection(): THREE.Vector3 {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);
    return dir.normalize();
  }

  getPosition(): THREE.Vector3 { return this.position.clone(); }
}
