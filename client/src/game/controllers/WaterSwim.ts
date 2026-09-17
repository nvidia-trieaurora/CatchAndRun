import {
  WATER_SURFACE_Y,
  WATER_SWIM_FEET_Y,
  WATER_SWIM_SPEED_MULTIPLIER,
} from "@catch-and-run/shared";
import { getSupportHeightAt } from "../world/SupportSurfaces";

/**
 * Water for the movement controllers.
 *
 * The map's `waterHazards` boxes describe the sea around the island. A body that
 * walks off the shore is no longer held up by the invisible y=0 plane: it falls to
 * the swim level (`WATER_SWIM_FEET_Y`), moves slowly, and may climb back out by
 * swimming into the shore — the shore lifts the body onto the land where gravity
 * settles it on the ground or the seawall cap. Dying is the server's decision
 * (`DrowningTracker`, `WATER_DROWN_GRACE_MS`); the controllers only make the fall,
 * the swim and the climb-out physical.
 */

export interface WaterBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** How far the body is lifted when it reaches the shore from the water. */
export const WATER_CLIMB_OUT_LIFT = 1.4;
/** Feet this far below the ground plane count as "in the water" for climb-outs. */
export const WATER_CLIMB_OUT_DEPTH = 0.55;
/** A swimmer pushing toward land this close to the shore grabs it (seawalls block the body itself). */
export const WATER_CLIMB_OUT_REACH = 1.2;

export class WaterVolumes {
  private boxes: readonly WaterBox[] = [];
  private drySupports: readonly WaterBox[] = [];
  private bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;

  setMovementBounds(minX: number, maxX: number, minZ: number, maxZ: number) {
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  private isLand(x: number, z: number): boolean {
    const bounds = this.bounds;
    return (!bounds || (x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ)) && !this.isOver(x, z);
  }

  setBoxes(boxes: readonly WaterBox[] | undefined) {
    this.boxes = boxes ?? [];
  }

  /** Stable collider references, updated by the moving boat rig before physics. */
  setDrySupports(boxes: readonly WaterBox[] | undefined) {
    this.drySupports = boxes ?? [];
  }

  private isSupported(x: number, feetY: number, z: number): boolean {
    // Match findGroundSurface's footprint (controller radius .35 * .8), not
    // just the body's centre: a foot can legitimately overlap a deck edge.
    const footRadius = .28;
    return this.drySupports.some((box) => {
      const height = getSupportHeightAt(box, x, z, footRadius);
      return height !== null && Math.abs(feetY - height) <= .09;
    });
  }

  /** x/z lies over the sea (the hazard footprint, whatever the height). */
  isOver(x: number, z: number): boolean {
    // Horizontal movement is clamped after physics. Query the same boundary
    // point now, so a one-frame step outside the ocean cannot create y=0 land.
    if (this.bounds) {
      x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, x));
      z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, z));
    }
    for (const box of this.boxes) {
      if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z) return true;
    }
    return false;
  }

  /** Feet are below the surface and over the sea: the player is swimming or sinking. */
  isIn(x: number, feetY: number, z: number): boolean {
    return feetY < WATER_SURFACE_Y && this.isOver(x, z) && !this.isSupported(x, feetY, z);
  }

  /** Ground plane the controller falls back to when no collider is below. */
  fallbackGroundY(x: number, z: number, groundY: number): number {
    return this.isOver(x, z) ? WATER_SWIM_FEET_Y : groundY;
  }

  /** Horizontal speed factor for the current feet height. */
  speedMultiplier(x: number, feetY: number, z: number): number {
    return this.isIn(x, feetY, z) ? WATER_SWIM_SPEED_MULTIPLIER : 1;
  }

  /**
   * After a horizontal move: a swimming body that reached the shore — or is
   * pushing toward land within reach while a seawall blocks its body — is lifted
   * so gravity can settle it on the ground or the wall cap. `moveX/moveZ` is the
   * intended step of this frame. Returns the new feet height or null.
   */
  climbOut(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    feetY: number,
    groundY: number,
    moveX = toX - fromX,
    moveZ = toZ - fromZ,
  ): number | null {
    if (feetY >= groundY - WATER_CLIMB_OUT_DEPTH) return null;
    if (this.isSupported(fromX, feetY, fromZ)) return null;
    if (!this.isOver(fromX, fromZ)) return null;
    if (this.isLand(toX, toZ)) return groundY + WATER_CLIMB_OUT_LIFT;
    const length = Math.hypot(moveX, moveZ);
    if (length < 1e-6) return null;
    const reachX = toX + (moveX / length) * WATER_CLIMB_OUT_REACH;
    const reachZ = toZ + (moveZ / length) * WATER_CLIMB_OUT_REACH;
    return this.isLand(reachX, reachZ) ? groundY + WATER_CLIMB_OUT_LIFT : null;
  }
}
