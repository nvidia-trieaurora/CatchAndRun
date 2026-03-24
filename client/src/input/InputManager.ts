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
  soulMode: boolean;
}

export class InputManager {
  private keys = new Set<string>();
  private mouseDown = false;
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private locked = false;
  private canvas: HTMLCanvasElement;
  private enabled = true;
  private chatActive = false;
  private onTabToggle: (() => void) | null = null;
  isMobileMode = false;
  private rightClickToggled = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    document.addEventListener("keydown", (e) => {
      if (e.code === "Tab") {
        e.preventDefault();
        if (this.onTabToggle) this.onTabToggle();
        return;
      }
      if (this.chatActive) return;
      if (!this.enabled) return;
      this.keys.add(e.code);
    });

    document.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });

    document.addEventListener("mousedown", (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightClickToggled = true;
    });

    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
    });

    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.mouseDeltaX += e.movementX;
      this.mouseDeltaY += e.movementY;
    });

    document.addEventListener("pointerlockchange", () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (wasLocked && !this.locked) {
        this.keys.clear();
        this.mouseDown = false;
      }
    });

    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouseDown = false;
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.keys.clear();
        this.mouseDown = false;
      }
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
    if (this.isMobileMode) return true;
    return this.locked;
  }

  getState(): InputState {
    return {
      forward: this.keys.has("KeyW") || this.keys.has("ArrowUp"),
      backward: this.keys.has("KeyS") || this.keys.has("ArrowDown"),
      left: this.keys.has("KeyA") || this.keys.has("ArrowLeft"),
      right: this.keys.has("KeyD") || this.keys.has("ArrowRight"),
      jump: this.keys.has("Space"),
      crouch: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
      shoot: this.mouseDown,
      reload: this.keys.has("KeyR"),
      interact: this.keys.has("KeyE"),
      lockPose: this.keys.has("KeyF"),
      ability: this.keys.has("KeyQ"),
      ability2: this.keys.has("KeyR"),
      scoreboard: false,
      soulMode: this.keys.has("Digit1"),
    };
  }

  setChatActive(active: boolean) {
    this.chatActive = active;
    if (active) {
      this.keys.clear();
      this.mouseDown = false;
    }
  }

  setTabToggleHandler(handler: () => void) {
    this.onTabToggle = handler;
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

  injectKeyDown(code: string) {
    this.keys.add(code);
  }

  injectKeyUp(code: string) {
    this.keys.delete(code);
  }

  injectMouseDelta(dx: number, dy: number) {
    this.mouseDeltaX += dx;
    this.mouseDeltaY += dy;
  }

  setMouseDown(down: boolean) {
    this.mouseDown = down;
  }

  consumeRightClick(): boolean {
    if (this.rightClickToggled) {
      this.rightClickToggled = false;
      return true;
    }
    return false;
  }
}
