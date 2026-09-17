import * as THREE from "three";
import type { ZoneOverride } from "../assets/MapAssetLoader";

/**
 * Harbor V2 edge zones authored as dedicated GLBs. Each zone replaces the
 * matching part of the cinematic Harbor (see `ZoneOverride`). Gameplay collision
 * keeps coming from the procedural map and `harbor-cinematic.glb`; a zone may add
 * namespaced `COL_MOVE_<ZONE>_*` / `COL_LADDER_<ZONE>_*` boxes for props it
 * introduces and, when it re-lays a district, name the legacy cinematic colliders
 * it replaces in `removeNames` (validated by the zone contract + tests).
 *
 * `?harborZones=staging` swaps every zone to its `_staging` candidate served by
 * the Vite dev middleware, which lets a candidate be reviewed in-game before
 * it is promoted into `client/public/assets/maps/harbor-v2/zones/`.
 */
export interface HarborZoneAsset {
  id: string;
  title: string;
  url: string;
  stagingUrl: string;
  /**
   * True once the candidate has been copied to `url`. Production clients only
   * request promoted zones, so an unpromoted candidate never 404s in the field;
   * `?harborZones=staging` ignores the flag. Flip it as part of the promotion
   * and bump the `?v=` token on `url` so cached clients pick up the new GLB.
   */
  promoted: boolean;
  override: ZoneOverride;
}

/**
 * Legacy cinematic movement colliders the BD container yard re-authors. The zone
 * GLB ships the replacement COL_MOVE_CONTAINER_BD_* boxes with its visuals, so the
 * old scattered containers (and the forklift parked in the new main lane) are
 * dropped before MapAssetLoader collects colliders. Yard office, lamp posts and
 * seawalls keep their legacy colliders. The Market shell is owned
 * by the procedural floorplan plus native ceiling/header panels, not old 2m doors.
 */
export const CONTAINER_BD_REMOVED_COLLIDERS: readonly string[] = [
  ...Array.from({ length: 14 }, (_, i) => `COL_MOVE_CINE_CONTAINER_${String(i).padStart(2, "0")}`),
  "COL_MOVE_CINE_FORKLIFT",
  ...["BACK", "FRONT_EDGE_L", "FRONT_EDGE_R", "FRONT_HEADER", "FRONT_WINDOW_L", "FRONT_WINDOW_R", "LEFT", "RIGHT"]
    .map((part) => `COL_MOVE_CINE_MART_${part}`),
];

/** Mini Mart shell inside the shared dock meshes (walls, roof, glass, canopy, neon); slab kept. */
const CONTAINER_BD_MART_BOX = new THREE.Box3(new THREE.Vector3(37.0, 0.3, -44.5), new THREE.Vector3(53.6, 8.0, -28.0));
const CONTAINER_BD_CARVE_BOX = new THREE.Box3(new THREE.Vector3(29.5, -1.0, -43.6), new THREE.Vector3(62.6, 14.0, 2.6));
const CONTAINER_BD_GROUND_BOX = new THREE.Box3(new THREE.Vector3(29.5, 0.05, -43.6), new THREE.Vector3(62.6, 14.0, 2.6));

/**
 * Cinematic house colliders of the AC residence that duplicate the procedural walls
 * WITHOUT the openings the procedural house has: they sealed the 5 m side window bands
 * (1F 1.35..3.35, 2F 6.35..8.35) and the 2F loggia door onto the balcony. The
 * procedural colliders (`buildBackyardHouse`) already model every wall with its door,
 * loggia and window openings, so the cinematic copies are dropped; the solid back
 * wall copy is harmless and stays.
 */
export const GARDEN_AC_REMOVED_COLLIDERS: readonly string[] = [
  "COL_MOVE_CINE_HOUSE_FRONT_L",
  "COL_MOVE_CINE_HOUSE_FRONT_R",
  "COL_MOVE_CINE_HOUSE_FRONT_HEADER",
  "COL_MOVE_CINE_HOUSE_LEFT",
  "COL_MOVE_CINE_HOUSE_RIGHT",
];

/**
 * Cinematic Dockside Bar colliders replaced by the AB Operations building. They sealed
 * the two 3 m front openings, the west side door and the interior; the procedural
 * `buildDocksideCafeBar` boxes already model the shell with those openings, and the
 * zone ships its own COL_MOVE_OPERATIONS_AB_* boxes for the new equipment.
 */
