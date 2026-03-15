import type { InputManager } from "./InputManager";

type Role = "hunter" | "prop" | "spectator";

interface ButtonDef {
  id: string;
  label: string;
  key: string;
  className: string;
  hold?: boolean; // true = continuous press (e.g. shoot), false = one-shot
}

const HUNTER_BUTTONS: ButtonDef[] = [
  { id: "tb-shoot", label: "FIRE", key: "__mouseDown__", className: "touch-btn touch-btn-shoot", hold: true },
  { id: "tb-reload", label: "R", key: "KeyR", className: "touch-btn touch-btn-action" },
  { id: "tb-grenade", label: "Q", key: "KeyQ", className: "touch-btn touch-btn-action" },
  { id: "tb-scan", label: "E", key: "KeyE", className: "touch-btn touch-btn-action" },
  { id: "tb-jump", label: "JUMP", key: "Space", className: "touch-btn touch-btn-jump" },
  { id: "tb-crouch", label: "C", key: "ShiftLeft", className: "touch-btn touch-btn-action touch-btn-crouch", hold: true },
  { id: "tb-meme", label: "SFX", key: "Digit2", className: "touch-btn touch-btn-action touch-btn-meme" },
  { id: "tb-meme-ok", label: "OK", key: "Enter", className: "touch-btn touch-btn-action touch-btn-meme-ok" },
];

const PROP_BUTTONS: ButtonDef[] = [
  { id: "tb-transform", label: "E", key: "KeyE", className: "touch-btn touch-btn-action" },
  { id: "tb-lock", label: "F", key: "KeyF", className: "touch-btn touch-btn-action" },
  { id: "tb-invis", label: "Q", key: "KeyQ", className: "touch-btn touch-btn-action" },
  { id: "tb-speed", label: "R", key: "KeyR", className: "touch-btn touch-btn-action" },
  { id: "tb-jump", label: "JUMP", key: "Space", className: "touch-btn touch-btn-jump" },
  { id: "tb-soul", label: "1", key: "Digit1", className: "touch-btn touch-btn-action" },
  { id: "tb-meme", label: "SFX", key: "Digit2", className: "touch-btn touch-btn-action touch-btn-meme" },
  { id: "tb-meme-ok", label: "OK", key: "Enter", className: "touch-btn touch-btn-action touch-btn-meme-ok" },
];

export class TouchInputProvider {
  private input: InputManager;
  private container: HTMLElement;
  private joystickCanvas: HTMLCanvasElement;
  private joystickCtx: CanvasRenderingContext2D;
  private lookZone: HTMLElement;
  private buttonsContainer: HTMLElement;

  private joystickTouchId: number | null = null;
  private lookTouchId: number | null = null;
  private joystickOrigin = { x: 0, y: 0 };
  private joystickPos = { x: 0, y: 0 };
  private joystickActive = false;
  private joystickRadius = 55;
  private deadZone = 0.15;

  private currentRole: Role = "prop";
  private activeButtons = new Map<number, string>(); // touchId -> key
  private sensitivity = 2.0;

  constructor(input: InputManager) {
    this.input = input;

    this.container = document.createElement("div");
    this.container.className = "touch-controls";
    this.container.style.display = "none";

    // Joystick zone (left half)
    this.joystickCanvas = document.createElement("canvas");
    this.joystickCanvas.className = "touch-joystick-zone";
    this.joystickCanvas.width = 200;
    this.joystickCanvas.height = 200;
    this.joystickCtx = this.joystickCanvas.getContext("2d")!;
    this.container.appendChild(this.joystickCanvas);

    // Look zone (right half, but behind buttons)
    this.lookZone = document.createElement("div");
    this.lookZone.className = "touch-look-zone";
    this.container.appendChild(this.lookZone);

    // Action buttons container
    this.buttonsContainer = document.createElement("div");
    this.buttonsContainer.className = "touch-actions";
    this.container.appendChild(this.buttonsContainer);

    document.body.appendChild(this.container);

    this.setupJoystickListeners();
    this.setupLookListeners();
    this.buildButtons(this.currentRole);
    this.drawJoystick();
  }

  show() {
    this.container.style.display = "block";
  }

  hide() {
    this.container.style.display = "none";
    this.resetJoystick();
  }

  setRole(role: Role) {
    this.currentRole = role;
    this.buildButtons(role);
  }

  dispose() {
    this.container.remove();
  }

  // --- Joystick ---

