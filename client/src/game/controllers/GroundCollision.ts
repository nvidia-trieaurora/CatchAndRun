import * as THREE from "three";
import { getCeilingHeightAt, getSupportHeightAt } from "../world/SupportSurfaces";

export const GROUND_CONTACT_EPSILON = 0.05;
export const STAIR_STEP_DOWN = 0.6;

interface CeilingProbe {
  x: number;
  z: number;
  previousHeadY: number;
  currentHeadY: number;
  radius: number;
}

/** Sweep the head through the whole jump step, including thin roof panels. */
export function findCeilingSurface(
  colliders: readonly THREE.Box3[],
  probe: CeilingProbe,
): number | null {
  if (probe.currentHeadY < probe.previousHeadY) return null;
  let lowest: number | null = null;
  for (const collider of colliders) {
    const underside = getCeilingHeightAt(collider, probe.x, probe.z, probe.radius);
    if (
      collider.max.y <= collider.min.y
      || underside === null
      || underside < probe.previousHeadY - GROUND_CONTACT_EPSILON
      || underside > probe.currentHeadY
      || probe.x + probe.radius <= collider.min.x
      || probe.x - probe.radius >= collider.max.x
      || probe.z + probe.radius <= collider.min.z
      || probe.z - probe.radius >= collider.max.z
    ) continue;
    if (lowest === null || underside < lowest) lowest = underside;
  }
  return lowest;
}

interface GroundProbe {
  x: number;
  z: number;
  currentY: number;
  previousY: number;
  radius: number;
  stepUp: number;
  stepDown: number;
  allowStepTransition: boolean;
  fallbackY: number;
}

export function findGroundSurface(
  colliders: readonly THREE.Box3[],
  probe: GroundProbe,
): number {
  const sweptMin = Math.min(probe.currentY, probe.previousY)
    - GROUND_CONTACT_EPSILON;
  const sweptMax = Math.max(probe.currentY, probe.previousY)
    + GROUND_CONTACT_EPSILON;
  const minSurfaceY = probe.allowStepTransition
    ? Math.min(sweptMin, probe.previousY - probe.stepDown)
    : sweptMin;
  const maxSurfaceY = probe.allowStepTransition
    ? Math.max(sweptMax, probe.previousY + probe.stepUp)
    : sweptMax;
  let best = probe.fallbackY;

  for (const collider of colliders) {
    const surfaceY = getSupportHeightAt(collider, probe.x, probe.z, probe.radius);
    if (
      surfaceY !== null
      && surfaceY > best
      && surfaceY >= minSurfaceY - GROUND_CONTACT_EPSILON
      && surfaceY <= maxSurfaceY + GROUND_CONTACT_EPSILON
    ) {
      best = surfaceY;
    }
  }

  return best;
}

export function shouldResolveGround(
  surfaceY: number,
  currentY: number,
  previousY: number,
  verticalVelocity: number,
  allowStepTransition: boolean,
  stepUp: number,
  stepDown: number,
): boolean {
  if (allowStepTransition) {
    const stepDelta = surfaceY - previousY;
    if (
      stepDelta > GROUND_CONTACT_EPSILON
      && stepDelta <= stepUp + GROUND_CONTACT_EPSILON
    ) {
      return true;
    }
    if (
      stepDelta < -GROUND_CONTACT_EPSILON
      && -stepDelta <= stepDown + GROUND_CONTACT_EPSILON
    ) {
      return true;
    }
  }

  return verticalVelocity <= 0
    && currentY <= surfaceY + GROUND_CONTACT_EPSILON
    && previousY >= surfaceY - GROUND_CONTACT_EPSILON;
}

export function dampGroundVisual(
  currentY: number,
  targetY: number,
  dt: number,
  smoothing: number,
): number {
  return currentY
    + (targetY - currentY) * (1 - Math.exp(-smoothing * dt));
}
