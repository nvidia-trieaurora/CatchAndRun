import { BoatCollisionRig } from "../../src/game/world/zones/BoatCollisionRig";
import { HarborAmbientMotion } from "../../src/game/world/environment/HarborAmbientMotion";
import { createHarborWater } from "../../src/game/world/environment/harborWater";
import { loadMovementAsset, type MovementTier } from "./assetMovementProbe";

/** Fixed independent spawn tracks on the five shipped decks, not hull AABBs. */
export const FLEET_TRACKS = [
  { id: "workboat", rig: "WORKBOAT", x: 9.05, z: 49.9 },
  { id: "launch", rig: "LAUNCH", x: -9.8, z: 49.4 },
  { id: "skiff-red", rig: "SKIFF_RED", x: -15.5, z: 48.6 },
  { id: "skiff-green", rig: "SKIFF_GREEN", x: 17.5, z: 48.7 },
  { id: "barge", rig: "BARGE", x: .4, z: 56.5 },
] as const;

const assets = new Map<MovementTier, ReturnType<typeof loadMovementAsset>>();

/**
 * Every scenario gets fresh rig transforms; only decoded geometry is shared.
 * The selected complete asset root never silently falls back to production.
 * Unlike the legacy production-only fleet helper, scalar material visibility
 * and meshopt decoding use the same path as the candidate movement gate.
 */
export async function candidateHarborFleet(quality: MovementTier) {
  let pending = assets.get(quality);
  if (!pending) {
    pending = loadMovementAsset("zones/ferris-harbor.glb", quality);
    assets.set(quality, pending);
  }
  const asset = await pending;
  const root = asset.root.clone(true);
  root.updateMatrixWorld(true);
  const boats = new BoatCollisionRig([root]);
  const motion = new HarborAmbientMotion([root], false);
  const water = createHarborWater(quality);
  water.setHullInteriors(boats.hullInteriors);
  return {
    root, boats, water,
    /** Same order as GameManager.animate: motion → support transforms → water. */
    advance(dt: number) {
      motion.update(dt, water);
      boats.update();
      water.update(dt);
      root.updateMatrixWorld(true);
    },
    /** Let the real GameManager refresh/carry before water time advances. */
    advanceWithManager(dt: number, updateBoatPhysics: () => void) {
      motion.update(dt, water);
      updateBoatPhysics();
      water.update(dt);
      root.updateMatrixWorld(true);
    },
    dispose() { water.dispose(); },
  };
}
