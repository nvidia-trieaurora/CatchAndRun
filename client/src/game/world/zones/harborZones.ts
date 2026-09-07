import * as THREE from "three";
import type { ZoneOverride } from "../assets/MapAssetLoader";

/**
 * Harbor V2 edge zones authored as dedicated GLBs. Each zone replaces the
 * matching part of the cinematic Harbor (see `ZoneOverride`) and is a pure
 * visual pass: movement colliders keep coming from the procedural map and
 * `harbor-cinematic.glb`, so a zone GLB never ships COL_/MARKER_ nodes.
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

export const HARBOR_ZONE_ASSETS: readonly HarborZoneAsset[] = [
  {
    id: "garden-ac",
    title: "AC - Waterfront Residential Garden",
    url: "/assets/maps/harbor-v2/zones/garden-ac.glb?v=20260907-ac01",
    stagingUrl: "/staging-assets/garden-ac-candidate.glb",
    promoted: true,
    override: {
      removeZones: ["residential", "garden-detail"],
      removeNames: ["base_MESH_foliage_LOD0", "harbor_MESH_foliage_LOD1"],
      carveBox: new THREE.Box3(
        new THREE.Vector3(-56, -1, 11.5),
        new THREE.Vector3(-17.5, 20, 47.5),
      ),
    },
  },
  {
    id: "construction-ad",
    title: "AD - Waterfront Construction Site",
    url: "/assets/maps/harbor-v2/zones/construction-ad.glb?v=20260907-ad03",
    stagingUrl: "/staging-assets/construction-ad-candidate.glb",
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
    url: "/assets/maps/harbor-v2/zones/ferris-harbor.glb?v=20260907-fh01",
    stagingUrl: "/staging-assets/ferris-harbor-candidate.glb",
    promoted: true,
    override: {
      removeZones: ["ferris-static", "boats"],
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
