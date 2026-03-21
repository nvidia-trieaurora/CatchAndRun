const MAP_MIN_X = -55, MAP_MAX_X = 63;
const MAP_MIN_Z = -43, MAP_MAX_Z = 47;
const MAP_W = MAP_MAX_X - MAP_MIN_X;
const MAP_D = MAP_MAX_Z - MAP_MIN_Z;
const CANVAS_SIZE = 170;
const MAP_CX = (MAP_MIN_X + MAP_MAX_X) / 2;
const MAP_CZ = (MAP_MIN_Z + MAP_MAX_Z) / 2;

interface DetectedProp {
  x: number;
  z: number;
  expireTime: number;
}

interface SoundPing {
  x: number;
  z: number;
  zone: string;
  expireTime: number;
  startTime: number;
}

export class Minimap {
  readonly element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private playerX = 0;
  private playerZ = 0;
  private playerYaw = 0;
  private detectedProps: DetectedProp[] = [];
  private soundPings: SoundPing[] = [];
  private teammates: { x: number; z: number; yaw: number }[] = [];
  private visible = false;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "minimap-container";
    this.element.style.cssText = `
      position: fixed; top: 16px; right: 16px;
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

  updateTeammates(teammates: { x: number; z: number; yaw: number }[]) {
    this.teammates = teammates;
  }

  addSoundPing(x: number, z: number, zone: string) {
    const now = Date.now();
    this.soundPings.push({ x, z, zone, expireTime: now + 3000, startTime: now });
  }

  private worldToCanvas(wx: number, wz: number): [number, number] {
    const cx = ((wx - MAP_MIN_X) / MAP_W) * CANVAS_SIZE;
    const cy = ((wz - MAP_MIN_Z) / MAP_D) * CANVAS_SIZE;
    return [cx, cy];
  }

  private draw() {
    const ctx = this.ctx;
    const S = CANVAS_SIZE;
    ctx.clearRect(0, 0, S, S);

    ctx.fillStyle = "rgba(60, 90, 40, 0.8)";
    ctx.fillRect(0, 0, S, S);

    // Warehouse floor
    const [wfx, wfz] = this.worldToCanvas(-23, -18);
    const [wfx2, wfz2] = this.worldToCanvas(23, 18);
    ctx.fillStyle = "rgba(140, 135, 120, 0.7)";
    ctx.fillRect(wfx, wfz, wfx2 - wfx, wfz2 - wfz);

    // Container yard
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

    // Zone divider lines
    const [midX] = this.worldToCanvas(MAP_CX, 0);
    const [, midZ] = this.worldToCanvas(0, MAP_CZ);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(midX, 0); ctx.lineTo(midX, S);
    ctx.moveTo(0, midZ); ctx.lineTo(S, midZ);
    ctx.stroke();
    ctx.setLineDash([]);

    // Zone labels A B C D
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("A", midX / 2, midZ / 2);
    ctx.fillText("B", midX + (S - midX) / 2, midZ / 2);
    ctx.fillText("C", midX / 2, midZ + (S - midZ) / 2);
    ctx.fillText("D", midX + (S - midX) / 2, midZ + (S - midZ) / 2);

    // Detected props
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

    // Player triangle
    // euler.y=0 -> looking -Z -> canvas UP (triangle tip at 0,-7)
    // euler.y decreases when turning right -> canvas rotate decreases -> CW
    // So canvasRotation = euler.y (direct mapping, no offset)
    const [plx, plz] = this.worldToCanvas(this.playerX, this.playerZ);
    ctx.save();
    ctx.translate(plx, plz);
    ctx.rotate(-this.playerYaw);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-4, 5);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fillStyle = "#44ff44";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // FOV cone (shows field of view)
    const fovLen = 18;
    ctx.save();
    ctx.translate(plx, plz);
    ctx.rotate(-this.playerYaw);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, -fovLen);
    ctx.lineTo(8, -fovLen);
    ctx.closePath();
    ctx.fillStyle = "rgba(68, 255, 68, 0.06)";
    ctx.fill();
    ctx.restore();

    // Teammate hunters (green dots)
    for (const t of this.teammates) {
      const [tx, tz] = this.worldToCanvas(t.x, t.z);
      ctx.save();
      ctx.translate(tx, tz);
      ctx.rotate(-t.yaw);
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(-3, 3);
      ctx.lineTo(3, 3);
      ctx.closePath();
      ctx.fillStyle = "rgba(68, 255, 68, 0.6)";
      ctx.fill();
      ctx.restore();
    }

    // Sound pings (directional arrows pointing from hunter toward sound source)
    this.soundPings = this.soundPings.filter((p) => p.expireTime > now);
    for (const ping of this.soundPings) {
      const age = (now - ping.startTime) / 1000;
      const alpha = Math.max(0, 1 - age / 3);
      const pulse = 1 + Math.sin(age * 8) * 0.3;

      // Calculate direction from hunter to sound source
      const dx = ping.x - this.playerX;
      const dz = ping.z - this.playerZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.1) continue;

      // Angle from hunter to sound (in world space)
      const angle = Math.atan2(dx, -dz);

      // Arrow placed at fixed distance from player on minimap (edge of awareness ring)
      const arrowDist = 22;
      const arrowX = plx + Math.sin(angle) * arrowDist;
      const arrowZ = plz - Math.cos(angle) * arrowDist;
      const arrowLen = 10 * pulse;

      // Draw arrow pointing in the direction of the sound
      ctx.save();
      ctx.translate(arrowX, arrowZ);
      ctx.rotate(angle);

      // Arrow head (triangle)
      ctx.beginPath();
      ctx.moveTo(0, -arrowLen);
      ctx.lineTo(-5, arrowLen * 0.3);
      ctx.lineTo(5, arrowLen * 0.3);
      ctx.closePath();
      ctx.fillStyle = `rgba(255, 160, 30, ${alpha * 0.8})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 220, 80, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      // Zone label near arrow
      ctx.font = "bold 9px sans-serif";
      ctx.fillStyle = `rgba(255, 200, 50, ${alpha})`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(ping.zone, arrowX, arrowZ - arrowLen - 3);
    }

    // Scan radius
    const scanR = (10 / MAP_W) * S;
    ctx.beginPath();
    ctx.arc(plx, plz, scanR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(100, 200, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
