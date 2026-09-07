import * as THREE from "three";

/**
 * Vertical ladders in the Harbor are authored as stacks of small step colliders
 * (0.4 m rungs sharing one footprint). The step-up logic cannot climb them —
 * the body box is blocked by the rungs above STEP_UP before the narrower
 * ground probe ever reaches the column — so this module turns every such stack
 * into a `LadderVolume` and drives an explicit grab → climb → mantle state
 * machine shared by the Hunter and Prop controllers.
 */
export interface LadderVolume {
  /** Union of the rung colliders: a thin vertical column. */
  box: THREE.Box3;
  centerX: number;
  centerZ: number;
  halfX: number;
  halfZ: number;
  bottomY: number;
  topY: number;
  /**
   * Optional unit axis (world x/z) pointing from the column toward the only side
   * a body may hang on. Ladders inside a lattice mast set it so nobody grabs the
   * rungs through the mast wall from outside.
   */
  approach?: { x: number; z: number };
}

/** Ladder authored explicitly (a `COL_LADDER_*` node) rather than detected from rung stacks. */
export interface LadderAuthoring {
  box: THREE.Box3;
  /** "+x" | "-x" | "+z" | "-z": side the climber hangs on. */
  approach?: string;
}

export function ladderVolumeFromBox(box: THREE.Box3, approach?: string): LadderVolume {
  const volume: LadderVolume = {
    box: box.clone(),
    centerX: (box.min.x + box.max.x) / 2,
    centerZ: (box.min.z + box.max.z) / 2,
    halfX: (box.max.x - box.min.x) / 2,
    halfZ: (box.max.z - box.min.z) / 2,
    bottomY: box.min.y,
    topY: box.max.y,
  };
  const side = approach ? APPROACH_SIDES[approach] : undefined;
  if (side) volume.approach = side;
  return volume;
}

const APPROACH_SIDES: Record<string, { x: number; z: number }> = {
  "+x": { x: 1, z: 0 },
  "-x": { x: -1, z: 0 },
  "+z": { x: 0, z: 1 },
  "-z": { x: 0, z: -1 },
};

export interface LadderInput {
  forward: boolean;
  backward: boolean;
  jump: boolean;
  /** World-space horizontal movement intent for this frame (any magnitude). */
  moveX: number;
  moveZ: number;
}

export interface LadderStepResult {
  /** The climber let go this frame (bottom reached, jumped off, or mantle finished). */
  detached: boolean;
  /** Detached by jumping away: caller should give the body a small hop. */
  hop: boolean;
  /** Detached standing on a surface (bottom rung or mantle onto the deck). */
  landed: boolean;
}

/** Metres per second along the rungs (well under the anti-cheat speed envelope). */
export const LADDER_CLIMB_SPEED = 2.6;
/** A stack must rise at least this much to count as a ladder rather than a stair. */
export const LADDER_MIN_HEIGHT = 1.5;
/** Largest rise between two consecutive rung colliders. */
export const LADDER_MAX_RUNG_RISE = 0.6;
/** Rung colliders wider than this in either axis are crates or platforms. */
export const LADDER_MAX_FOOTPRINT = 0.8;
export const LADDER_MAX_FOOTPRINT_AREA = 0.4;
/** The body may float this far from the rung column and still grab it. */
export const LADDER_GRAB_GAP = 0.25;
/** Gap kept between the body and the rung column while hanging. */
export const LADDER_HANG_GAP = 0.06;
/** Seconds for the pull-up over the top rung onto the deck. */
export const LADDER_MANTLE_TIME = 0.32;
/** Rung spacing that drives the climb bob. */
export const LADDER_RUNG_SPACING = 0.4;
/** Seconds after letting go before the same body can grab again. */
export const LADDER_REGRAB_COOLDOWN = 0.35;
const HANG_EASE = 14;
const MANTLE_ARC = 0.12;
const HORIZONTAL_LOSS_DISTANCE = 1.2;

