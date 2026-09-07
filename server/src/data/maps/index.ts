import harborWarehouse from "./harbor-warehouse.json";
import school from "./school.json";
import type { MapData } from "@catch-and-run/shared";

const MAPS: Record<string, MapData> = {
  "harbor-warehouse": harborWarehouse as MapData,
  "school": school as MapData,
};

export function isValidMapId(mapId: string): boolean {
  return mapId in MAPS;
}

/** Returns the map data for mapId, falling back to the default harbor map. */
export function getMapData(mapId: string): MapData {
  return MAPS[mapId] ?? MAPS["harbor-warehouse"];
}
