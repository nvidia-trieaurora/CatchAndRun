import { describe, expect, it } from "vitest";
import cinematicManifest from "../public/assets/maps/harbor-v2/cinematic/harbor-cinematic.manifest.json";

interface Bounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

const collisions = cinematicManifest.collisions as (Bounds & {
  name: string;
})[];

function blockers(passage: Bounds) {
  return collisions.filter((collider) => (
    collider.min.x < passage.max.x
    && collider.max.x > passage.min.x
    && collider.min.y < passage.max.y
    && collider.max.y > passage.min.y
    && collider.min.z < passage.max.z
    && collider.max.z > passage.min.z
  ));
}

describe("Cinematic Harbor collision contract", () => {
  it("ships explicit shell colliders for V2-only buildings", () => {
    expect(collisions).toHaveLength(55);
    expect(collisions.some((collider) =>
      collider.name === "COL_MOVE_CINE_TICKET_BACK"
    )).toBe(true);
  });

  it("matches visible container-yard obstacles without restoring the hidden fence", () => {
    const containerColliders = collisions.filter((collider) =>
      collider.name.startsWith("COL_MOVE_CINE_CONTAINER_")
    );
    expect(containerColliders).toHaveLength(14);
    expect(collisions.some((collider) =>
      collider.name === "COL_MOVE_CINE_FORKLIFT"
    )).toBe(true);

    expect(blockers({
      min: { x: 24, y: 0.5, z: 1.7 },
      max: { x: 27, y: 2.2, z: 2.3 },
    })).toHaveLength(0);
  });

  it("blocks the construction frame columns and fixed Hunter-spawn walls", () => {
    const constructionColumns = collisions.filter((collider) =>
      collider.name.startsWith("COL_MOVE_CINE_CONSTRUCTION_COLUMN_")
    );
    const hunterSpawnWalls = collisions.filter((collider) =>
      collider.name.startsWith("COL_MOVE_CINE_HUNTER_SPAWN_")
    );

    expect(constructionColumns).toHaveLength(9);
    expect(hunterSpawnWalls.map((collider) => collider.name).sort()).toEqual([
      "COL_MOVE_CINE_HUNTER_SPAWN_BACK",
      "COL_MOVE_CINE_HUNTER_SPAWN_FRONT",
      "COL_MOVE_CINE_HUNTER_SPAWN_WEST",
    ]);

    expect(blockers({
      min: { x: -42.15, y: 0.5, z: -22.15 },
      max: { x: -41.85, y: 2.6, z: -21.85 },
    }).map((collider) => collider.name)).toContain(
      "COL_MOVE_CINE_CONSTRUCTION_COLUMN_01",
    );
    expect(blockers({
      min: { x: -43, y: 0.5, z: -7.1 },
      max: { x: -41, y: 2.6, z: -6.9 },
    }).map((collider) => collider.name)).toContain(
      "COL_MOVE_CINE_HUNTER_SPAWN_BACK",
    );
  });

  it("keeps the Hunter-spawn gate side open for the dynamic gameplay gate", () => {
    expect(blockers({
      min: { x: -35.3, y: 0.5, z: -5.8 },
      max: { x: -34.7, y: 2.6, z: 5.8 },
    })).toHaveLength(0);
  });

  it("keeps the Ferris ticket-booth doorway usable", () => {
    expect(blockers({
      min: { x: -19.45, y: 0.5, z: 32.65 },
      max: { x: -17.55, y: 2.6, z: 32.95 },
    })).toHaveLength(0);
  });

  it("keeps both Bar doors and the Mart entrance unobstructed", () => {
    expect(blockers({
      min: { x: -4.8, y: 0.5, z: -29.75 },
      max: { x: -2.2, y: 2.6, z: -29.2 },
    })).toHaveLength(0);
    expect(blockers({
      min: { x: 2.2, y: 0.5, z: -29.75 },
      max: { x: 4.8, y: 2.6, z: -29.2 },
    })).toHaveLength(0);
    expect(blockers({
      min: { x: 44.1, y: 0.5, z: -33.25 },
      max: { x: 45.9, y: 2.6, z: -32.7 },
    })).toHaveLength(0);
  });
});
