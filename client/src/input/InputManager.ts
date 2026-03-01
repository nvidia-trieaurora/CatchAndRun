export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  crouch: boolean;
  shoot: boolean;
  reload: boolean;
  interact: boolean;
  lockPose: boolean;
  ability: boolean;
  ability2: boolean;
  scoreboard: boolean;
}

export class InputManager {
  private keys = new Set<string>();
  private mouseDown = false;
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private locked = false;
  private canvas: HTMLCanvasElement;
  private enabled = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    document.addEventListener("keydown", (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
    });

    document.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });

    document.addEventListener("mousedown", (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.mouseDown = true;
    });

    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.mouseDeltaX += e.movementX;
      this.mouseDeltaY += e.movementY;
    });

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
  }

  requestPointerLock() {
    void this.canvas.requestPointerLock();
  }

  exitPointerLock() {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  isPointerLocked(): boolean {
    return this.locked;
  }

  getState(): InputState {
    return {
      forward: this.keys.has("KeyW"),
      backward: this.keys.has("KeyS"),
      left: this.keys.has("KeyA"),
      right: this.keys.has("KeyD"),
      jump: this.keys.has("Space"),
      crouch: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
      shoot: this.mouseDown,
      reload: this.keys.has("KeyR"),
      interact: this.keys.has("KeyE"),
      lockPose: this.keys.has("KeyF"),
      ability: this.keys.has("KeyQ"),
      ability2: this.keys.has("KeyE"),
      scoreboard: this.keys.has("Tab"),
    };
  }

  consumeMouseDelta(): { x: number; y: number } {
    const delta = { x: this.mouseDeltaX, y: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return delta;
  }

  consumeKey(code: string): boolean {
    if (this.keys.has(code)) {
      this.keys.delete(code);
      return true;
    }
    return false;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.mouseDown = false;
    }
  }
}
