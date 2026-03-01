const MAP_MIN_X = -55, MAP_MAX_X = 63;
const MAP_MIN_Z = -43, MAP_MAX_Z = 47;
const MAP_W = MAP_MAX_X - MAP_MIN_X;
const MAP_D = MAP_MAX_Z - MAP_MIN_Z;
const CANVAS_SIZE = 170;

interface DetectedProp {
  x: number;
  z: number;
  expireTime: number;
}

export class Minimap {
  readonly element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private playerX = 0;
  private playerZ = 0;
  private playerYaw = 0;
  private detectedProps: DetectedProp[] = [];
  private visible = false;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "minimap-container";
    this.element.style.cssText = `
      position: fixed; bottom: 16px; right: 16px;
      width: ${CANVAS_SIZE}px; height: ${CANVAS_SIZE}px;
      border-radius: 8px; overflow: hidden;
      border: 2px solid rgba(255,255,255,0.3);
      background: rgba(0,0,0,0.5);
      pointer-events: none; z-index: 90;
      display: none;
    `;

    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;
    this.element.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
  }

  show() {
    this.visible = true;
    this.element.style.display = "block";
  }

  hide() {
    this.visible = false;
    this.element.style.display = "none";
  }

  updatePlayerPosition(x: number, z: number, yaw: number) {
    this.playerX = x;
    this.playerZ = z;
    this.playerYaw = yaw;
    if (this.visible) this.draw();
  }

  addDetectedProps(detected: { x: number; z: number }[]) {
    const expire = Date.now() + 5000;
    for (const d of detected) {
      this.detectedProps.push({ x: d.x, z: d.z, expireTime: expire });
    }
  }

  private worldToCanvas(wx: number, wz: number): [number, number] {
    const nx = (wx - MAP_MIN_X) / MAP_W;
    const nz = (wz - MAP_MIN_Z) / MAP_D;
    return [nx * CANVAS_SIZE, nz * CANVAS_SIZE];
  }

  private draw() {
    const ctx = this.ctx;
    const S = CANVAS_SIZE;
    ctx.clearRect(0, 0, S, S);

    // Background (grass)
    ctx.fillStyle = "rgba(60, 90, 40, 0.8)";
    ctx.fillRect(0, 0, S, S);

    // Warehouse floor
    const [wfx, wfz] = this.worldToCanvas(-23, -18);
    const [wfx2, wfz2] = this.worldToCanvas(23, 18);
    ctx.fillStyle = "rgba(140, 135, 120, 0.7)";
    ctx.fillRect(wfx, wfz, wfx2 - wfx, wfz2 - wfz);

    // Container yard asphalt
    const [cx1, cz1] = this.worldToCanvas(24, -25);
    const [cx2, cz2] = this.worldToCanvas(56, 5);
    ctx.fillStyle = "rgba(70, 70, 70, 0.6)";
    ctx.fillRect(cx1, cz1, cx2 - cx1, cz2 - cz1);

    // Dock
    const [dx1, dz1] = this.worldToCanvas(-20, 34);
    const [dx2, dz2] = this.worldToCanvas(50, 42);
    ctx.fillStyle = "rgba(110, 100, 80, 0.6)";
    ctx.fillRect(dx1, dz1, dx2 - dx1, dz2 - dz1);

    // Hunter spawn
    const [hx1, hz1] = this.worldToCanvas(-49, -7);
    const [hx2, hz2] = this.worldToCanvas(-35, 7);
    ctx.fillStyle = "rgba(100, 90, 80, 0.6)";
    ctx.fillRect(hx1, hz1, hx2 - hx1, hz2 - hz1);

    // Detected props (red blinking dots)
    const now = Date.now();
    this.detectedProps = this.detectedProps.filter((p) => p.expireTime > now);
    for (const prop of this.detectedProps) {
      const [px, pz] = this.worldToCanvas(prop.x, prop.z);
      const remaining = prop.expireTime - now;
      const blink = Math.sin(now * 0.01) > 0;
      const alpha = Math.min(1, remaining / 1000);
      if (blink || remaining < 1000) {
        ctx.beginPath();
        ctx.arc(px, pz, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 50, 50, ${alpha})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 100, 100, ${alpha * 0.5})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Player (green triangle pointing in look direction)
    const [plx, plz] = this.worldToCanvas(this.playerX, this.playerZ);
    ctx.save();
    ctx.translate(plx, plz);
    ctx.rotate(-this.playerYaw + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-4, 5);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fillStyle = "#44ff44";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Scan radius circle
    const scanR = (10 / MAP_W) * S;
    ctx.beginPath();
    ctx.arc(plx, plz, scanR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(100, 200, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
