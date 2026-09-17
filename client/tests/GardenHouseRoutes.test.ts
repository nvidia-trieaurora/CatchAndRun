import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareMapAsset } from "../src/game/world/assets/MapAssetLoader";
import { GARDEN_AC_REMOVED_COLLIDERS, HARBOR_ZONE_ASSETS } from "../src/game/world/zones/harborZones";
import { installHeadlessDom } from "./helpers/headlessDom";

// AC residence contract (buildBackyardHouse): centre (-35, 22), chimney flue centre (-31.5, 19)
const FLUE = new THREE.Box3(new THREE.Vector3(-32.0, 0.6, 18.5), new THREE.Vector3(-31.0, 12.8, 19.5));
const HEARTH_EXIT = new THREE.Box3(new THREE.Vector3(-31.9, 0.6, 19.7), new THREE.Vector3(-31.1, 2.2, 20.6));
// the wall plane (z 25.75..26.25) and the balcony deck in front of it; the desk just
// inside the room (z 25..25.6, a 0.75 m tabletop) is furniture, not a blocker
const LOGGIA_DOOR = new THREE.Box3(new THREE.Vector3(-37.3, 5.7, 25.65), new THREE.Vector3(-32.7, 9.5, 27.2));
// the wall thickness (x -40.25..-39.75 / -30.25..-29.75) plus 10 cm either side
const WINDOW_BANDS = [
  new THREE.Box3(new THREE.Vector3(-40.35, 1.45, 19.6), new THREE.Vector3(-39.65, 3.25, 24.4)), // left 1F
  new THREE.Box3(new THREE.Vector3(-30.35, 1.45, 19.6), new THREE.Vector3(-29.65, 3.25, 24.4)), // right 1F
  new THREE.Box3(new THREE.Vector3(-40.35, 6.45, 19.6), new THREE.Vector3(-39.65, 8.25, 24.4)), // left 2F
  new THREE.Box3(new THREE.Vector3(-30.35, 6.45, 19.6), new THREE.Vector3(-29.65, 8.25, 24.4)), // right 2F
];

function intersecting(colliders: THREE.Box3[], volume: THREE.Box3): THREE.Box3[] {
  return colliders.filter((box) => box.intersectsBox(volume) && !touchesOnly(box, volume));
}

function touchesOnly(a: THREE.Box3, b: THREE.Box3): boolean {
  const dx = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const dy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const dz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  return dx * dy * dz < 1e-6;
}

describe("AC residence routes", () => {
  let colliders: THREE.Box3[] = [];

  beforeAll(async () => {
    installHeadlessDom();
    const { buildOldHarborFortniteMap } = await import("../src/game/world/maps/oldHarborFortnite");
    const mapData = (await import("../src/game/world/harbor-warehouse.json")).default;
    const result = buildOldHarborFortniteMap(new THREE.Scene(), mapData as never, {
      useWarehouseV2: true,
      cinematicVisuals: true,
      quality: "high",
    });
    colliders = result.colliders;
  });

  it("leaves the chimney flue open from the rim down to the hearth and out into the room", () => {
    expect(intersecting(colliders, FLUE)).toEqual([]);
    expect(intersecting(colliders, HEARTH_EXIT)).toEqual([]);
    // the flue is still walled: all four brick walls carry full-height colliders
    const walls = colliders.filter((box) => box.min.y <= 0.4 && box.max.y >= 12.8
      && box.max.x >= -32.3 && box.min.x <= -30.7 && box.max.z >= 18.2 && box.min.z <= 19.8);
    expect(walls.length).toBeGreaterThanOrEqual(3);
    // and the pitched roof around the flue is still solid (no way to slip past the walls)
    const roofBesideFlue = colliders.filter((box) => box.min.y >= 10.5 && box.max.y <= 12.7
      && box.max.x > -33.5 && box.min.x < -32.2 && box.max.z > 18.3 && box.min.z < 19.7);
    expect(roofBesideFlue.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the 2F loggia doorway and the four side window bands collision-free", () => {
    expect(intersecting(colliders, LOGGIA_DOOR)).toEqual([]);
    for (const band of WINDOW_BANDS) {
      // the staircase runs past the 1F left window on the room side; only exterior-side boxes matter
      const hits = intersecting(colliders, band).filter((box) => !(box.min.x > -39.8 && box.max.x < -38.0));
      expect(hits).toEqual([]);
    }
  });

  it("drops the cinematic house colliders that sealed those openings and keeps the back wall", () => {
    const garden = HARBOR_ZONE_ASSETS.find((asset) => asset.id === "garden-ac");
    if (!garden) throw new Error("garden-ac zone asset missing");
    expect(GARDEN_AC_REMOVED_COLLIDERS).toEqual([
      "COL_MOVE_CINE_HOUSE_FRONT_L", "COL_MOVE_CINE_HOUSE_FRONT_R", "COL_MOVE_CINE_HOUSE_FRONT_HEADER",
      "COL_MOVE_CINE_HOUSE_LEFT", "COL_MOVE_CINE_HOUSE_RIGHT",
    ]);
    const root = new THREE.Group();
    const make = (name: string, min: THREE.Vector3, max: THREE.Vector3) => {
      const size = max.clone().sub(min);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshStandardMaterial());
      mesh.name = name;
      mesh.userData.harborZone = "cinematic-collision";
      mesh.position.copy(min).add(size.multiplyScalar(0.5));
      root.add(mesh);
      return mesh;
    };
    make("COL_MOVE_CINE_HOUSE_FRONT_HEADER", new THREE.Vector3(-36.5, 2.9, 25.82), new THREE.Vector3(-33.5, 8.5, 26.18));
    make("COL_MOVE_CINE_HOUSE_LEFT", new THREE.Vector3(-40.17, 0.25, 18), new THREE.Vector3(-39.83, 8.75, 26));
    make("COL_MOVE_CINE_HOUSE_BACK", new THREE.Vector3(-40, 0.25, 17.82), new THREE.Vector3(-30, 8.75, 18.18));
    make("COL_MOVE_CINE_TICKET_LEFT", new THREE.Vector3(-20.85, 0, 29.6), new THREE.Vector3(-20.65, 3.4, 32.8));

    const asset = prepareMapAsset(root, "high", { zoneOverrides: [garden.override] });

    const kept = asset.colliders.map((box) => box.min.z.toFixed(2)).sort();
    expect(kept).toEqual(["17.82", "29.60"]);
  });
});