  private setupJoystickListeners() {
    this.joystickCanvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (this.joystickTouchId !== null) return;
      const t = e.changedTouches[0];
      this.joystickTouchId = t.identifier;
      const rect = this.joystickCanvas.getBoundingClientRect();
      this.joystickOrigin.x = t.clientX - rect.left;
      this.joystickOrigin.y = t.clientY - rect.top;
      this.joystickPos.x = this.joystickOrigin.x;
      this.joystickPos.y = this.joystickOrigin.y;
      this.joystickActive = true;
      this.drawJoystick();
    }, { passive: false });

    this.joystickCanvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystickTouchId) {
          const rect = this.joystickCanvas.getBoundingClientRect();
          let dx = (t.clientX - rect.left) - this.joystickOrigin.x;
          let dy = (t.clientY - rect.top) - this.joystickOrigin.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > this.joystickRadius) {
            dx = (dx / dist) * this.joystickRadius;
            dy = (dy / dist) * this.joystickRadius;
          }
          this.joystickPos.x = this.joystickOrigin.x + dx;
          this.joystickPos.y = this.joystickOrigin.y + dy;
          this.updateMovementKeys(dx, dy);
          this.drawJoystick();
        }
      }
    }, { passive: false });

    const endJoystick = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joystickTouchId) {
          this.resetJoystick();
        }
      }
    };
    this.joystickCanvas.addEventListener("touchend", endJoystick, { passive: false });
    this.joystickCanvas.addEventListener("touchcancel", endJoystick, { passive: false });
  }

  private resetJoystick() {
    this.joystickTouchId = null;
    this.joystickActive = false;
    this.input.injectKeyUp("KeyW");
    this.input.injectKeyUp("KeyS");
    this.input.injectKeyUp("KeyA");
    this.input.injectKeyUp("KeyD");
    this.drawJoystick();
  }

  private updateMovementKeys(dx: number, dy: number) {
    const nx = dx / this.joystickRadius;
    const ny = dy / this.joystickRadius;

    if (ny < -this.deadZone) this.input.injectKeyDown("KeyW");
    else this.input.injectKeyUp("KeyW");

    if (ny > this.deadZone) this.input.injectKeyDown("KeyS");
    else this.input.injectKeyUp("KeyS");

    if (nx < -this.deadZone) this.input.injectKeyDown("KeyA");
    else this.input.injectKeyUp("KeyA");

    if (nx > this.deadZone) this.input.injectKeyDown("KeyD");
    else this.input.injectKeyUp("KeyD");
  }

  private drawJoystick() {
    const ctx = this.joystickCtx;
    const w = this.joystickCanvas.width;
    const h = this.joystickCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = this.joystickActive ? this.joystickOrigin.x : w / 2;
    const cy = this.joystickActive ? this.joystickOrigin.y : h / 2;

    // Base circle
    ctx.beginPath();
    ctx.arc(cx, cy, this.joystickRadius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Thumb
    const tx = this.joystickActive ? this.joystickPos.x : cx;
    const ty = this.joystickActive ? this.joystickPos.y : cy;
    ctx.beginPath();
    ctx.arc(tx, ty, 22, 0, Math.PI * 2);
    ctx.fillStyle = this.joystickActive ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // --- Touch Look ---

  private setupLookListeners() {
    this.lookZone.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (this.lookTouchId !== null) return;
      const t = e.changedTouches[0];
      this.lookTouchId = t.identifier;
    }, { passive: false });

    this.lookZone.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.lookTouchId) {
          // movementX/Y aren't available on touch, so we track manually
          // Use a private prev position stored per frame
          if (this._prevLookX !== null) {
            const dx = (t.clientX - this._prevLookX) * this.sensitivity;
            const dy = (t.clientY - this._prevLookY!) * this.sensitivity;
            this.input.injectMouseDelta(dx, dy);
          }
          this._prevLookX = t.clientX;
          this._prevLookY = t.clientY;
        }
      }
    }, { passive: false });

    const endLook = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.lookTouchId) {
          this.lookTouchId = null;
          this._prevLookX = null;
          this._prevLookY = null;
        }
      }
    };
    this.lookZone.addEventListener("touchend", endLook, { passive: false });
    this.lookZone.addEventListener("touchcancel", endLook, { passive: false });
  }

  private _prevLookX: number | null = null;
  private _prevLookY: number | null = null;

  // --- Action Buttons ---

  private buildButtons(role: Role) {
    this.buttonsContainer.innerHTML = "";
    this.activeButtons.clear();

    if (role === "spectator") {
      // Only jump for spectator (fly up)
      this.createButton({ id: "tb-jump", label: "UP", key: "Space", className: "touch-btn touch-btn-jump" });
      return;
    }

    const defs = role === "hunter" ? HUNTER_BUTTONS : PROP_BUTTONS;
    for (const def of defs) {
      this.createButton(def);
    }
  }

  private createButton(def: ButtonDef) {
    const btn = document.createElement("div");
    btn.className = def.className;
    btn.id = def.id;
    btn.textContent = def.label;

    const DOM_DISPATCH_KEYS = new Set(["Digit2", "Enter"]);

    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const t = e.changedTouches[0];
      btn.classList.add("active");

      if (def.key === "__mouseDown__") {
        this.input.setMouseDown(true);
        this.activeButtons.set(t.identifier, def.key);
      } else if (DOM_DISPATCH_KEYS.has(def.key)) {
        document.dispatchEvent(new KeyboardEvent("keydown", { code: def.key, key: def.key, bubbles: true }));
        this.activeButtons.set(t.identifier, def.key);
      } else {
        this.input.injectKeyDown(def.key);
        this.activeButtons.set(t.identifier, def.key);
      }
    }, { passive: false });

    btn.addEventListener("touchend", (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.remove("active");

      for (let i = 0; i < e.changedTouches.length; i++) {
        const tid = e.changedTouches[i].identifier;
        const key = this.activeButtons.get(tid);
        if (key) {
          if (key === "__mouseDown__") {
            this.input.setMouseDown(false);
          } else {
            this.input.injectKeyUp(key);
          }
          this.activeButtons.delete(tid);
        }
      }
    }, { passive: false });

    btn.addEventListener("touchcancel", (e) => {
      btn.classList.remove("active");
      for (let i = 0; i < e.changedTouches.length; i++) {
        const tid = e.changedTouches[i].identifier;
        const key = this.activeButtons.get(tid);
        if (key) {
          if (key === "__mouseDown__") this.input.setMouseDown(false);
          else this.input.injectKeyUp(key);
          this.activeButtons.delete(tid);
        }
      }
    }, { passive: false });

    this.buttonsContainer.appendChild(btn);
  }
}
