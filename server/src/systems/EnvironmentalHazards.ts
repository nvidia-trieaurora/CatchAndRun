import { WATER_DROWN_GRACE_MS, isOnHarborLowBoatDeck, type MapData } from "@catch-and-run/shared";

/**
 * Returns the id of the water hazard the player's FEET are inside, or null.
 * Hazard boxes end at the water surface (see `waterHazards[].max.y` in the map
 * data), so standing on a seawall or a pier over the water is never "in water" —
 * only a body that actually dropped below the surface counts.
 */
export function findWaterHazard(
  mapData: MapData,
  x: number,
  y: number,
  z: number,
): string | null {
  if (mapData.id === "harbor-warehouse" && isOnHarborLowBoatDeck(x, y, z)) return null;
  for (const hazard of mapData.waterHazards ?? []) {
    if (
      x >= hazard.min.x
      && x <= hazard.max.x
      && y >= hazard.min.y
      && y <= hazard.max.y
      && z >= hazard.min.z
      && z <= hazard.max.z
    ) {
      return hazard.id;
    }
  }
  return null;
}

export type DrowningState = "dry" | "entered" | "submerged" | "drowned";

/**
 * Per-player drowning clock. A player who falls into the water gets
 * `WATER_DROWN_GRACE_MS` to climb back out; only when the whole grace period is
 * spent under water do they drown. Leaving the water at any point resets the clock.
 */
export class DrowningTracker {
  private readonly enteredAt = new Map<string, number>();

  constructor(private readonly graceMs: number = WATER_DROWN_GRACE_MS) {}

  update(sessionId: string, inWater: boolean, now: number): DrowningState {
    if (!inWater) {
      this.enteredAt.delete(sessionId);
      return "dry";
    }
    const entered = this.enteredAt.get(sessionId);
    if (entered === undefined) {
      this.enteredAt.set(sessionId, now);
      return "entered";
    }
    if (now - entered >= this.graceMs) {
      this.enteredAt.delete(sessionId);
      return "drowned";
    }
    return "submerged";
  }

  /** Players whose grace period ran out without a fresh "left the water" update. */
  expired(now: number): string[] {
    const out: string[] = [];
    for (const [sessionId, entered] of this.enteredAt) {
      if (now - entered >= this.graceMs) out.push(sessionId);
    }
    return out;
  }

  secondsLeft(sessionId: string, now: number): number | null {
    const entered = this.enteredAt.get(sessionId);
    if (entered === undefined) return null;
    return Math.max(0, (this.graceMs - (now - entered)) / 1000);
  }

  clear(sessionId?: string): void {
    if (sessionId === undefined) this.enteredAt.clear();
    else this.enteredAt.delete(sessionId);
  }
}
