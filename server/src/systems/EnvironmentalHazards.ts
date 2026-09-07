import type { MapData } from "@catch-and-run/shared";

export function findWaterHazard(
  mapData: MapData,
  x: number,
  y: number,
  z: number,
): string | null {
  for (const hazard of mapData.waterHazards ?? []) {
    if (
      x >= hazard.min.x
      && x <= hazard.max.x
      && y >= hazard.min.y
      && y <= hazard.max.y
      && z >= hazard.min.z
      && z <= hazard.max.z
    ) {
      return hazard.id;
    }
  }
  return null;
}
