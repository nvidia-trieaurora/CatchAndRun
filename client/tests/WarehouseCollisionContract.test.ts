import { describe, expect, it } from "vitest";
import warehouseManifest from "../public/assets/maps/harbor-v2/warehouse.manifest.json";

interface Bounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

const collisions = warehouseManifest.collisions as (Bounds & {
  name: string;
})[];

function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.min.x < b.max.x
    && a.max.x > b.min.x
    && a.min.y < b.max.y
    && a.max.y > b.min.y
    && a.min.z < b.max.z
    && a.max.z > b.min.z
  );
}

describe("Warehouse movement contract", () => {
  it("keeps the wide front doorway clear at player-body height", () => {
    const frontPassage: Bounds = {
      min: { x: -8.8, y: 0.6, z: 17.35 },
      max: { x: 8.8, y: 1.8, z: 18.65 },
    };

    expect(collisions.filter((collider) => overlaps(collider, frontPassage)))
      .toHaveLength(0);
  });

  it("keeps the right loading doorway clear below its header", () => {
    const rightPassage: Bounds = {
      min: { x: 22.35, y: 0.6, z: -5.6 },
      max: { x: 23.15, y: 1.8, z: 9.6 },
    };

    expect(collisions.filter((collider) => overlaps(collider, rightPassage)))
      .toHaveLength(0);
  });

  it("ships both visible exterior stair runs and roof landings", () => {
    const stairs = collisions.filter((collider) =>
      collider.name.startsWith("COL_MOVE_EXT_STAIR_")
    );

    expect(stairs).toHaveLength(44);
    expect(Math.max(...stairs.map((collider) => collider.max.y)))
      .toBeGreaterThanOrEqual(8.25);
  });
});