export function detectLadderVolumes(colliders: readonly THREE.Box3[]): LadderVolume[] {
  const groups = new Map<string, THREE.Box3[]>();
  for (const box of colliders) {
    const width = box.max.x - box.min.x;
    const depth = box.max.z - box.min.z;
    if (width <= 0 || depth <= 0) continue;
    if (width > LADDER_MAX_FOOTPRINT || depth > LADDER_MAX_FOOTPRINT) continue;
    if (width * depth > LADDER_MAX_FOOTPRINT_AREA) continue;
    const key = [box.min.x, box.max.x, box.min.z, box.max.z]
      .map((value) => value.toFixed(2))
      .join("|");
    const group = groups.get(key);
    if (group) group.push(box);
    else groups.set(key, [box]);
  }

  const ladders: LadderVolume[] = [];
  for (const group of groups.values()) {
    if (group.length < 4) continue;
    group.sort((a, b) => a.max.y - b.max.y);
    let contiguous = true;
    for (let i = 1; i < group.length; i++) {
      const rise = group[i].max.y - group[i - 1].max.y;
      if (rise <= 0.005 || rise > LADDER_MAX_RUNG_RISE) {
        contiguous = false;
        break;
      }
      if (group[i].min.y > group[i - 1].max.y + 0.05) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) continue;
    const box = group[0].clone();
    for (const rung of group) box.union(rung);
    if (box.max.y - box.min.y < LADDER_MIN_HEIGHT) continue;
    ladders.push({
      box,
      centerX: (box.min.x + box.max.x) / 2,
      centerZ: (box.min.z + box.max.z) / 2,
      halfX: (box.max.x - box.min.x) / 2,
      halfZ: (box.max.z - box.min.z) / 2,
      bottomY: box.min.y,
      topY: box.max.y,
    });
  }
  ladders.sort((a, b) => a.centerX - b.centerX || a.centerZ - b.centerZ);
  return ladders;
}

interface MantleState {
  t: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  fromY: number;
  toY: number;
}

export interface LadderVisual {
  /** Lateral sway across the ladder width (world x/z). */
  x: number;
  z: number;
  /** Vertical rung bob. */
  y: number;
  /** Camera roll in radians. */
  roll: number;
  /** 0..1 progress of the pull-up when mantling, else 0. */
  mantle: number;
}

export class LadderClimber {
  private ladders: LadderVolume[] = [];
  private active: LadderVolume | null = null;
  private sideX = 0;
  private sideZ = 0;
  private hangX = 0;
  private hangZ = 0;
  private mantle: MantleState | null = null;
  private phase = 0;
  private cooldown = 0;
  private lastClimbDir = 0;

  setLadders(ladders: readonly LadderVolume[]): void {
    this.ladders = [...ladders];
    this.active = null;
    this.mantle = null;
  }

  getLadders(): readonly LadderVolume[] {
    return this.ladders;
  }

  isClimbing(): boolean {
    return this.active !== null || this.mantle !== null;
  }

  isMantling(): boolean {
    return this.mantle !== null;
  }

  getActive(): LadderVolume | null {
    return this.active;
  }

  /** Call once per frame while not climbing so the re-grab cooldown runs down. */
  tick(dt: number): void {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
  }

  /**
   * Try to grab a ladder from the current body position. `feetY` is the bottom
   * of the body; `radius` its half width. Succeeds only when the body is pushing
   * into a rung column that is beside it and still rises well above the feet.
   */
  tryGrab(
    x: number,
    feetY: number,
    z: number,
    radius: number,
    input: LadderInput,
  ): boolean {
    if (this.isClimbing() || this.cooldown > 0 || !input.forward) return false;
    const moveLength = Math.hypot(input.moveX, input.moveZ);
    if (moveLength < 1e-6) return false;
    const moveX = input.moveX / moveLength;
    const moveZ = input.moveZ / moveLength;

    for (const ladder of this.ladders) {
      if (feetY < ladder.bottomY - 0.45 || feetY > ladder.topY - 0.3) continue;
      const gapX = Math.max(ladder.box.min.x - (x + radius), (x - radius) - ladder.box.max.x, 0);
      const gapZ = Math.max(ladder.box.min.z - (z + radius), (z - radius) - ladder.box.max.z, 0);
      if (gapX > LADDER_GRAB_GAP || gapZ > LADDER_GRAB_GAP) continue;
      const toX = ladder.centerX - x;
      const toZ = ladder.centerZ - z;
      const toLength = Math.hypot(toX, toZ);
      if (toLength < 1e-6) continue;
      if ((moveX * toX + moveZ * toZ) / toLength < 0.4) continue;

      // The approach side is the axis on which the body sits furthest outside the column.
      const offX = (x - ladder.centerX) / (ladder.halfX + radius);
      const offZ = (z - ladder.centerZ) / (ladder.halfZ + radius);
      let sideX: number;
      let sideZ: number;
      if (Math.abs(offX) >= Math.abs(offZ)) {
        sideX = offX >= 0 ? 1 : -1;
        sideZ = 0;
      } else {
        sideX = 0;
        sideZ = offZ >= 0 ? 1 : -1;
      }
      if (ladder.approach && (ladder.approach.x !== sideX || ladder.approach.z !== sideZ)) continue;
      this.sideX = sideX;
      this.sideZ = sideZ;
      this.hangX = ladder.centerX + this.sideX * (ladder.halfX + radius + LADDER_HANG_GAP);
      this.hangZ = ladder.centerZ + this.sideZ * (ladder.halfZ + radius + LADDER_HANG_GAP);
      this.active = ladder;
      this.mantle = null;
      this.phase = 0;
      this.lastClimbDir = 0;
      return true;
    }
    return false;
  }

