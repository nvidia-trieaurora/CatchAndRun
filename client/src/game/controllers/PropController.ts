import * as THREE from "three";
import type { InputManager } from "../../input/InputManager";
import type { ClientConfig } from "../../config/ClientConfig";
import { PROP_SPEED } from "@catch-and-run/shared";
import {
  dampGroundVisual,
  findGroundSurface,
  shouldResolveGround,
  STAIR_STEP_DOWN,
} from "./GroundCollision";
import { LadderClimber, type LadderInput, type LadderVolume } from "./LadderClimb";

const RADIUS = 0.35;
const LADDER_HOP_SPEED = 4.5;
const HEIGHT = 0.9;
const GROUND_Y = 0.0;
const STEP_UP = 0.55;
const EYE_HEIGHT = 0.7;
const THIRD_PERSON_DIST = 4.5;
const THIRD_PERSON_HEIGHT = 2.0;
const PITCH_MIN = -80 * THREE.MathUtils.DEG2RAD;
const PITCH_MAX = 80 * THREE.MathUtils.DEG2RAD;
const SMOOTH_K = 25;
const STAIR_VISUAL_SMOOTHING = 22;

export class PropController {
  private camera: THREE.PerspectiveCamera;
  private input: InputManager;
  private config: ClientConfig;
  private propMesh: THREE.Mesh | null = null;

  private position = new THREE.Vector3();
  private speed = PROP_SPEED;
  private isLocked = false;

  // Rotation state (raw accumulated targets)
  private targetYaw = 0;
  private targetPitch = 0;
  // Smoothed rotation (rendered)
  private currentYaw = 0;
  private currentPitch = 0;

  // Movement
  private verticalVelocity = 0;
  private gravity = -28;
  private jumpSpeed = 11.5;
  private onGround = true;
  private moveDir = new THREE.Vector3();
  private smoothY = 0;
  private movementBounds = {
    minX: -54,
    maxX: 62,
    minZ: -42,
    maxZ: 46,
  };

  // Camera mode
  private thirdPerson = true;

  private readonly ladder = new LadderClimber();

  // Soul mode (out-of-body)
  private inSoulMode = false;
  private soulPosition = new THREE.Vector3();
  private soulEuler = new THREE.Euler(0, 0, 0, "YXZ");
  private soulSpeed = 12;
  private soulTogglePressed = false;

  constructor(camera: THREE.PerspectiveCamera, input: InputManager, config: ClientConfig) {
    this.camera = camera;
    this.input = input;
    this.config = config;
  }

  private colliders: THREE.Box3[] = [];

  update(dt: number, colliders: THREE.Box3[]): THREE.Vector3 {
    this.colliders = colliders;
    if (!this.input.isPointerLocked()) return this.position.clone();

    const sens = this.config.get().sensitivity;
    const mouseDelta = this.input.consumeMouseDelta();

    const inputState = this.input.getState();
    if (inputState.soulMode && !this.soulTogglePressed) {
      this.soulTogglePressed = true;
      this.inSoulMode = !this.inSoulMode;
      if (this.inSoulMode) {
        this.soulPosition.copy(this.position).add(new THREE.Vector3(0, 2, 0));
        this.soulEuler.set(this.currentPitch, this.currentYaw, 0);
        if (this.propMesh) this.propMesh.visible = true;
      }
    }
    if (!inputState.soulMode) this.soulTogglePressed = false;

    if (this.inSoulMode) {
      this.soulEuler.y -= mouseDelta.x * sens;
      this.soulEuler.x -= mouseDelta.y * sens;
      this.soulEuler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.soulEuler.x));
      this.camera.quaternion.setFromEuler(this.soulEuler);

      const dir = new THREE.Vector3();
      if (inputState.forward) dir.z -= 1;
      if (inputState.backward) dir.z += 1;
      if (inputState.left) dir.x -= 1;
      if (inputState.right) dir.x += 1;
      if (inputState.jump) dir.y += 1;
      if (inputState.crouch) dir.y -= 1;

      if (dir.lengthSq() > 0) {
        dir.normalize();
        dir.applyQuaternion(this.camera.quaternion);
        this.soulPosition.addScaledVector(dir, this.soulSpeed * dt);
      }