export const OPERATIONS_AB_REMOVED_COLLIDERS: readonly string[] = [
  "COL_MOVE_CINE_BAR_BACK",
  "COL_MOVE_CINE_BAR_FRONT_CENTER",
  "COL_MOVE_CINE_BAR_FRONT_LEFT",
  "COL_MOVE_CINE_BAR_FRONT_RIGHT",
  "COL_MOVE_CINE_BAR_LEFT",
  "COL_MOVE_CINE_BAR_RIGHT",
];

/** AB strip: AD fence (x -23.4) to the BD yard (x 29.5), seawall to the Warehouse north wall. */
export const OPERATIONS_AB_CARVE_BOX = new THREE.Box3(new THREE.Vector3(-23.3, -1.0, -43.6), new THREE.Vector3(29.45, 12.0, -18.05));
const RESCUE_QUAY_BOX = new THREE.Box3(new THREE.Vector3(32.5, 0.11, 11.5), new THREE.Vector3(61, 12, 34));
const RETIRED_PIER_KIOSK_BOX = new THREE.Box3(new THREE.Vector3(36.8, 0.38, 34.3), new THREE.Vector3(41.2, 4, 38));
const RESPONSE_STATION_BOX = new THREE.Box3(new THREE.Vector3(-50, -0.1, -7.8), new THREE.Vector3(-34, 7, 7.8));
/** Dockside Bar shell, roof (it overhangs to z -43.5) and deck furniture inside the shared dock/harbor batches; slab kept (y ≥ 0.3). */
const OPERATIONS_AB_BUILDING_BOX = new THREE.Box3(new THREE.Vector3(-10.5, 0.3, -43.6), new THREE.Vector3(10.5, 9.0, -26.0));
/** Same for the map-wide steel batch, stopping at z -42.4 so the seawall rail (z -43) survives. */
const OPERATIONS_AB_BUILDING_BOX_RAIL_SAFE = new THREE.Box3(new THREE.Vector3(-10.5, 0.3, -42.4), new THREE.Vector3(10.5, 9.0, -26.0));
/** Legacy road dashes and puddles on the inspection lane (asphalt itself is never carved). */
const OPERATIONS_AB_LANE_BOX = new THREE.Box3(new THREE.Vector3(-23.3, 0.1, -25.5), new THREE.Vector3(29.45, 0.3, -18.05));

