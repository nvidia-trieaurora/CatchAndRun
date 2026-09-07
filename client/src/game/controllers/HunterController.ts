import * as THREE from "three";
import type { InputManager } from "../../input/InputManager";
import type { ClientConfig } from "../../config/ClientConfig";
import {
  HUNTER_AIM_SPEED_MULTIPLIER,
  HUNTER_SPEED,
} from "@catch-and-run/shared";
import {
  dampGroundVisual,
  findGroundSurface,
  shouldResolveGround,
  STAIR_STEP_DOWN,
} from "./GroundCollision";
import { LadderClimber, type LadderInput, type LadderVolume } from "./LadderClimb";

const RADIUS = 0.35;
const LADDER_HOP_SPEED = 4.5;
const EYE_H = 1.6;
const CROUCH_EYE_H = 0.9;
const BODY_H = 1.8;
const CROUCH_BODY_H = 1.1;
const GROUND_Y = 0.0;
const STEP_UP = 0.55;
const CROUCH_SPEED = 0.45;
const STAIR_VISUAL_SMOOTHING = 22;

export function getHunterMovementSpeed(isBoosted: boolean, isAiming: boolean): number {
  if (isAiming) return HUNTER_SPEED * HUNTER_AIM_SPEED_MULTIPLIER;
  return isBoosted ? HUNTER_SPEED * 2 : HUNTER_SPEED;
}

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
  private jumpSpeed = 11.5;
  private onGround = true;
  private verticalVelocity = 0;
  private isCrouching = false;
  private currentEyeH = EYE_H;
  private smoothFeetY = 0;
  private movementBounds = {
    minX: -54,
    maxX: 62,
    minZ: -42,
    maxZ: 46,
  };

  private bobTimer = 0;
  private readonly ladder = new LadderClimber();

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
    this.euler.z = 0; // the climb sway rolls the camera per frame; never accumulate it
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

    // Ladders: grab when walking into a rung column, then climb instead of
    // running the swept move / gravity passes for this frame.
    const ladderInput: LadderInput = {
      forward: state.forward,
      backward: state.backward,
      jump: state.jump,
      moveX: this.velocity.x,
      moveZ: this.velocity.z,
    };
    if (!this.ladder.isClimbing()) {
      this.ladder.tick(dt);
      if (
        !this.isCrouching
        && this.ladder.tryGrab(this.position.x, this.feetY, this.position.z, RADIUS, ladderInput)
      ) {
        this.verticalVelocity = 0;
        this.onGround = false;
      }
    }
    if (this.ladder.isClimbing()) {
      this.updateClimb(dt, ladderInput);
      return this.position.clone();
    }

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

    const wasGrounded = this.onGround;
    let jumped = false;

    // Jump
    if (state.jump && this.onGround && !this.isCrouching) {
      this.smoothFeetY = this.feetY;
      this.verticalVelocity = this.jumpSpeed;
      this.onGround = false;
      jumped = true;
    }

    // Gravity
    const previousFeetY = this.feetY;
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

    // Ground and stairs. Physics snaps to the supporting tread immediately;
    // only the camera height is damped, so jump sweeps never start inside a step.
    const allowStepTransition = wasGrounded && !jumped;
    const ground = findGroundSurface(colliders, {
      x: this.position.x,
      z: this.position.z,
      currentY: this.feetY,
      previousY: previousFeetY,
      radius: RADIUS * 0.8,
      stepUp: STEP_UP,
      stepDown: STAIR_STEP_DOWN,
      allowStepTransition,
      fallbackY: GROUND_Y,
    });
    if (shouldResolveGround(
      ground,
      this.feetY,
      previousFeetY,
      this.verticalVelocity,
      allowStepTransition,
      STEP_UP,
      STAIR_STEP_DOWN,
    )) {
      this.feetY = ground;
      this.position.y = ground + this.currentEyeH;
      this.smoothFeetY = dampGroundVisual(
        this.smoothFeetY,
        ground,
        dt,
        STAIR_VISUAL_SMOOTHING,
      );
      this.verticalVelocity = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
      this.smoothFeetY = this.feetY;
    }

    // Unstuck - only push horizontally, skip vertical to avoid roof jitter
    this.pushOutHorizontal(colliders, bodyH);
    this.clampToBounds();

    // Head bob
    const isMoving = this.direction.lengthSq() > 0 && this.onGround;
    const visualEyeY = this.smoothFeetY + this.currentEyeH;
    if (isMoving) {
      const bobSpd = this.isCrouching ? 7 : 12;
      const bobAmt = this.isCrouching ? 0.015 : 0.035;
      this.bobTimer += dt * bobSpd;
      this.camera.position.set(
        this.position.x + Math.cos(this.bobTimer * 0.5) * bobAmt * 0.5,
        visualEyeY + Math.sin(this.bobTimer) * bobAmt,
        this.position.z
      );
    } else {
      this.bobTimer = 0;
      this.camera.position.set(this.position.x, visualEyeY, this.position.z);
    }

    return this.position.clone();
  }

  private updateClimb(dt: number, input: LadderInput) {
    const feet = new THREE.Vector3(this.position.x, this.feetY, this.position.z);
    const result = this.ladder.step(dt, input, feet, RADIUS);
    this.position.x = feet.x;
    this.position.z = feet.z;
    this.feetY = feet.y;
    this.clampToBounds();
    this.position.y = this.feetY + this.currentEyeH;
    this.smoothFeetY = this.feetY;
    if (result.detached) {
      this.onGround = result.landed;
      this.verticalVelocity = result.hop ? LADDER_HOP_SPEED : 0;
    } else {
      this.onGround = false;
      this.verticalVelocity = 0;
    }

    // Rung-synchronised sway: lateral drift across the ladder, a small
    // vertical bob and a touch of roll, all reset when the climb ends.
    this.bobTimer = 0;
    const visual = this.ladder.getVisual();
    this.camera.position.set(
      this.position.x + visual.x,
      this.smoothFeetY + this.currentEyeH + visual.y,
      this.position.z + visual.z,
    );
    if (visual.roll !== 0) this.camera.rotateZ(visual.roll);
  }

  /** Vertical ladders detected from the map colliders (see `detectLadderVolumes`). */
  setLadders(ladders: readonly LadderVolume[]) {
    this.ladder.setLadders(ladders);
  }

  isClimbingLadder(): boolean {
    return this.ladder.isClimbing();
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

  private findCeiling(colliders: THREE.Box3[], bodyH: number): number | null {
    const headY = this.feetY + bodyH;
    const vUp = Math.max(2.5, this.verticalVelocity * 0.3);
    const probe = new THREE.Box3(
      new THREE.Vector3(this.position.x - RADIUS, headY - 0.1, this.position.z - RADIUS),
      new THREE.Vector3(this.position.x + RADIUS, headY + vUp, this.position.z + RADIUS)
    );
    let lowestCeiling: number | null = null;
    for (const c of colliders) {
      if (!probe.intersectsBox(c)) continue;
      const slabThickness = c.max.y - c.min.y;
      if (slabThickness < 0.08) continue;
      if (c.min.y >= headY - 0.3) {
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

  setMovementTuning(speed: number, jumpSpeed: number) {
    this.speed = speed;
    this.jumpSpeed = jumpSpeed;
  }

  setMovementBounds(minX: number, maxX: number, minZ: number, maxZ: number) {
    this.movementBounds = { minX, maxX, minZ, maxZ };
  }

  private clampToBounds() {
    this.position.x = Math.max(
      this.movementBounds.minX,
      Math.min(this.movementBounds.maxX, this.position.x),
    );
    this.position.z = Math.max(
      this.movementBounds.minZ,
      Math.min(this.movementBounds.maxZ, this.position.z),
    );
  }

  setPosition(x: number, y: number, z: number) {
    this.ladder.release();
    this.position.set(x, y + EYE_H, z);
    this.feetY = y;
    this.smoothFeetY = y;
    this.verticalVelocity = 0;
    this.onGround = true;
    this.camera.position.copy(this.position);
  }

  setRotation(pitch: number, yaw: number) {
    this.euler.set(pitch, yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(this.euler);
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

  translatePosition(dx: number, dy: number) {
    this.position.x += dx;
    this.position.y += dy;
    this.feetY += dy;
    this.smoothFeetY += dy;
  }
}