      this.camera.position.copy(this.soulPosition);
      return this.position.clone();
    }

    // Normal mouse look
    this.targetYaw -= mouseDelta.x * sens;
    this.targetPitch -= mouseDelta.y * sens;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, PITCH_MIN, PITCH_MAX);

    // Smooth rotation
    const smoothFactor = 1 - Math.exp(-SMOOTH_K * dt);
    this.currentYaw += (this.targetYaw - this.currentYaw) * smoothFactor;
    this.currentPitch += (this.targetPitch - this.currentPitch) * smoothFactor;

    if (this.isLocked) {
      this.updateCamera();
      return this.position.clone();
    }

    // --- WASD movement relative to camera yaw ---
    const state = this.input.getState();
    this.moveDir.set(0, 0, 0);
    if (state.forward) this.moveDir.z -= 1;
    if (state.backward) this.moveDir.z += 1;
    if (state.left) this.moveDir.x -= 1;
    if (state.right) this.moveDir.x += 1;

    if (this.moveDir.lengthSq() > 0) {
      this.moveDir.normalize();
      // Rotate movement by yaw only (not pitch)
      this.moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.currentYaw);
    }

    // Move with slide collision
    const moveX = this.moveDir.x * this.speed * dt;
    const moveZ = this.moveDir.z * this.speed * dt;

    // Ladders: grab when pushing into a rung column, then climb instead of
    // the swept move / gravity passes for this frame.
    const ladderInput: LadderInput = {
      forward: state.forward,
      backward: state.backward,
      jump: state.jump,
      moveX,
      moveZ,
    };
    if (!this.ladder.isClimbing()) {
      this.ladder.tick(dt);
      if (this.ladder.tryGrab(this.position.x, this.position.y, this.position.z, RADIUS, ladderInput)) {
        this.verticalVelocity = 0;
        this.onGround = false;
      }
    }
    if (this.ladder.isClimbing()) {
      this.updateClimb(dt, ladderInput);
      return this.position.clone();
    }

    const distance = Math.hypot(moveX, moveZ);
    const maxStep = RADIUS;
    const steps = Math.max(1, Math.ceil(distance / maxStep));
    for (let i = 0; i < steps; i++) {
      this.moveAndSlide(moveX / steps, moveZ / steps, colliders);
    }

    const wasGrounded = this.onGround;
    let jumped = false;

    // Jump
    if (state.jump && this.onGround) {
      this.smoothY = this.position.y;
      this.verticalVelocity = this.jumpSpeed;
      this.onGround = false;
      jumped = true;
    }

    // Gravity
    const previousY = this.position.y;
    this.verticalVelocity += this.gravity * dt;
    this.position.y += this.verticalVelocity * dt;

    // Ceiling collision
    if (this.verticalVelocity > 0) {
      const ceiling = this.findCeiling(colliders);
      if (ceiling !== null && this.position.y + HEIGHT > ceiling) {
        this.position.y = ceiling - HEIGHT;
        this.verticalVelocity = 0;
      }
    }

    const allowStepTransition = wasGrounded && !jumped;
    const ground = findGroundSurface(colliders, {
      x: this.position.x,
      z: this.position.z,
      currentY: this.position.y,
      previousY,
      radius: RADIUS * 0.8,
      stepUp: STEP_UP,
      stepDown: STAIR_STEP_DOWN,
      allowStepTransition,
      fallbackY: GROUND_Y,
    });
    if (shouldResolveGround(
      ground,
      this.position.y,
      previousY,
      this.verticalVelocity,
      allowStepTransition,
      STEP_UP,
      STAIR_STEP_DOWN,
    )) {
      this.position.y = ground;
      this.smoothY = dampGroundVisual(
        this.smoothY,
        ground,
        dt,
        STAIR_VISUAL_SMOOTHING,
      );
      this.verticalVelocity = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
      this.smoothY = this.position.y;
    }

    this.pushOutHorizontal(colliders);
    this.clampToBounds();

    // Update prop mesh: only yaw rotation (no pitch/roll)
    if (this.propMesh) {
      this.propMesh.position.set(this.position.x, this.smoothY, this.position.z);
      this.propMesh.rotation.set(0, this.currentYaw, 0);
    }

    this.updateCamera();
    return this.position.clone();
  }

  private updateClimb(dt: number, input: LadderInput) {
    const result = this.ladder.step(dt, input, this.position, RADIUS);
    this.clampToBounds();
    this.smoothY = this.position.y;
    if (result.detached) {
      this.onGround = result.landed;
      this.verticalVelocity = result.hop ? LADDER_HOP_SPEED : 0;
    } else {
      this.onGround = false;
      this.verticalVelocity = 0;
    }

    // The prop shimmies up the rungs: lateral sway, vertical bob and a little
    // roll, all driven by the climb phase so it stops when the climb stops.
    if (this.propMesh) {
      const visual = this.ladder.getVisual();
      this.propMesh.position.set(
        this.position.x + visual.x,
        this.smoothY + visual.y + Math.sin(Math.PI * visual.mantle) * 0.08,
        this.position.z + visual.z,
      );
      this.propMesh.rotation.set(0, this.currentYaw, visual.roll * 2.5);
    }
    this.updateCamera();
  }

  /** Vertical ladders detected from the map colliders (see `detectLadderVolumes`). */
  setLadders(ladders: readonly LadderVolume[]) {
    this.ladder.setLadders(ladders);
  }

  isClimbingLadder(): boolean {
    return this.ladder.isClimbing();
  }

  private updateCamera() {
    const visualY = this.smoothY;
    if (this.thirdPerson) {
      const camYaw = this.currentYaw;
      const camPitch = this.currentPitch;

      const dist = THIRD_PERSON_DIST;
      const offX = Math.sin(camYaw) * dist * Math.cos(camPitch);
      const offZ = Math.cos(camYaw) * dist * Math.cos(camPitch);
      const offY = THIRD_PERSON_HEIGHT - Math.sin(camPitch) * dist * 0.6;

      const targetX = this.position.x + offX;
      const targetY = visualY + Math.max(1.0, offY);
      const targetZ = this.position.z + offZ;

      const lookAt = new THREE.Vector3(
        this.position.x,
        visualY + EYE_HEIGHT,
        this.position.z,
      );
      const camPos = new THREE.Vector3(targetX, targetY, targetZ);

      const clipped = this.clipCameraToWalls(lookAt, camPos);
      const clippedDist = clipped.distanceTo(lookAt);

      if (clippedDist < 1.2) {
        // Too close to wall/tree -- switch to over-shoulder view to avoid glitching
        const shoulderOff = 0.4;
        this.camera.position.set(
          this.position.x + Math.sin(camYaw) * shoulderOff,
          visualY + EYE_HEIGHT + 0.3,
          this.position.z + Math.cos(camYaw) * shoulderOff
        );
        this.camera.lookAt(
          this.position.x - Math.sin(camYaw) * 2,
          visualY + EYE_HEIGHT,
          this.position.z - Math.cos(camYaw) * 2
        );
      } else {
        this.camera.position.copy(clipped);
        this.camera.lookAt(lookAt);
      }
    } else {
      this.camera.position.set(
        this.position.x,
        visualY + EYE_HEIGHT,
        this.position.z
      );
      const q = new THREE.Quaternion();
      const euler = new THREE.Euler(this.currentPitch, this.currentYaw, 0, "YXZ");
      q.setFromEuler(euler);
      this.camera.quaternion.copy(q);
    }
  }

  private clipCameraToWalls(origin: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
    const dir = new THREE.Vector3().subVectors(target, origin);
    const maxDist = dir.length();
    if (maxDist < 0.01) return target;
    dir.normalize();

    let closestDist = maxDist;

    for (const box of this.colliders) {
      const t = this.rayVsAABB(origin, dir, box);
      if (t !== null && t > 0.1 && t < closestDist) {
        closestDist = t - 0.15;
      }
    }

    if (closestDist < 0.5) closestDist = 0.5;

    return origin.clone().addScaledVector(dir, closestDist);
  }

  private rayVsAABB(origin: THREE.Vector3, dir: THREE.Vector3, box: THREE.Box3): number | null {
    let tmin = -Infinity;
    let tmax = Infinity;

    const axes: ("x" | "y" | "z")[] = ["x", "y", "z"];
    for (const axis of axes) {
      if (Math.abs(dir[axis]) < 1e-8) {
        if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) return null;
      } else {
        let t1 = (box.min[axis] - origin[axis]) / dir[axis];
        let t2 = (box.max[axis] - origin[axis]) / dir[axis];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }

    return tmin >= 0 ? tmin : (tmax >= 0 ? tmax : null);
  }

  // --- Collision helpers ---
  private moveAndSlide(dx: number, dz: number, colliders: THREE.Box3[]) {
    // Try full movement first
    this.position.x += dx;
    this.position.z += dz;
    if (!this.isCollidingXZ(colliders)) return;

    // Try X only (slide along wall)
    this.position.z -= dz;
    if (!this.isCollidingXZ(colliders)) return;

    // Try Z only
    this.position.x -= dx;
    this.position.z += dz;
    if (!this.isCollidingXZ(colliders)) return;

    // Try reduced diagonal (helps with corner stuttering)
    this.position.z -= dz;
    this.position.x += dx * 0.5;
    this.position.z += dz * 0.5;
    if (!this.isCollidingXZ(colliders)) return;

    // Fully blocked
    this.position.x -= dx * 0.5;
    this.position.z -= dz * 0.5;
  }

  private isCollidingXZ(colliders: THREE.Box3[]): boolean {
    const box = new THREE.Box3(
      new THREE.Vector3(this.position.x - RADIUS, this.position.y + STEP_UP, this.position.z - RADIUS),
      new THREE.Vector3(this.position.x + RADIUS, this.position.y + HEIGHT, this.position.z + RADIUS)
    );
    for (const c of colliders) {
      if (box.intersectsBox(c)) return true;
    }
    return false;
  }

  private findCeiling(colliders: THREE.Box3[]): number | null {
    const headY = this.position.y + HEIGHT;
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

  private pushOutHorizontal(colliders: THREE.Box3[]) {
    // Only check body above step-up height to avoid fighting with findGround
    const box = new THREE.Box3(
      new THREE.Vector3(this.position.x - RADIUS, this.position.y + STEP_UP + 0.05, this.position.z - RADIUS),
      new THREE.Vector3(this.position.x + RADIUS, this.position.y + HEIGHT, this.position.z + RADIUS)
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

      box.min.set(this.position.x - RADIUS, this.position.y + STEP_UP + 0.05, this.position.z - RADIUS);
      box.max.set(this.position.x + RADIUS, this.position.y + HEIGHT, this.position.z + RADIUS);
    }
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

  // --- Public API ---
  setPosition(x: number, y: number, z: number) {
    this.ladder.release();
    this.position.set(x, y, z);
    this.smoothY = y;
    this.verticalVelocity = 0;
    this.onGround = true;
    if (this.propMesh) this.propMesh.position.copy(this.position);
    this.updateCamera();
  }

  setMovementBounds(minX: number, maxX: number, minZ: number, maxZ: number) {
    this.movementBounds = { minX, maxX, minZ, maxZ };
  }

  setPropMesh(mesh: THREE.Mesh | null) { this.propMesh = mesh; }
  setLocked(locked: boolean) {
    this.isLocked = locked;
    if (locked) this.ladder.release();
    if (!locked) this.exitSoulMode();
  }
  getIsLocked(): boolean { return this.isLocked; }
  getPosition(): THREE.Vector3 { return this.position.clone(); }
  getRotation(): { x: number; y: number } { return { x: this.currentPitch, y: this.currentYaw }; }

  translatePosition(dx: number, dy: number) {
    this.position.x += dx;
    this.position.y += dy;
    this.smoothY += dy;
    if (this.propMesh) this.propMesh.position.copy(this.position);
  }

  isInSoulMode(): boolean { return this.inSoulMode; }
  exitSoulMode() {
    if (!this.inSoulMode) return;
    this.inSoulMode = false;
    this.updateCamera();
  }
}
