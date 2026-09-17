import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { beforeAll, describe, expect, it } from "vitest";
import type { MapData } from "@catch-and-run/shared";
import type { ClientConfig } from "../src/config/ClientConfig";
import type { InputManager, InputState } from "../src/input/InputManager";
import { HunterController } from "../src/game/controllers/HunterController";
import { detectLadderVolumes } from "../src/game/controllers/LadderClimb";
import { prepareMapAsset, type MapAssetInstance } from "../src/game/world/assets/MapAssetLoader";
import { buildHarborV2Map, type HarborV2BuildResult } from "../src/game/world/maps/harborV2Map";
import { buildOldHarborFortniteMap } from "../src/game/world/maps/oldHarborFortnite";
import { HARBOR_ZONE_ASSETS } from "../src/game/world/zones/harborZones";
import mapJson from "../src/game/world/harbor-warehouse.json";
import { installHeadlessDom } from "./helpers/headlessDom";

const mapData = mapJson as MapData;

/** Preserve shipped mesh/UV/transform/extras data, omitting only image decoding. */
async function geometryScene(filename: string): Promise<THREE.Group> {
  const bytes = readFileSync(path.resolve(__dirname, "../public/assets/maps/harbor-v2", filename));
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()) as {
    materials?: unknown[];
    images: unknown[];
    textures: unknown[];
  };
  json.materials = (json.materials ?? []).map(() => ({}));
  json.images = [];
  json.textures = [];
  const encoded = Buffer.from(JSON.stringify(json));
  const paddedLength = Math.ceil(encoded.length / 4) * 4;
  const bin = bytes.subarray(20 + jsonLength);
  const output = Buffer.alloc(20 + paddedLength + bin.length, 0x20);
  bytes.copy(output, 0, 0, 12);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(output, 20);
  bin.copy(output, 20 + paddedLength);
  const arrayBuffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(arrayBuffer, "")).scene;
}

const boxKey = (box: THREE.Box3) => [...box.min.toArray(), ...box.max.toArray()].map((n) => n.toFixed(4)).join(",");
const obstructs = (a: THREE.Box3, b: THREE.Box3) => ["x", "y", "z"].every((axis) => {
  const k = axis as "x" | "y" | "z";
  return Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]) > 1e-4;
});

function controllerAt(x: number, y: number, z: number, yaw: number) {
  const state = { forward: true } as InputState;
  const input = {
    isPointerLocked: () => true,
    consumeMouseDelta: () => ({ x: 0, y: 0 }),
    getState: () => state,
  } as unknown as InputManager;
  const config = { get: () => ({ sensitivity: .002 }) } as ClientConfig;
  const controller = new HunterController(new THREE.PerspectiveCamera(), input, config);
  controller.setMovementBounds(-72, 80, -60, 64);
  controller.setWaterVolumes(mapJson.waterHazards);
  controller.setPosition(x, y, z);
  controller.setRotation(0, yaw);
  return controller;
}

