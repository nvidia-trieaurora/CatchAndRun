/**
 * Measured from ferris-harbor.glb's actual LOD0 timber floor faces by
 * tools/harbor-v2/measure_boat_supports.ts, not the curved hull bounding boxes.
 * Only these low internal floors can dip below the server's -0.9 sea threshold.
 * LOD1 skiff tops (-0.38), launch/workboat decks and the barge stay above it.
 */
export const HARBOR_LOW_BOAT_DECKS = [
  { rig: "RIG_FERRIS_HARBOR_BOAT_SKIFF_RED", minX: -16.5, maxX: -13.4, minZ: 48.15, maxZ: 49.05, restY: -.72 },
  { rig: "RIG_FERRIS_HARBOR_BOAT_SKIFF_GREEN", minX: 16.5, maxX: 19.6, minZ: 48.25, maxZ: 49.15, restY: -.72 },
] as const;

/**
 * The clients animate at independent local times, so the server accepts only
 * the narrow swept contact band, never a client-provided "on boat" flag.
 * Moored heave is <=(.32+.18+.10+.055+.015)*.45 = .3015m. Floor
 * rotation adds <.03m to its horizontal footprint; movement's ground probe
 * adds .28m of actual foot overlap at an edge, just as on every other platform.
 * The -1.10 lower limit
 * includes contact tolerance but remains .50m above actual swim feet (-1.60).
 * Thus swimmers beneath a hull and sea outside the timber rectangle still die.
 */
export function isOnHarborLowBoatDeck(x: number, feetY: number, z: number): boolean {
  if (feetY < -1.10 || feetY > -.30) return false;
  const contactReach = .28 + .03;
  return HARBOR_LOW_BOAT_DECKS.some((deck) => x >= deck.minX - contactReach && x <= deck.maxX + contactReach
    && z >= deck.minZ - contactReach && z <= deck.maxZ + contactReach);
}
