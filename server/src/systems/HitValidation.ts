import { PlayerRole, WEAPON_DAMAGE, WEAPON_RANGE } from "@catch-and-run/shared";
import type { GameRoom } from "../rooms/GameRoom";
import type { SnapshotBuffer } from "../utils/SnapshotBuffer";
import type { ShootData } from "@catch-and-run/shared";
import mapData from "../data/maps/harbor-warehouse.json";

interface AABB {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

interface HitResult {
  hitPlayerSessionId: string | null;
  hitEnvironment: boolean;
  damage: number;
}

export class HitValidation {
  private room: GameRoom;
  private snapshotBuffer: SnapshotBuffer;
  private wallBoxes: AABB[] = [];

  constructor(room: GameRoom, snapshotBuffer: SnapshotBuffer) {
    this.room = room;
    this.snapshotBuffer = snapshotBuffer;
    this.loadWallOcclusion();
  }

  private loadWallOcclusion() {
    const occlusion = (mapData as any).wallOcclusion;
    if (!Array.isArray(occlusion)) return;
    for (const w of occlusion) {
      this.wallBoxes.push({
        minX: w.min.x, minY: w.min.y, minZ: w.min.z,
        maxX: w.max.x, maxY: w.max.y, maxZ: w.max.z,
      });
    }
  }

  private closestWallHit(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    maxDist: number
  ): number {
    let best = maxDist;
    for (const wall of this.wallBoxes) {
      const t = this.rayVsAABB(origin, dir, wall);
      if (t !== null && t < best) best = t;
    }
    return best;
  }

  processShot(shooterSessionId: string, data: ShootData): HitResult {
    const snapshot = this.snapshotBuffer.getAtTime(data.timestamp) ||
      this.snapshotBuffer.getLatest();

    const origin = { x: data.originX, y: data.originY, z: data.originZ };
    const dir = { x: data.dirX, y: data.dirY, z: data.dirZ };

    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    if (len === 0) return { hitPlayerSessionId: null, hitEnvironment: false, damage: 0 };
    dir.x /= len;
    dir.y /= len;
    dir.z /= len;

    const wallDist = this.closestWallHit(origin, dir, WEAPON_RANGE);

    let closestHit: string | null = null;
    let closestDist = wallDist;

    const positions = snapshot?.positions || new Map();

    this.room.state.players.forEach((player, sessionId) => {
      if (sessionId === shooterSessionId) return;
      if (!player.isAlive) return;
      if (player.role !== PlayerRole.PROP) return;

      const pos = positions.get(sessionId) || { x: player.x, y: player.y, z: player.z };

      const hitboxRadius = 0.5;
      const hitboxHeight = 1.8;

      const dist = this.rayVsAABB(
        origin, dir,
        {
          minX: pos.x - hitboxRadius,
          minY: pos.y - hitboxHeight / 2,
          minZ: pos.z - hitboxRadius,
          maxX: pos.x + hitboxRadius,
          maxY: pos.y + hitboxHeight / 2,
          maxZ: pos.z + hitboxRadius,
        }
      );

      if (dist !== null && dist < closestDist) {
        closestDist = dist;
        closestHit = sessionId;
      }
    });

    if (closestHit) {
      return {
        hitPlayerSessionId: closestHit,
        hitEnvironment: false,
        damage: WEAPON_DAMAGE,
      };
    }

    return {
      hitPlayerSessionId: null,
      hitEnvironment: wallDist < WEAPON_RANGE,
      damage: 0,
    };
  }

  private rayVsAABB(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    box: AABB
  ): number | null {
    let tmin = -Infinity;
    let tmax = Infinity;

    for (const axis of ["x", "y", "z"] as const) {
      const minKey = `min${axis.toUpperCase()}` as keyof typeof box;
      const maxKey = `max${axis.toUpperCase()}` as keyof typeof box;

      if (Math.abs(dir[axis]) < 1e-8) {
        if (origin[axis] < box[minKey] || origin[axis] > box[maxKey]) return null;
      } else {
        let t1 = (box[minKey] - origin[axis]) / dir[axis];
        let t2 = (box[maxKey] - origin[axis]) / dir[axis];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }

    return tmin >= 0 ? tmin : (tmax >= 0 ? tmax : null);
  }
}