describe("shipped rescue quay gameplay and visible geometry", () => {
  it("removes only the old decorative cargo crate embedded in the new service apron", async () => {
    const root = await geometryScene("cinematic/harbor-cinematic.glb");
    const override = HARBOR_ZONE_ASSETS.find((zone) => zone.id === "rescue-quay")?.override;
    if (!override) throw new Error("Missing rescue quay override");
    expect(root.getObjectByName("MESH_CRATE_4")).toBeDefined();
    // Keep these six names inspectable after preparation; disable only batching
    // hints in this fixture, preserving every shipped mesh/transform/override.
    root.traverse((object) => {
      if (object.name.startsWith("MESH_CRATE_")) delete object.userData.instanceKey;
    });
    prepareMapAsset(root, "high", { zoneOverrides: [override] });
    expect(root.getObjectByName("MESH_CRATE_4")).toBeUndefined();
    for (const index of [0, 1, 2, 3, 5]) expect(root.getObjectByName(`MESH_CRATE_${index}`)).toBeDefined();
  });
  const tiers = new Map<string, { rescue: MapAssetInstance; map: HarborV2BuildResult }>();
  const authored = new Map<string, THREE.Box3>();
  function tier(quality: string) {
    const result = tiers.get(quality);
    if (!result) throw new Error(`Missing ${quality} fixture`);
    return result;
  }

  beforeAll(async () => {
    installHeadlessDom();
    for (const quality of ["high", "low"] as const) {
      const rescueRoot = await geometryScene("zones/rescue-quay.glb");
      rescueRoot.updateMatrixWorld(true);
      if (quality === "high") rescueRoot.traverse((object) => {
        if (object.name.startsWith("COL_MOVE_")) authored.set(object.name, new THREE.Box3().setFromObject(object));
      });
      const rescue = prepareMapAsset(rescueRoot, quality);
      const cinematic = prepareMapAsset(await geometryScene("cinematic/harbor-cinematic.glb"), quality, {
        zoneOverrides: HARBOR_ZONE_ASSETS.filter((zone) => zone.promoted).map((zone) => zone.override),
      });
      const warehouse = prepareMapAsset(await geometryScene("warehouse.glb"), quality);
      const map = buildHarborV2Map(new THREE.Scene(), mapData, warehouse, quality, cinematic, [rescue]);
      rescue.root.updateMatrixWorld(true);
      tiers.set(quality, { rescue, map });
    }
  }, 30_000);

  it.each(["high", "low"])("%s workshop posts, rear wall and roofs match the solid surfaces", (quality) => {
    const { rescue } = tier(quality);
    const critical = [...authored].filter(([name]) => /WORKSHOP_(POST|BACK|ROOF)|TOWER_(CABIN_POST|ROOF)/.test(name));
    // Guard against a missing export silently making the following loops empty.
    expect(critical).toHaveLength(11);
    for (const [name, bounds] of critical) {
      expect(rescue.colliders.some((box) => boxKey(box) === boxKey(bounds)), name).toBe(true);
      const center = bounds.getCenter(new THREE.Vector3());
      for (const axis of ["x", "y", "z"] as const) for (const side of [-1, 1]) {
        const face = center.clone();
        face[axis] = side < 0 ? bounds.min[axis] : bounds.max[axis];
        const normal = new THREE.Vector3();
        normal[axis] = side;
        const ray = new THREE.Raycaster(face.clone().addScaledVector(normal, .08), normal.clone().negate(), 0, .15);
        const hits = ray.intersectObject(rescue.root, true);
        expect(hits.some((hit) => hit.point.distanceTo(face) < .055), `${quality} ${name} has an invisible ${axis}/${side} collision face`).toBe(true);
      }
    }
  });

  it.each(["high", "low"])("%s keeps the full maintenance lane walkable with no old tree blockers", (quality) => {
    const { map, rescue } = tier(quality);
    const lane = new THREE.Box3(new THREE.Vector3(43, .5, 12), new THREE.Vector3(49, 2, 33));
    expect(map.colliders.filter((box) => obstructs(box, lane)).map(boxKey)).toEqual([]);
    // Walk the actual hunter down the old tree at (45,28); no teleport or narrow
    // route sample can hide a collider left behind by the visual replacement.
    for (const x of [43.4, 45, 48.6]) {
      const hunter = controllerAt(x, .24, 12.5, Math.PI);
      for (let frame = 0; frame < 120; frame++) hunter.update(1 / 60, map.colliders);
      expect(hunter.getPosition().z, `blocked lane at x=${x}`).toBeGreaterThan(32);
      expect(hunter.getFeetY()).toBeCloseTo(.24, 3);
      const ray = new THREE.Raycaster(new THREE.Vector3(x, .31, 28), new THREE.Vector3(0, -1, 0), 0, .1);
      // Expansion seams sit 4 mm above the slab; they are visual relief, not
      // separate collision steps.
      expect(ray.intersectObject(rescue.root, true)[0]?.point.y, "raised apron needs a visible walkable floor").toBeCloseTo(.24, 2);
    }
  });

  it.each(["high", "low"])("%s preserves the watchtower landing and a usable ladder", (quality) => {
    const { map, rescue } = tier(quality);
    const ladder = detectLadderVolumes(map.colliders).find((volume) => Math.abs(volume.centerX - 41.8) < .01 && Math.abs(volume.centerZ - 30) < .01);
    expect(ladder).toBeDefined();
    if (!ladder) throw new Error("Missing watchtower ladder");
    expect(ladder.bottomY).toBeCloseTo(0, 5);
    expect(ladder.topY).toBeCloseTo(6, 5);
    const deck = map.colliders.find((box) => boxKey(box) === "38.0000,5.9250,28.0000,42.0000,6.0750,32.0000");
    expect(deck).toBeDefined();
    if (!deck) throw new Error("Missing watchtower landing");
    const ray = new THREE.Raycaster(new THREE.Vector3(40, 6.15, 30), new THREE.Vector3(0, -1, 0), 0, .12);
    expect(ray.intersectObject(rescue.root, true)[0]?.point.y).toBeCloseTo(deck.max.y, 3);
    const hunter = controllerAt(43, .24, 30, Math.PI / 2);
    hunter.setLadders([ladder]);
    for (let frame = 0; frame < 240; frame++) hunter.update(1 / 60, map.colliders);
    expect(hunter.getFeetY()).toBeCloseTo(deck.max.y, 2);
    expect(hunter.getPosition().x).toBeLessThan(42);
  });

  it("removes exactly the three apron trees and their colliders only while rescue replacement is enabled", () => {
    const scenes = [new THREE.Scene(), new THREE.Scene()];
    const legacy = buildOldHarborFortniteMap(scenes[0], mapData, { useWarehouseV2: true, quality: "low" });
    const replacement = buildOldHarborFortniteMap(scenes[1], mapData, { useWarehouseV2: true, quality: "low", rescueQuay: true });
    const treePositions = (scene: THREE.Scene) => scene.children.filter((object) => object.name === "harbor-tree").map((object) => `${object.position.x},${object.position.z}`).sort();
    const removed = ["52,22", "55,15", "45,28"];
    const oldTrees = treePositions(scenes[0]);
    for (const point of removed) expect(oldTrees).toContain(point);
    expect(treePositions(scenes[1])).toEqual(oldTrees.filter((point) => !removed.includes(point)));
    const removedColliders = [[52, 22], [55, 15], [45, 28]].map(([x, z]) => boxKey(new THREE.Box3(
      new THREE.Vector3(x - .25, 0, z - .25), new THREE.Vector3(x + .25, 1.5, z + .25),
    )));
    expect(replacement.colliders.map(boxKey).sort()).toEqual(legacy.colliders.map(boxKey).filter((key) => !removedColliders.includes(key)).sort());
  });
});
