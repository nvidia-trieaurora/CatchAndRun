interface Snapshot {
  timestamp: number;
  positions: Map<string, { x: number; y: number; z: number }>;
}

const MAX_SNAPSHOTS = 20;

export class SnapshotBuffer {
  private snapshots: Snapshot[] = [];

  push(timestamp: number, positions: Map<string, { x: number; y: number; z: number }>) {
    this.snapshots.push({ timestamp, positions: new Map(positions) });
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }
  }

  getAtTime(timestamp: number): Snapshot | null {
    if (this.snapshots.length === 0) return null;

    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      if (this.snapshots[i].timestamp <= timestamp) {
        return this.snapshots[i];
      }
    }
    return this.snapshots[0];
  }

  getLatest(): Snapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }
}