export const HARBOR_ZONE_ASSETS: readonly HarborZoneAsset[] = [
  {
    id: "garden-ac",
    title: "AC - Waterfront Residential Garden",
    url: "/assets/maps/harbor-v2/zones/garden-ac.glb?v=20260910-rp03",
    stagingUrl: "/staging-assets/structural-rp03/garden-ac-runtime.glb",
    promoted: true,
    override: {
      removeZones: ["residential", "garden-detail"],
      removeNames: ["base_MESH_foliage_LOD0", "harbor_MESH_foliage_LOD1", ...GARDEN_AC_REMOVED_COLLIDERS],
      carveBox: new THREE.Box3(
        new THREE.Vector3(-56, -1, 11.5),
        new THREE.Vector3(-17.5, 20, 47.5),
      ),
      // The retired solid greenhouse is merged into the map-wide Low steel batch
      // with inherited container-yard metadata. Remove just its measured bounds;
      // otherwise its walls/roof obscure the new garden and Ferris ticket office.
      carveNames: [{
        name: "harbor_MESH_steel_galvanized_LOD1",
        box: new THREE.Box3(new THREE.Vector3(-28.3, -.05, 35.4), new THREE.Vector3(-21.7, 3.3, 40.6)),
      }, {
        // Interior timber at the retired 4.75m floor must not overlap the native
        // house's 5.55m support surface. Preserve the porch and shared boardwalk.
        name: "harbor_MESH_wood_LOD1",
        box: new THREE.Box3(new THREE.Vector3(-40.3, .45, 17.7), new THREE.Vector3(-29.7, 10.7, 26.3)),
      }],
    },
  },
  {
    id: "construction-ad",
    title: "AD - Waterfront Construction Site",
    url: "/assets/maps/harbor-v2/zones/construction-ad.glb?v=20260910-rp03",
    stagingUrl: "/staging-assets/structural-rp03/construction-ad-runtime.glb",
    promoted: true,
    override: {
      removeZones: ["construction", "construction-detail"],
      // stop short of the seawall (x -55 / z -43) so its rail LOD1 survives
      carveBox: new THREE.Box3(
        new THREE.Vector3(-54, -1, -42),
        new THREE.Vector3(-23.6, 30, -8),
      ),
      carveNames: [
        { name: "harbor_MESH_safety_LOD1" },
        { name: "harbor_MESH_steel_galvanized_LOD1" },
        { name: "harbor_MESH_glass_warm_LOD1" },
        { name: "harbor_MESH_wood_LOD1" },
        { name: "harbor_MESH_steel_navy_LOD1" },
        // keep the island ground in the same batch: only carve above 0.3 m
        { name: "harbor_MESH_concrete_LOD1", box: new THREE.Box3(new THREE.Vector3(-54, 0.3, -42), new THREE.Vector3(-23.6, 30, -8)) },
        { name: "harbor_MESH_concrete_warm_LOD1", box: new THREE.Box3(new THREE.Vector3(-54, 0.3, -42), new THREE.Vector3(-23.6, 30, -8)) },
      ],
    },
  },
  {
    // Ferris wheel + working pier + boat fleet. The GLB also carries the animated
    // wheel/cabin/boat rig nodes (see FerrisHarborRig) and mooring sockets.
    id: "ferris-harbor",
    title: "Ferris Harbor District",
    url: "/assets/maps/harbor-v2/zones/ferris-harbor.glb?v=20260910-rp04-b51a69ec",
    stagingUrl: "/staging-assets/fleet-rp04/ferris-harbor-runtime.glb",
    promoted: true,
    override: {
      removeZones: ["ferris-static", "boats"],
      removeNames: ["BACK", "LEFT", "RIGHT", "FRONT_L", "FRONT_R", "HEADER"].map((part) => `COL_MOVE_CINE_TICKET_${part}`),
      // legacy pier dressing families inside the district (the same families keep
      // living east of x 32 next to the pier kiosk)
      removeNamePrefixes: [
        "MESH_BOLLARD_", "MESH_PIER_PILE_", "MESH_BUOY_", "MESH_DOCK_FENDER_", "MESH_DOCK_LIFE_RING_",
        "MESH_FISHING_NET_LINE_", "MESH_MOORING_CLEAT_", "MESH_PIER_CHAIR_", "MESH_PIER_TABLE_",
        "MESH_PIER_UMBRELLA_", "MESH_ROPE_COIL_",
      ],
      carveBox: new THREE.Box3(new THREE.Vector3(-22.5, -3.5, 27), new THREE.Vector3(32, 24, 62)),
      carveNames: [
        // the legacy boardwalk is one 72 m slab: the zone replaces it end to end
        { name: "base_MESH_wood_LOD0", box: new THREE.Box3(new THREE.Vector3(-22.5, 0.05, 33), new THREE.Vector3(52, 0.6, 43)) },
        { name: "harbor_MESH_wood_LOD1", box: new THREE.Box3(new THREE.Vector3(-22.5, 0.05, 33), new THREE.Vector3(52, 0.6, 43)) },
        { name: "dock-detail_MESH_safety_LOD0" },
        { name: "harbor_MESH_safety_LOD1" },
        { name: "dock-detail_MESH_steel_galvanized_LOD0" },
        { name: "harbor_MESH_steel_galvanized_LOD1" },
        // low-tier merges of the old wheel platform, A-frames, axle and ticket booth;
        // x stops at 2.4 / 1.7 so the restored-landmark kiosk (x 1.8..8.2) keeps its LOD1
        { name: "harbor_MESH_concrete_warm_LOD1", box: new THREE.Box3(new THREE.Vector3(-22.5, 0.3, 27), new THREE.Vector3(2.4, 24, 40)) },
        { name: "harbor_MESH_steel_navy_LOD1", box: new THREE.Box3(new THREE.Vector3(-22.5, 0, 27), new THREE.Vector3(2.4, 24, 40)) },
        { name: "harbor_MESH_rust_LOD1", box: new THREE.Box3(new THREE.Vector3(-22.5, 3, 27), new THREE.Vector3(2.4, 24, 40)) },
        { name: "harbor_MESH_glass_warm_LOD1", box: new THREE.Box3(new THREE.Vector3(-22.5, 0, 27), new THREE.Vector3(2.4, 24, 40)) },
        { name: "harbor_MESH_neon_violet_LOD1", box: new THREE.Box3(new THREE.Vector3(-22.5, 0, 27), new THREE.Vector3(2.4, 24, 40)) },
        { name: "harbor_MESH_roof_LOD1", box: new THREE.Box3(new THREE.Vector3(-22.5, 0, 27), new THREE.Vector3(1.7, 24, 40)) },
      ],
    },
  },
  {
    // BD Eastern Container Yard: forklift lane, container blocks, loading zone and
    // the Mini Mart rebuilt as a harbour shop. Ships its own container colliders and
    // drops the legacy cinematic ones (CONTAINER_BD_REMOVED_COLLIDERS).
    id: "container-bd",
    title: "BD Eastern Container Yard",
    url: "/assets/maps/harbor-v2/zones/container-bd.glb?v=20260910-rp04-3e593113",
    stagingUrl: "/staging-assets/market-rp04/container-bd-runtime.glb",
    promoted: true,
    override: {
      removeZones: ["container-yard"],
      removeNames: [...CONTAINER_BD_REMOVED_COLLIDERS],
      // instanced legacy clutter inside the yard (pallets, barrels, tires, cones and
      // the collider-less street lamp standing in the new turning bay)
      removeNamePrefixes: [
        "MESH_LOOSE_PALLET_", "MESH_OIL_BARREL_", "MESH_TIRE_", "MESH_TRAFFIC_CONE_",
        "MESH_LAMP_ARM_", "MESH_LAMP_LIGHT_", "MESH_LAMP_POST_",
      ],
      carveBox: CONTAINER_BD_CARVE_BOX,
      carveNames: [
        // Mini Mart shell lives in the dock meshes shared with the Dockside Bar
        { name: "dock_MESH_concrete_warm_LOD0", box: CONTAINER_BD_MART_BOX },
        { name: "dock_MESH_container_teal_LOD0", box: CONTAINER_BD_MART_BOX },
        { name: "dock_MESH_glass_warm_LOD0", box: CONTAINER_BD_MART_BOX },
        { name: "dock_MESH_neon_cyan_LOD0", box: CONTAINER_BD_MART_BOX },
        { name: "dock_MESH_roof_LOD0", box: CONTAINER_BD_MART_BOX },
        { name: "harbor_MESH_neon_cyan_LOD1", box: CONTAINER_BD_MART_BOX },
        { name: "harbor_MESH_roof_LOD1", box: CONTAINER_BD_MART_BOX },
        { name: "harbor_MESH_concrete_warm_LOD1", box: CONTAINER_BD_MART_BOX },
        // shared-prop merges reaching into the yard (tires, puddles) — ground stays
        { name: "shared-props_MESH_rubber_LOD0", box: CONTAINER_BD_GROUND_BOX },
        { name: "shared-props_MESH_puddle_LOD0", box: CONTAINER_BD_GROUND_BOX },
        { name: "harbor_MESH_puddle_LOD1", box: CONTAINER_BD_GROUND_BOX },
      ],
    },
  },
  {
    // AB Harbor Operations & Repair Lane: inspection lane with weighbridge, the Dockside
    // Bar re-dressed as the enterable Operations building (control office + workshop),
    // Warehouse service wall, seawall pump house / davit pocket and the BD checkpoint.
    // Promoted 2026-09-09 on request (byte-identical to the validated candidate).
    id: "operations-ab",
    title: "AB - Harbor Operations & Repair Lane",
    url: "/assets/maps/harbor-v2/zones/operations-ab.glb?v=20260910-rp03",
    stagingUrl: "/staging-assets/structural-rp03/operations-ab-runtime.glb",
    promoted: true,
    override: {
      removeZones: [],
      removeNames: [...OPERATIONS_AB_REMOVED_COLLIDERS],
      carveBox: OPERATIONS_AB_CARVE_BOX,
      carveNames: [
        // Dockside Bar shell + deck furniture live in the dock batches shared with the Mini Mart
        { name: "dock_MESH_glass_warm_LOD0", box: OPERATIONS_AB_BUILDING_BOX },
        { name: "dock_MESH_neon_violet_LOD0", box: OPERATIONS_AB_BUILDING_BOX },
        { name: "dock_MESH_roof_LOD0", box: OPERATIONS_AB_BUILDING_BOX },
        { name: "dock_MESH_steel_navy_LOD0", box: OPERATIONS_AB_BUILDING_BOX },
        { name: "dock_MESH_wood_LOD0", box: OPERATIONS_AB_BUILDING_BOX },
        { name: "harbor_MESH_glass_warm_LOD1", box: OPERATIONS_AB_BUILDING_BOX },
        { name: "harbor_MESH_neon_violet_LOD1", box: OPERATIONS_AB_BUILDING_BOX },
        { name: "harbor_MESH_roof_LOD1", box: OPERATIONS_AB_BUILDING_BOX },
        { name: "harbor_MESH_wood_LOD1", box: OPERATIONS_AB_BUILDING_BOX },
        { name: "harbor_MESH_steel_navy_LOD1", box: OPERATIONS_AB_BUILDING_BOX_RAIL_SAFE },
        // legacy lane dashes + puddles under the new lane paint (asphalt/concrete never carved)
        { name: "base_MESH_road_marking_LOD0", box: OPERATIONS_AB_LANE_BOX },
        { name: "harbor_MESH_road_marking_LOD1", box: OPERATIONS_AB_LANE_BOX },
        { name: "shared-props_MESH_puddle_LOD0", box: OPERATIONS_AB_LANE_BOX },
        { name: "harbor_MESH_puddle_LOD1", box: OPERATIONS_AB_LANE_BOX },
      ],
    },
  },
  {
    id: "response-station",
    title: "Port Response Station",
    url: "/assets/maps/harbor-v2/zones/response-station.glb?v=20260917-rp05",
    stagingUrl: "/staging-assets/response-station/response-station-candidate.glb",
    promoted: true,
    override: {
      removeZones: ["hunter-spawn"],
      carveBox: RESPONSE_STATION_BOX,
      // Low-tier batches are map-wide; old 4.2 m cage and floating neon sign go.
      carveNames: ["steel_navy", "rust", "neon_violet", "concrete"].map((mat) => ({
        name: `harbor_MESH_${mat}_LOD1`, box: RESPONSE_STATION_BOX,
      })),
    },
  },
  {
    id: "rescue-quay",
    title: "Marine Rescue Maintenance Quay",
    url: "/assets/maps/harbor-v2/zones/rescue-quay.glb?v=20260909-rp02",
    stagingUrl: "/staging-assets/rescue-quay-candidate.glb",
    promoted: true,
    override: {
      removeZones: [],
      // Old decorative crate at (52, .5, 18) would intersect the raised service
      // apron. It has no movement collider; other cargo crates stay untouched.
      removeNames: ["COL_MOVE_CINE_PIER_KIOSK", "MESH_CRATE_4"],
      carveBox: RESCUE_QUAY_BOX,
      removeNamePrefixes: ["MESH_WATCHTOWER_", "MESH_LOOSE_PALLET_", "MESH_OIL_BARREL_", "MESH_TIRE_", "MESH_TRAFFIC_CONE_"],
      carveNames: [
        ...["container_teal", "glass_warm", "neon_cyan"].flatMap((mat) => [
          { name: `dock-detail_MESH_${mat}_LOD0`, box: RETIRED_PIER_KIOSK_BOX },
          { name: `harbor_MESH_${mat}_LOD1`, box: RETIRED_PIER_KIOSK_BOX },
        ]),
        ...["steel_navy", "steel_galvanized", "container_red", "safety", "wood", "glass_warm", "neon_cyan", "neon_violet", "foliage"].flatMap((mat) => [
          { name: `restored-landmarks_MESH_${mat}_LOD0` },
          { name: `harbor_MESH_${mat}_LOD1` },
        ]),
        { name: "base_MESH_wood_LOD0" },
        { name: "base_MESH_foliage_LOD0" },
        { name: "shared-props_MESH_rubber_LOD0" },
        { name: "shared-props_MESH_puddle_LOD0" },
      ],
    },
  },
];

export type HarborZoneSource = "production" | "staging" | "off";

export function resolveHarborZoneSource(search: string): HarborZoneSource {
  const value = new URLSearchParams(search).get("harborZones");
  if (value === "staging") return "staging";
  if (value === "off" || value === "0") return "off";
  return "production";
}

export function zoneAssetUrl(asset: HarborZoneAsset, source: HarborZoneSource): string {
  return source === "staging" ? asset.stagingUrl : asset.url;
}

/** Zones a client should request for the given source (none when zones are off). */
export function activeHarborZoneAssets(source: HarborZoneSource): HarborZoneAsset[] {
  if (source === "off") return [];
  return HARBOR_ZONE_ASSETS.filter((asset) => source === "staging" || asset.promoted);
}
