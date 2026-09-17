import * as THREE from "three";
import type { MapData } from "@catch-and-run/shared";
import type { MapAssetInstance } from "../assets/MapAssetLoader";
import type { QualityTier } from "../../../config/QualityManager";
import {
  buildOldHarborFortniteMap,
  type MapBuildResult,
} from "./oldHarborFortnite";
import { FerrisHarborRig } from "../zones/FerrisHarborRig";
import { MooringRopes } from "../zones/MooringRopes";
import { attachHarborMarketLighting } from "../lighting/harborMarketLighting";
import { attachResponseStationLighting } from "../lighting/responseStationLighting";

export interface HarborV2BuildResult extends MapBuildResult {
  warehouseV2Root: THREE.Group | null;
  cinematicV2Root: THREE.Group | null;
  zoneRoots: THREE.Group[];
  /** Present when the Ferris Harbor zone supplies the wheel visuals. */
  ferrisRig: FerrisHarborRig | null;
  /** Rope meshes between boat and cleat sockets of the active zones. */
  mooringRopes: MooringRopes | null;
}

export function buildHarborV2Map(
  scene: THREE.Scene,
  mapData: MapData,
  warehouseV2: MapAssetInstance | null,
  quality: QualityTier = "medium",
  cinematicV2: MapAssetInstance | null = null,
  zones: MapAssetInstance[] = [],
): HarborV2BuildResult {
  const activeZones = cinematicV2 ? zones : [];
  const responseStation = activeZones.some((zone) => {
    let hasGate = false;
    zone.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData.gameplayRole === "hunterGate") hasGate = true;
    });
    return hasGate;
  });
  const rescueQuay = activeZones.some((zone) => zone.root.getObjectByProperty("name", "MESH_RESCUE_QUAY_RQ_STEEL_LOD0")
    || zone.root.getObjectByProperty("name", "MESH_RESCUE_QUAY_RQ_STEEL_LOD1"));
  const ferrisRig = FerrisHarborRig.fromRoots(activeZones.map((zone) => zone.root));
  const result = buildOldHarborFortniteMap(
    scene,
    mapData,
    {
      useWarehouseV2: warehouseV2 !== null,
      cinematicVisuals: cinematicV2 !== null,
      quality,
      // the zone GLB draws the wheel; the procedural build keeps only the gameplay rig
      ferrisVisuals: ferrisRig === null,
      rescueQuay,
      responseStation,
    },
  );

  if (warehouseV2) {
    scene.add(warehouseV2.root);
    result.colliders.push(...warehouseV2.colliders);
    result.ladders.push(...warehouseV2.ladders);
  }

  if (cinematicV2) {
    scene.add(cinematicV2.root);
    result.colliders.push(...cinematicV2.colliders);
    result.ladders.push(...cinematicV2.ladders);
    const cinematicGate = cinematicV2.root.getObjectByName("MESH_HUNTER_GATE");
    if (cinematicGate instanceof THREE.Mesh) {
      result.gateMesh = cinematicGate;
    }
  }

  // Edge-zone GLBs replace the cinematic visuals of their corner. Gameplay
  // collision stays procedural + cinematic; a zone only adds the namespaced
  // COL_MOVE_<ZONE>_* boxes for props it introduces (crane mast, shelter,
  // material stacks), so the props it renders are the props players collide with.
  const zoneRoots: THREE.Group[] = [];
  for (const zone of activeZones) {
    attachHarborMarketLighting(zone.root, quality);
    attachResponseStationLighting(zone.root, quality);
    scene.add(zone.root);
    zoneRoots.push(zone.root);
    result.colliders.push(...zone.colliders);
    result.ladders.push(...zone.ladders);
    // The response station ships its gate at both quality tiers. Use the
    // surviving gate mesh after LOD selection for the existing release logic.
    zone.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData.gameplayRole === "hunterGate") {
        result.gateMesh = object;
        // The station finish floor sits 4 cm above the old procedural slab,
        // clearing the cinematic asphalt. The original shell/gate stays valid.
        if (object.userData.gateMotion === "roller") {
          result.colliders.push(new THREE.Box3(new THREE.Vector3(-49, .1, -7), new THREE.Vector3(-35, .14, 7)));
        }
      }
    });
  }

  let mooringRopes: MooringRopes | null = null;
  if (zoneRoots.length > 0) {
    const ropes = new MooringRopes(zoneRoots, quality === "low");
    if (ropes.getRopeCount() > 0) {
      scene.add(ropes.group);
      mooringRopes = ropes;
    } else {
      ropes.dispose();
    }
  }

  return {
    ...result,
    warehouseV2Root: warehouseV2?.root ?? null,
    cinematicV2Root: cinematicV2?.root ?? null,
    zoneRoots,
    ferrisRig,
    mooringRopes,
  };
}
