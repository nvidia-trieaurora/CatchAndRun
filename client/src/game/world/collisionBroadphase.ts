import * as THREE from "three";

/**
 * Returns only movement colliders whose horizontal footprint can affect the
 * player during the next few frames. Large floor slabs are retained because
 * their bounds overlap the query square.
 */
export function collectNearbyColliders(
  colliders: readonly THREE.Box3[],
  position: THREE.Vector3,
  radius: number,
): THREE.Box3[] {
  const minX = position.x - radius;
  const maxX = position.x + radius;
  const minZ = position.z - radius;
  const maxZ = position.z + radius;
  return colliders.filter((collider) => (
    collider.min.x <= maxX
    && collider.max.x >= minX
    && collider.min.z <= maxZ
    && collider.max.z >= minZ
  ));
}

const compareIndex = (a: number, b: number) => a - b;

/**
 * Static XZ grid for the map; moving cabins/decoys are tested at their live bounds.
 * Rebuild on map/gate/decoy membership changes, not on every animation frame.
 * Static Box3 bounds must stay unchanged until the next rebuild.
 */
export class CollisionSpatialIndex {
  private readonly cells = new Map<number, Map<number, number[]>>();
  private readonly alwaysTest: number[] = [];
  private readonly candidates: number[] = [];
  private colliders: readonly THREE.Box3[] = [];
  private seen = new Uint32Array(0);
  private stamp = 0;
  private firstX = NaN;
  private lastX = NaN;
  private firstZ = NaN;
  private lastZ = NaN;
  /** Distinct AABB tests in the most recent query (useful in runtime profiling). */
  lastCandidateCount = 0;

  constructor(private readonly cellSize = 8) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new RangeError("Collision grid cell size must be finite and positive");
    }
  }

  rebuild(colliders: readonly THREE.Box3[], dynamicColliders: readonly THREE.Box3[] = []): void {
    this.cells.clear();
    this.alwaysTest.length = 0;
    this.candidates.length = 0;
    // Snapshot membership: callers may splice the source when opening a gate.
    this.colliders = colliders.slice();
    this.seen = new Uint32Array(colliders.length);
    this.stamp = 0;
    this.firstX = NaN;
    const dynamic = new Set(dynamicColliders);
    for (let index = 0; index < colliders.length; index++) {
      const box = colliders[index];
      if (dynamic.has(box)) {
        this.alwaysTest.push(index);
        continue;
      }
      if (box.isEmpty()) continue;
      const minX = Math.floor(box.min.x / this.cellSize);
      const maxX = Math.floor(box.max.x / this.cellSize);
      const minZ = Math.floor(box.min.z / this.cellSize);
      const maxZ = Math.floor(box.max.z / this.cellSize);
      const cellCount = (maxX - minX + 1) * (maxZ - minZ + 1);
      // Island-wide floors need one test, not hundreds of duplicate cell entries.
      if (!Number.isFinite(cellCount) || cellCount > 256) {
        this.alwaysTest.push(index);
        continue;
      }
      for (let x = minX; x <= maxX; x++) {
        let column = this.cells.get(x);
        if (!column) this.cells.set(x, column = new Map());
        for (let z = minZ; z <= maxZ; z++) {
          let bucket = column.get(z);
          if (!bucket) column.set(z, bucket = []);
          bucket.push(index);
        }
      }
    }
  }

  collectNearby(position: THREE.Vector3, radius: number, target: THREE.Box3[] = []): THREE.Box3[] {
    target.length = 0;
    this.lastCandidateCount = 0;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.z)
      || !Number.isFinite(radius) || radius < 0) return target;
    const minX = position.x - radius;
    const maxX = position.x + radius;
    const minZ = position.z - radius;
    const maxZ = position.z + radius;
    const firstX = Math.floor(minX / this.cellSize);
    const lastX = Math.floor(maxX / this.cellSize);
    const firstZ = Math.floor(minZ / this.cellSize);
    const lastZ = Math.floor(maxZ / this.cellSize);

    if (firstX !== this.firstX || lastX !== this.lastX || firstZ !== this.firstZ || lastZ !== this.lastZ) {
      this.refreshCandidates(firstX, lastX, firstZ, lastZ);
    }
    this.lastCandidateCount = this.candidates.length;
    for (const index of this.candidates) {
      const box = this.colliders[index];
      if (box.min.x <= maxX && box.max.x >= minX && box.min.z <= maxZ && box.max.z >= minZ) target.push(box);
    }
    return target;
  }

  private refreshCandidates(firstX: number, lastX: number, firstZ: number, lastZ: number): void {
    this.firstX = firstX;
    this.lastX = lastX;
    this.firstZ = firstZ;
    this.lastZ = lastZ;
    this.candidates.length = 0;
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) {
      this.seen.fill(0);
      this.stamp = 1;
    }
    if ((lastX - firstX + 1) * (lastZ - firstZ + 1) > 4096) {
      // Debug/map-wide queries should not enumerate millions of empty cells.
      for (let index = 0; index < this.colliders.length; index++) {
        this.addCandidate(index);
      }
    } else {
      for (const index of this.alwaysTest) this.addCandidate(index);
      for (let x = firstX; x <= lastX; x++) {
        const column = this.cells.get(x);
        if (!column) continue;
        for (let z = firstZ; z <= lastZ; z++) {
          const bucket = column.get(z);
          if (!bucket) continue;
          for (const index of bucket) this.addCandidate(index);
        }
      }
    }

    // Preserve the old collision iteration order: corner push-out depends on it.
    // Cache that order until the query crosses a cell edge. Walking and aiming
    // reuse it; exact bounds and dynamic colliders are still tested every frame.
    this.candidates.sort(compareIndex);
  }

  private addCandidate(index: number): void {
    if (this.seen[index] === this.stamp) return;
    this.seen[index] = this.stamp;
    this.candidates.push(index);
  }
}
