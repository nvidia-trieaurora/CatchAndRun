import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import type { ClientConfig } from "../../src/config/ClientConfig";
import type { InputManager, InputState } from "../../src/input/InputManager";
import { HunterController } from "../../src/game/controllers/HunterController";
import { PropController } from "../../src/game/controllers/PropController";
import { prepareMapAsset, type MapAssetPrepareOptions } from "../../src/game/world/assets/MapAssetLoader";
import mapData from "../../src/game/world/harbor-warehouse.json";

export type MovementRole = "hunter" | "prop";
export type MovementTier = "high" | "low";

interface GeometryMaterial {
  name?: string;
  alphaMode?: "OPAQUE" | "BLEND" | "MASK";
  alphaCutoff?: number;
  doubleSided?: boolean;
  pbrMetallicRoughness?: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number };
}

/** Complete harbor-v2 root, optionally an isolated staged export, never a fallback. */
export const movementAssetRoot = process.env.HARBOR_VERIFY_ASSET_ROOT
  ? path.resolve(process.env.HARBOR_VERIFY_ASSET_ROOT)
  : path.resolve(__dirname, "../../public/assets/maps/harbor-v2");

/** Decode real exported geometry, including meshopt, without DOM texture loading. */
export async function loadMovementAsset(relative: string, tier: MovementTier, options: MapAssetPrepareOptions = {}) {
  const file = path.resolve(movementAssetRoot, relative);
  return { file, ...await prepareMovementGeometry(readFileSync(file), tier, options) };
}

/** Shared decode path for file assets and minimal binary GLB regression fixtures. */
export async function prepareMovementGeometry(bytes: Buffer, tier: MovementTier, options: MapAssetPrepareOptions = {}) {
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString()) as {
    materials?: GeometryMaterial[]; images: unknown[]; textures: unknown[];
  };
  // Retain scalar visibility/culling semantics. Do not replace transparent or
  // back-facing geometry with an opaque, single-sided stand-in during QA.
  json.materials = (json.materials ?? []).map((material) => ({
    name: material.name,
    alphaMode: material.alphaMode,
    alphaCutoff: material.alphaCutoff,
    doubleSided: material.doubleSided,
    pbrMetallicRoughness: material.pbrMetallicRoughness && {
      baseColorFactor: material.pbrMetallicRoughness.baseColorFactor,
      metallicFactor: material.pbrMetallicRoughness.metallicFactor,
      roughnessFactor: material.pbrMetallicRoughness.roughnessFactor,
    },
  }));
  json.images = []; json.textures = [];
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Math.ceil(encoded.length / 4) * 4;
  const bin = bytes.subarray(20 + length);
  const fixture = Buffer.alloc(20 + padded + bin.length, 0x20);
  bytes.copy(fixture, 0, 0, 12);
  fixture.writeUInt32LE(fixture.length, 8);
  fixture.writeUInt32LE(padded, 12);
  fixture.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(fixture, 20); bin.copy(fixture, 20 + padded);
  const root = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength), "",
  )).scene;
  root.updateMatrixWorld(true);
  const authored = new Map<string, THREE.Box3>();
  root.traverse((object) => {
    if (object.name.startsWith("COL_MOVE_")) authored.set(object.name, new THREE.Box3().setFromObject(object));
  });
  const asset = prepareMapAsset(root, tier, options);
  root.updateMatrixWorld(true);
  return { authored, ...asset };
}

export function createMovementProbe(role: MovementRole, start: readonly [number, number, number], controls: Partial<InputState> = {}) {
  const state: InputState = {
    forward: false, backward: false, left: false, right: false, jump: false, crouch: false,
    shoot: false, reload: false, interact: false, lockPose: false, ability: false, ability2: false,
    scoreboard: false, soulMode: false, ...controls,
  };
  const input = {
    isPointerLocked: () => true,
    consumeMouseDelta: () => ({ x: 0, y: 0 }),
    getState: () => state,
  } as unknown as InputManager;
  const config = { get: () => ({ sensitivity: .002 }) } as ClientConfig;
  const camera = new THREE.PerspectiveCamera();
  camera.quaternion.identity();
  // Fresh PropController rotation targets are zero; it has no public yaw setter.
  // Both roles receive zero mouse delta forever, so +X remains strafe-right.
  const controller = role === "hunter"
    ? new HunterController(camera, input, config)
    : new PropController(camera, input, config);
  if (controller instanceof HunterController) controller.setRotation(0, 0);
  controller.setMovementBounds(-72, 80, -60, 64);
  controller.setWaterVolumes(mapData.waterHazards);
  controller.setPosition(...start);
  const feetY = () => controller instanceof HunterController ? controller.getFeetY() : controller.getPosition().y;
  const sample = () => {
    const p = controller.getPosition();
    return { x: p.x, feetY: feetY(), headY: feetY() + (role === "hunter" ? 1.8 : .9), z: p.z };
  };
  return { controller, state, feetY, sample };
}

/**
 * Geometric oracle independent of collider names/coordinates and controller internals.
 * Respects object/material visibility, uniform alpha and sidedness, not per-texel
 * alpha: texture decoding and raster/shader visibility require visual review.
 */
export function visibleSurface(root: THREE.Object3D, origin: readonly [number, number, number], direction: readonly [number, number, number], distance: number): THREE.Vector3 | undefined {
  const ray = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize(), 0, distance);
  // Raycaster deliberately ignores Object3D.visible. A hidden LOD/collider must
  // not serve as visual proof, including parents above the queried subtree.
  return ray.intersectObject(root, true).find((hit) => {
    for (let ancestor: THREE.Object3D | null = hit.object; ancestor; ancestor = ancestor.parent) {
      if (!ancestor.visible) return false;
    }
    if (!(hit.object instanceof THREE.Mesh)) return false;
    const materials = hit.object.material as THREE.Material | THREE.Material[];
    const material = Array.isArray(materials) ? materials[hit.face?.materialIndex ?? 0] : materials;
    if (!material.visible || !material.colorWrite) return false;
    if ((material.transparent || material.alphaHash) && material.opacity <= 0) return false;
    return material.opacity >= material.alphaTest;
  })?.point;
}

export function sameMovementBox(a: THREE.Box3, b: THREE.Box3): boolean {
  return a.min.distanceTo(b.min) < 1e-5 && a.max.distanceTo(b.max) < 1e-5;
}

export function withoutMovementBox(colliders: readonly THREE.Box3[], target: THREE.Box3): THREE.Box3[] {
  const matches = colliders.filter((box) => sameMovementBox(box, target));
  if (matches.length !== 1) throw new Error(`Expected one physical box to perturb, found ${matches.length}`);
  return colliders.filter((box) => !sameMovementBox(box, target));
}
