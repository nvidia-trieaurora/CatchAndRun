/** Measured, source-backed routes: changes require an explicit contract review. */
export type StaticAssetQuality = "high" | "low";
export type Vec3Tuple = [number, number, number];
export interface StaticAssetProbe {
  name: string;
  zone: string;
  source: string;
  origin: Vec3Tuple;
  direction: Vec3Tuple;
  far: number;
  expectation: "open" | "surface";
  gate?: "closed" | "open";
  visualCoordinate?: number | Record<StaticAssetQuality, number>;
  collisionCoordinate?: number;
  /** Metres; 1mm is the existing shipped structural contract's 3-decimal precision. */
  tolerance?: number;
}

const structural = "client/tests/ShippedStructuralRoutes.test.ts + tools/harbor-v2/repair_structural_routes.py";
const market = "client/tests/HarborMarketNative.test.ts + oldHarborFortnite.ts/buildDocksideMiniMart";
const ferris = "client/tests/FerrisTicketBooth.test.ts + tools/harbor-v2/repair_ticket_booth.py";
const rescue = "client/tests/RescueQuay.test.ts + tools/harbor-v2/zones/build_rescue_quay.py";
const station = "client/tests/ResponseStationIntegration.test.ts + tools/harbor-v2/zones/build_response_station.py";

function opening(name: string, zone: string, source: string, origin: Vec3Tuple, direction: Vec3Tuple, far: number): StaticAssetProbe {
  return { name, zone, source, origin, direction, far, expectation: "open" };
}
function surface(name: string, zone: string, source: string, origin: Vec3Tuple, direction: Vec3Tuple, far: number,
  visualCoordinate: StaticAssetProbe["visualCoordinate"], collisionCoordinate: number): StaticAssetProbe {
  return { name, zone, source, origin, direction, far, expectation: "surface", visualCoordinate, collisionCoordinate, tolerance: .001 };
}

export const STATIC_ASSET_PROBES: readonly StaticAssetProbe[] = [
  opening("house_front_door", "garden-ac", structural, [-35, 1.8, 27], [0, 0, -1], 1.6),
  ...([1, 2] as const).flatMap(floor => [
    opening(`house_left_window_${floor}f`, "garden-ac", structural, [-41, floor === 1 ? 2.2 : 7.2, 22], [1, 0, 0], 1.4),
    opening(`house_right_window_${floor}f`, "garden-ac", structural, [-29, floor === 1 ? 2.2 : 7.2, 22], [-1, 0, 0], 1.4),
  ]),
  opening("house_loggia_door", "garden-ac", structural, [-35, 7, 27], [0, 0, -1], 1.4),
  opening("house_chimney_flue", "garden-ac", structural, [-31.5, 13.4, 19], [0, -1, 0], 12.5),
  opening("house_hearth_exit", "garden-ac", structural, [-31.5, 1.7, 19.4], [0, 0, 1], 1.2),
  surface("house_2f_floor", "garden-ac", structural, [-35, 6, 23], [0, -1, 0], 1.5, 5.55, 5.55),
  // Pitched visual = 13.65-.54*abs(z-22). The existing eight-step physical roof
  // uses segment centre z=23.875: these are intentionally different surfaces,
  // not a blanket tolerance that could conceal a newly displaced floor.
  surface("house_roof_pitch", "garden-ac", `${structural}; oldHarborFortnite.ts/buildBackyardHouse stepped roof`,
    [-35, 14, 24], [0, -1, 0], 2, 12.57, 12.6375),
  surface("construction_pour_1f", "construction-ad", structural, [-31.6, 4, -18.5], [0, -1, 0], 1.2, 3.5, 3.5),
  surface("construction_pour_2f", "construction-ad", structural, [-31.6, 7.2, -18.5], [0, -1, 0], 1.2, 6.7, 6.7),
  surface("construction_column", "construction-ad", structural, [-37, 1.7, -22], [1, 0, 0], 1.3, -36.21, -36.21),
  surface("construction_bridge", "construction-ad", structural, [-34.8, 5.7, -25.5], [0, -1, 0], 1.2, 5.1, 5.1),
  // RP03 original audit's named native hit at x=0: High has a galvanized seam;
  // Low hits the pitched panel. The 3m stepped collider uses centre z=4.5.
  surface("warehouse_roof", "warehouse", "tools/harbor-v2/build_warehouse.py/build_colliders; RP03 native ray (galvanized seam High, panel Low)",
    [0, 11, 4], [0, -1, 0], 3, { high: 9.199706984966365, low: 9.139975537616657 }, 8.15 + 13.5 * Math.tan(4 * Math.PI / 180)),
  ...[.45, .92, 1.8].flatMap(y => [
    opening(`operations_personnel_door_y${y}`, "operations-ab", structural, [-3.2, y, -28], [0, 0, -1], 2.5),
    opening(`operations_roller_door_y${y}`, "operations-ab", structural, [3.5, y, -28], [0, 0, -1], 2.5),
    opening(`operations_side_door_y${y}`, "operations-ab", structural, [-10.5, y, -36], [1, 0, 0], 2.2),
  ]),
  opening("market_front_entry", "container-bd", market, [45, 1.7, -31], [0, 0, -1], 3.5),
  opening("market_stockroom_entry", "container-bd", market, [40.15, 1.6, -40.2], [0, 0, -1], 1.1),
  opening("market_office_entry", "container-bd", market, [42.35, 1.6, -40.2], [0, 0, -1], 1.1),
  opening("market_roof_hatch", "container-bd", market, [38.85, 7, -41.3], [0, -1, 0], 3),
  surface("market_roof", "container-bd", market, [45, 7, -39], [0, -1, 0], 2, 5.8, 5.8),
  opening("ferris_ticket_side_entry", "ferris-harbor", ferris, [-21.5, 1.5, 30.8], [1, 0, 0], 1.1),
  surface("ferris_ticket_roof", "ferris-harbor", ferris, [-19, 5, 31], [0, -1, 0], 3, 3.4, 3.4),
  surface("ferris_ticket_floor", "ferris-harbor", ferris, [-19, .5, 31], [0, -1, 0], .4, .2, .2),
  surface("ferris_ticket_glazing", "ferris-harbor", ferris, [-19, 1.8, 34], [0, 0, -1], 3, 32.83, 32.83),
  ...[43.4, 45, 48.6].flatMap(x => [
    opening(`rescue_maintenance_lane_x${x}`, "rescue-quay", rescue, [x, 1.5, 12.5], [0, 0, 1], 20),
    // Authored expansion strip centred y=.242, thickness .004, only at x=45.
    surface(`rescue_apron_x${x}`, "rescue-quay", rescue, [x, .31, 28], [0, -1, 0], .1, x === 45 ? .244 : .24, .24),
  ]),
  surface("rescue_watchtower_deck", "rescue-quay", rescue, [40, 6.15, 30], [0, -1, 0], .12, 6.075, 6.075),
  surface("response_floor", "response-station", station, [-40, .3, 1], [0, -1, 0], .25, .14, .14),
  { ...surface("response_gate_closed", "response-station", station, [-36, 1.8, 0], [1, 0, 0], 1.5, -35.105, -35.125), gate: "closed" },
  { ...opening("response_release_lane", "response-station", station, [-47.7, 1.1, 0], [1, 0, 0], 14), gate: "open" },
];
