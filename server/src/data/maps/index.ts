import harborWarehouse from "./harbor-warehouse.json";
import school from "./school.json";

const MAPS: Record<string, unknown> = {
  "harbor-warehouse": harborWarehouse,
  "school": school,
};

export function isValidMapId(mapId: string): boolean {
  return mapId in MAPS;
}

/** Returns the map data for mapId, falling back to the default harbor map. */
export function getMapData(mapId: string): typeof harborWarehouse {
  return (MAPS[mapId] ?? harborWarehouse) as typeof harborWarehouse;
}