  /**
   * Advance the climb. `position` is the feet position and is mutated in place.
   * Forward climbs, backward descends, jump lets go with a hop; reaching the top
   * rung starts a short mantle that carries the body over the column onto the
   * surface behind it.
   */
  step(
    dt: number,
    input: LadderInput,
    position: THREE.Vector3,
    radius: number,
  ): LadderStepResult {
    if (this.mantle) {
      const mantle = this.mantle;
      mantle.t = Math.min(1, mantle.t + dt / LADDER_MANTLE_TIME);
      const s = mantle.t * mantle.t * (3 - 2 * mantle.t);
      position.x = mantle.fromX + (mantle.toX - mantle.fromX) * s;
      position.z = mantle.fromZ + (mantle.toZ - mantle.fromZ) * s;
      position.y = mantle.fromY + (mantle.toY - mantle.fromY) * s + Math.sin(Math.PI * s) * MANTLE_ARC;
      if (mantle.t >= 1) {
        position.y = mantle.toY;
        this.mantle = null;
        this.cooldown = LADDER_REGRAB_COOLDOWN;
        return { detached: true, hop: false, landed: true };
      }
      return { detached: false, hop: false, landed: false };
    }

    const ladder = this.active;
    if (!ladder) return { detached: true, hop: false, landed: false };

    if (input.jump) {
      this.release();
      position.x += this.sideX * 0.25;
      position.z += this.sideZ * 0.25;
      return { detached: true, hop: true, landed: false };
    }

    const ease = 1 - Math.exp(-HANG_EASE * dt);
    position.x += (this.hangX - position.x) * ease;
    position.z += (this.hangZ - position.z) * ease;
    if (Math.hypot(position.x - this.hangX, position.z - this.hangZ) > HORIZONTAL_LOSS_DISTANCE) {
      this.release();
      return { detached: true, hop: false, landed: false };
    }

    const direction = input.forward === input.backward ? 0 : input.forward ? 1 : -1;
    this.lastClimbDir = direction;
    const climb = direction * LADDER_CLIMB_SPEED * dt;
    position.y += climb;
    this.phase += Math.abs(climb) * (Math.PI * 2 / LADDER_RUNG_SPACING);

    if (direction > 0 && position.y >= ladder.topY - 0.02) {
      position.y = ladder.topY;
      const exitDistance = radius + 0.12;
      this.mantle = {
        t: 0,
        fromX: position.x,
        fromZ: position.z,
        toX: ladder.centerX - this.sideX * (ladder.halfX + exitDistance),
        toZ: ladder.centerZ - this.sideZ * (ladder.halfZ + exitDistance),
        fromY: ladder.topY,
        toY: ladder.topY + 0.02,
      };
      this.active = null;
      return { detached: false, hop: false, landed: false };
    }
    if (direction < 0 && position.y <= ladder.bottomY + 0.02) {
      position.y = ladder.bottomY;
      this.release();
      return { detached: true, hop: false, landed: true };
    }
    return { detached: false, hop: false, landed: false };
  }

  /** Drop the ladder without any impulse (teleports, role changes, respawns). */
  release(): void {
    this.active = null;
    this.mantle = null;
    this.cooldown = LADDER_REGRAB_COOLDOWN;
  }

  /** Rung-synchronised sway for the camera or the prop mesh. */
  getVisual(): LadderVisual {
    if (this.mantle) {
      const s = this.mantle.t;
      return { x: 0, y: 0, z: 0, roll: (1 - s) * 0.02, mantle: s };
    }
    if (!this.active) return { x: 0, y: 0, z: 0, roll: 0, mantle: 0 };
    const sway = Math.sin(this.phase * 0.5) * 0.028;
    // Sway runs along the ladder width, i.e. perpendicular to the approach side.
    const acrossX = this.sideZ;
    const acrossZ = this.sideX;
    const moving = this.lastClimbDir !== 0 ? 1 : 0;
    return {
      x: acrossX * sway * moving,
      z: acrossZ * sway * moving,
      y: Math.sin(this.phase) * 0.03 * moving,
      roll: Math.sin(this.phase * 0.5) * 0.012 * moving,
      mantle: 0,
    };
  }
}
