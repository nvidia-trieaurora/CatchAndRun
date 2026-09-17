import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { beforeAll, describe, expect, it } from "vitest";
import type { ClientConfig } from "../src/config/ClientConfig";
import { HunterController } from "../src/game/controllers/HunterController";
import { prepareMapAsset } from "../src/game/world/assets/MapAssetLoader";
import { setHunterGateOpen, updateHunterGateVisual } from "../src/game/world/HunterGateState";
import { HARBOR_ZONE_ASSETS } from "../src/game/world/zones/harborZones";
import type { InputManager } from "../src/input/InputManager";
import { installHeadlessDom } from "./helpers/headlessDom";

/** Actual shipped topology/transforms/extras, without DOM image decoding. */
async function geometryScene(filename: string): Promise<THREE.Group> {
  const bytes = readFileSync(path.resolve(__dirname, "../public/assets/maps/harbor-v2", filename));
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()) as {
    materials?: unknown[];
    images: unknown[];
    textures: unknown[];
    [key: string]: unknown;
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
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength), "",
  )).scene;
}

const legacyProps = [
  [-45.4, 0, -4.25, -44.6, .5, -3.75],
  [-45.4, 0, 3.75, -44.6, .5, 4.25],
  [-47, 0, -.25, -45, .35, .25],
];
const sameBox = (box: THREE.Box3, extents: number[]) => (
  [...box.min.toArray(), ...box.max.toArray()].every((v, i) => Math.abs(v - extents[i]) < 1e-6)
);
const overlay = [-49, .1, -7, -35, .14, 7];

describe("Production response station and Hunter release integration", () => {
  beforeAll(installHeadlessDom);

  it.each(["high", "low"] as const)("keeps %s floor and open route clear while the native gate still blocks/reopens", async (quality) => {
    const { buildHarborV2Map } = await import("../src/game/world/maps/harborV2Map");
    const mapData = (await import("../src/game/world/harbor-warehouse.json")).default;
    const definition = HARBOR_ZONE_ASSETS.find((asset) => asset.id === "response-station");
    if (!definition) throw new Error("Response station definition missing");
    const warehouse = prepareMapAsset(await geometryScene("warehouse.glb"), quality);
    const cinematic = prepareMapAsset(await geometryScene("cinematic/harbor-cinematic.glb"), quality,
      { zoneOverrides: [definition.override] });
    const station = prepareMapAsset(await geometryScene("zones/response-station.glb"), quality);
    const scene = new THREE.Scene();
    const result = buildHarborV2Map(scene, mapData as never, warehouse, quality, cinematic, [station]);
    for (const box of legacyProps) {
      expect(result.colliders.some((candidate) => sameBox(candidate, box)), `invisible retired prop ${box.join(",")}`).toBe(false);
    }
    expect(result.colliders.filter((candidate) => sameBox(candidate, overlay))).toHaveLength(1);
    const gates: THREE.Object3D[] = [];
    station.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData.gameplayRole === "hunterGate") gates.push(object);
    });
    expect(gates).toHaveLength(1);
    expect(gates[0].name).toBe(`MESH_RESPONSE_STATION_HUNTER_GATE_${quality === "low" ? "LOD1" : "LOD0"}`);
    expect(result.gateMesh).toBe(gates[0]);
    const gate = result.gateMesh;
    if (!gate) throw new Error("Native gate missing");
    expect(cinematic.root.getObjectByName("MESH_HUNTER_GATE")).toBeUndefined();
    const physicalGate = result.colliders[result.gateColliderIndex];
    expect(sameBox(physicalGate, [-35.125, 0, -7, -34.875, 5, 7])).toBe(true);

    let right = false;
    const input = {
      isPointerLocked: () => true,
      consumeMouseDelta: () => ({ x: 0, y: 0 }),
      getState: () => ({ right }),
    } as unknown as InputManager;
    const config = { get: () => ({ sensitivity: .002 }) } as ClientConfig;
    const hunter = new HunterController(new THREE.PerspectiveCamera(), input, config);
    hunter.setPosition(-47.7, .14, 0);
    for (let i = 0; i < 10; i++) hunter.update(1 / 60, result.colliders);
    expect(hunter.getFeetY()).toBeCloseTo(.14, 5);
    right = true;
    for (let i = 0; i < 200; i++) {
      hunter.update(1 / 60, result.colliders);
      expect(hunter.getFeetY(), "no invisible step inside the central lane").toBeCloseTo(.14, 5);
    }
    expect(hunter.getPosition().x).toBeLessThanOrEqual(-35.474);
    expect(hunter.getPosition().x).toBeGreaterThan(-35.6);
    setHunterGateOpen(result.colliders, physicalGate, result.gateMesh, true);
    updateHunterGateVisual(result.gateMesh, .45);
    expect(gate.visible).toBe(false);
    expect(result.colliders).not.toContain(physicalGate);
    for (let i = 0; i < 40; i++) hunter.update(1 / 60, result.colliders);
    expect(hunter.getPosition().x).toBeGreaterThan(-34);
    setHunterGateOpen(result.colliders, physicalGate, result.gateMesh, false);
    expect(gate.visible).toBe(true);
    expect(result.colliders.filter((candidate) => candidate === physicalGate)).toHaveLength(1);
    expect(gate.scale.y).toBe(1);
  });

  it("retains all three original props and the original floor when no station asset is active", async () => {
    const { buildHarborV2Map } = await import("../src/game/world/maps/harborV2Map");
    const mapData = (await import("../src/game/world/harbor-warehouse.json")).default;
    const result = buildHarborV2Map(new THREE.Scene(), mapData as never, null);
    for (const box of legacyProps) {
      expect(result.colliders.filter((candidate) => sameBox(candidate, box))).toHaveLength(1);
    }
    expect(result.colliders.filter((candidate) => sameBox(candidate, overlay))).toHaveLength(0);
    expect(sameBox(result.colliders[result.gateColliderIndex], [-35.125, 0, -7, -34.875, 5, 7])).toBe(true);
  });
});
