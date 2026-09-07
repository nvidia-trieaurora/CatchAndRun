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
    scene.add(zone.root);
    zoneRoots.push(zone.root);
    result.colliders.push(...zone.colliders);
    result.ladders.push(...zone.ladders);
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
