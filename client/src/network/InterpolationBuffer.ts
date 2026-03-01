import { INTERPOLATION_BUFFER_MS } from "@catch-and-run/shared";

interface Snapshot {
  timestamp: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export class InterpolationBuffer {
  private buffer: Snapshot[] = [];
  private renderDelay: number;

  constructor(delayMs: number = INTERPOLATION_BUFFER_MS) {
    this.renderDelay = delayMs;
  }

  push(x: number, y: number, z: number, rotY: number) {
    this.buffer.push({ timestamp: Date.now(), x, y, z, rotY });
    if (this.buffer.length > 10) {
      this.buffer.shift();
    }
  }

  getInterpolated(): { x: number; y: number; z: number; rotY: number } | null {
    if (this.buffer.length < 2) {
      return this.buffer.length === 1 ? this.buffer[0] : null;
    }

    const renderTime = Date.now() - this.renderDelay;

    let from: Snapshot | null = null;
    let to: Snapshot | null = null;

    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].timestamp <= renderTime && this.buffer[i + 1].timestamp >= renderTime) {
        from = this.buffer[i];
        to = this.buffer[i + 1];
        break;
      }
    }

    if (!from || !to) {
      return this.buffer[this.buffer.length - 1];
    }

    const total = to.timestamp - from.timestamp;
    const t = total > 0 ? (renderTime - from.timestamp) / total : 0;
    const clamped = Math.max(0, Math.min(1, t));

    return {
      x: from.x + (to.x - from.x) * clamped,
      y: from.y + (to.y - from.y) * clamped,
      z: from.z + (to.z - from.z) * clamped,
      rotY: this.lerpAngle(from.rotY, to.rotY, clamped),
    };
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }
}
