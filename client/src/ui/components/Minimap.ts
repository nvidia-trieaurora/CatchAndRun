const CANVAS_SIZE = 170;

interface MinimapZoneRect {
  x1: number; z1: number; x2: number; z2: number;
  color: string;
}

interface MinimapLayout {
  minX: number; maxX: number; minZ: number; maxZ: number;
  bg: string;
  zones: MinimapZoneRect[];
}

const MINIMAP_LAYOUTS: Record<string, MinimapLayout> = {
  "harbor-warehouse": {
    minX: -55, maxX: 63, minZ: -43, maxZ: 47,
    bg: "rgba(35, 42, 43, 0.92)",
    zones: [
      { x1: -23, z1: -18, x2: 23, z2: 18, color: "rgba(112, 104, 92, 0.88)" },  // warehouse
      { x1: 24, z1: -29, x2: 59, z2: 5, color: "rgba(34, 74, 78, 0.82)" },       // container yard
      { x1: -48, z1: -34, x2: -24, z2: -10, color: "rgba(139, 83, 40, 0.72)" }, // construction
      { x1: -55, z1: 17, x2: -17, z2: 47, color: "rgba(65, 78, 55, 0.82)" },     // residence and garden
      { x1: -20, z1: 34, x2: 50, z2: 42, color: "rgba(91, 69, 48, 0.88)" },      // pier
      { x1: -20, z1: 25, x2: 0, z2: 45, color: "rgba(81, 61, 85, 0.78)" },       // Ferris district
      { x1: -10, z1: -43, x2: 10, z2: -28, color: "rgba(71, 47, 76, 0.74)" },    // dockside bar
      { x1: 37, z1: -43, x2: 53, z2: -31, color: "rgba(35, 103, 107, 0.76)" },   // neon mart
      { x1: -49, z1: -7, x2: -35, z2: 7, color: "rgba(123, 70, 45, 0.82)" },     // hunter spawn
    ],
  },
  "school": {
    minX: -48, maxX: 48, minZ: -32, maxZ: 40,
    bg: "rgba(70, 100, 55, 0.8)",
    zones: [
      { x1: -30, z1: -28, x2: 30, z2: 0, color: "rgba(150, 110, 90, 0.7)" },    // main building
      { x1: -45, z1: 2, x2: -32, z2: 30, color: "rgba(140, 100, 80, 0.65)" },   // gym
      { x1: 32, z1: 2, x2: 45, z2: 26, color: "rgba(140, 110, 85, 0.65)" },     // cafeteria
      { x1: -32, z1: 2, x2: 32, z2: 32, color: "rgba(160, 155, 140, 0.5)" },    // yard
    ],
  },
};

interface DetectedProp {
  sessionId: string;
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
  private ghostMode = false;
  private layout: MinimapLayout = MINIMAP_LAYOUTS["harbor-warehouse"];

  setMap(mapId: string) {
    this.layout = MINIMAP_LAYOUTS[mapId] ?? MINIMAP_LAYOUTS["harbor-warehouse"];
  }

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

  addDetectedProps(detected: { sessionId?: string; x: number; z: number }[]) {
    const expire = Date.now() + 5000;
    for (const d of detected) {
      const sid = d.sessionId || `${d.x}_${d.z}`;
      const existing = this.detectedProps.find(p => p.sessionId === sid);
      if (existing) {
        existing.expireTime = expire;
        existing.x = d.x;
        existing.z = d.z;
      } else {
        this.detectedProps.push({ sessionId: sid, x: d.x, z: d.z, expireTime: expire });
      }
    }
  }

  updateDetectedPositions(positions: Map<string, { x: number; z: number }>) {
    for (const dp of this.detectedProps) {
      const pos = positions.get(dp.sessionId);
      if (pos) {
        dp.x = pos.x;
        dp.z = pos.z;
      }
    }
  }

  setGhostMode(ghost: boolean) {
    this.ghostMode = ghost;
  }

  updateTeammates(teammates: { x: number; z: number; yaw: number }[]) {
    this.teammates = teammates;
  }

  addSoundPing(x: number, z: number, zone: string) {
    const now = Date.now();
    this.soundPings.push({ x, z, zone, expireTime: now + 3000, startTime: now });
  }

  private worldToCanvas(wx: number, wz: number): [number, number] {
    const L = this.layout;
    const cx = ((wx - L.minX) / (L.maxX - L.minX)) * CANVAS_SIZE;
    const cy = ((wz - L.minZ) / (L.maxZ - L.minZ)) * CANVAS_SIZE;
    return [cx, cy];
  }

  private draw() {
    const ctx = this.ctx;
    const S = CANVAS_SIZE;
    ctx.clearRect(0, 0, S, S);

    ctx.fillStyle = this.layout.bg;
    ctx.fillRect(0, 0, S, S);

    // Zone rectangles for the current map
    for (const zone of this.layout.zones) {
      const [zx1, zz1] = this.worldToCanvas(zone.x1, zone.z1);
      const [zx2, zz2] = this.worldToCanvas(zone.x2, zone.z2);
      ctx.fillStyle = zone.color;
      ctx.fillRect(zx1, zz1, zx2 - zx1, zz2 - zz1);
    }

    // Zone divider lines
    const L = this.layout;
    const [midX] = this.worldToCanvas((L.minX + L.maxX) / 2, 0);
    const [, midZ] = this.worldToCanvas(0, (L.minZ + L.maxZ) / 2);
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
    ctx.fillStyle = this.ghostMode ? "#c080ff" : "#44ff44";
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
    ctx.fillStyle = this.ghostMode ? "rgba(192, 128, 255, 0.06)" : "rgba(68, 255, 68, 0.06)";
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
    const scanR = (10 / (this.layout.maxX - this.layout.minX)) * S;
    ctx.beginPath();
    ctx.arc(plx, plz, scanR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(100, 200, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
