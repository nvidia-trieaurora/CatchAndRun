import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { prepareMapAsset, disposeMapAsset } from "../../client/src/game/world/assets/MapAssetLoader";
import { HARBOR_ZONE_ASSETS } from "../../client/src/game/world/zones/harborZones";
import { setHunterGateOpen, updateHunterGateVisual } from "../../client/src/game/world/HunterGateState";
import type { HarborV2BuildResult } from "../../client/src/game/world/maps/harborV2Map";
import { installHeadlessDom } from "../../client/tests/helpers/headlessDom";
import { STATIC_ASSET_PROBES, type StaticAssetProbe, type StaticAssetQuality } from "./StaticAssetGateContracts";
import coverage from "./StaticAssetGateCoverage.json";

export interface StaticAssetGateOptions { root: string; assetDir: string; candidateDir?: string; report: string; negativeControls: boolean }
export interface StaticAssetInventory { id: string; path: string; sha256: string; bytes: number; candidate: boolean }
interface AssetSnapshot extends StaticAssetInventory { data: Buffer }
export interface StaticAssetCollider { name: string; source: string; box: THREE.Box3 }
export interface StaticAssetHit { name: string; source: string; at: number[]; distance: number }
export interface StaticAssetProbeResult extends StaticAssetProbe {
  passed: boolean; failures: string[]; visibleHits: StaticAssetHit[];
  collisionHits: (StaticAssetHit & { min: number[]; max: number[] })[];
}
const hash = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const boundsKey = (box: THREE.Box3) => [...box.min.toArray(), ...box.max.toArray()].join(",");
const NEGATIVE_CONTROL_DEFINITIONS = [
  { name: "missing_floor", probe: "house_2f_floor", code: "missing_visual_surface" },
  { name: "invisible_blocker", probe: "ferris_ticket_side_entry", code: "invisible_blocker" },
  { name: "visible_seal", probe: "ferris_ticket_side_entry", code: "visible_seal" },
] as const;

/** The wrapper and evaluator share a reviewed inventory, not a permissive count. */
export function assertStaticAssetGateCoverage(
  probeNames: readonly string[] = STATIC_ASSET_PROBES.map(probe => probe.name),
  controlNames: readonly string[] = NEGATIVE_CONTROL_DEFINITIONS.map(control => control.name),
): void {
  if (coverage.schema !== "StaticAssetGateCoverage/v1") throw new Error("Unknown static coverage schema");
  for (const [kind, actual, expected] of [
    ["probe", probeNames, coverage.probeNames], ["control", controlNames, coverage.controlNames],
  ] as const) {
    if (expected.length === 0 || new Set(expected).size !== expected.length || new Set(actual).size !== actual.length
      || actual.length !== expected.length || actual.some(name => !expected.includes(name))) {
      throw new Error(`StaticAssetGate ${kind} coverage does not match the reviewed exact name set`);
    }
  }
}

export function parseStaticAssetGateArgs(args: string[], root: string): StaticAssetGateOptions {
  const options: StaticAssetGateOptions = {
    root: path.resolve(root), assetDir: path.resolve(root, process.env.HARBOR_VERIFY_ASSET_ROOT ?? "client/public/assets/maps/harbor-v2"),
    report: path.resolve(root, "docs/v2/harbor/verification/static-asset-gate.json"), negativeControls: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") continue;
    if (arg === "--negative-controls") { options.negativeControls = true; continue; }
    if (!["--asset-dir", "--candidate-dir", "--report"].includes(arg)) throw new Error(`Unknown StaticAssetGate argument: ${arg}`);
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    if (arg === "--asset-dir") options.assetDir = path.resolve(root, value);
    else if (arg === "--candidate-dir") options.candidateDir = path.resolve(root, value);
    else options.report = path.resolve(root, value);
  }
  if (path.extname(options.report).toLowerCase() !== ".json") throw new Error("StaticAssetGate report must end in .json (never an asset path)");
  return options;
}

/** Complete root; optional flat candidate overlay rejects unknown/ambiguous GLBs. */
export function snapshotStaticAssets(options: StaticAssetGateOptions): AssetSnapshot[] {
  const specs = [{ id: "warehouse", relative: "warehouse.glb" }, { id: "cinematic", relative: "cinematic/harbor-cinematic.glb" },
    ...HARBOR_ZONE_ASSETS.filter(zone => zone.promoted).map(zone => ({ id: zone.id, relative: `zones/${zone.id}.glb` }))];
  const overrides = new Map<string, string>();
  if (options.candidateDir) {
    const candidates = readdirSync(options.candidateDir).filter(file => file.toLowerCase().endsWith(".glb"));
    if (!candidates.length) throw new Error(`No GLB candidates in ${options.candidateDir}`);
    for (const filename of candidates) {
      const spec = specs.find(item => [item.id, item.id === "cinematic" ? "harbor-cinematic" : item.id]
        .some(stem => [".glb", "-runtime.glb", "-candidate.glb"].some(suffix => filename === stem + suffix)));
      if (!spec) throw new Error(`Unrecognized candidate GLB (refusing to ignore it): ${filename}`);
      if (overrides.has(spec.id)) throw new Error(`Ambiguous candidate GLBs for ${spec.id}`);
      overrides.set(spec.id, path.join(options.candidateDir, filename));
    }
  }
  return specs.map(spec => {
    const file = realpathSync(overrides.get(spec.id) ?? path.join(options.assetDir, spec.relative));
    const data = readFileSync(file);
    return { id: spec.id, path: file, data, bytes: data.length, sha256: hash(data), candidate: overrides.has(spec.id) };
  });
}

interface GLBMaterial {
  name?: string; doubleSided?: boolean; alphaMode?: string; alphaCutoff?: number;
  pbrMetallicRoughness?: { baseColorFactor?: number[] };
}
/** Preserve topology, transforms, culling, opacity and extras; skip image decoding. */
export async function readStaticAssetGeometry(bytes: Buffer): Promise<THREE.Group> {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error("Malformed or unsupported GLB header");
  const length = bytes.readUInt32LE(12);
  if (length % 4 !== 0 || 20 + length > bytes.length) throw new Error("Malformed GLB JSON chunk");
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString()) as {
    materials?: GLBMaterial[]; images?: unknown[]; textures?: unknown[]; buffers?: { uri?: string }[];
  };
  if (json.buffers?.some(buffer => buffer.uri)) throw new Error("External buffers not permitted: SHA inventory must cover all geometry bytes");
  json.images = []; json.textures = [];
  json.materials = (json.materials ?? []).map(material => ({
    name: material.name, doubleSided: material.doubleSided, alphaMode: material.alphaMode, alphaCutoff: material.alphaCutoff,
    pbrMetallicRoughness: { baseColorFactor: material.pbrMetallicRoughness?.baseColorFactor },
  }));
  const encoded = Buffer.from(JSON.stringify(json)); const padded = Math.ceil(encoded.length / 4) * 4;
  const binary = bytes.subarray(20 + length); const output = Buffer.alloc(20 + padded + binary.length, 0x20);
  bytes.copy(output, 0, 0, 12); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded, 12); output.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(output, 20); binary.copy(output, 20 + padded);
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength), "")).scene;
}

function visibleHit(hit: THREE.Intersection): boolean {
  for (let object: THREE.Object3D | null = hit.object; object; object = object.parent) if (!object.visible) return false;
  if (!(hit.object instanceof THREE.Mesh)) return false;
  const mesh = hit.object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
  const material = Array.isArray(mesh.material) ? mesh.material[hit.face?.materialIndex ?? 0] : mesh.material;
  return Boolean(material?.visible && (!material.transparent || material.opacity > 0));
}
function sourceOf(object: THREE.Object3D): string {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (typeof current.userData.staticAssetGateSource === "string") return current.userData.staticAssetGateSource;
  }
  return "client/src/game/world/maps/oldHarborFortnite.ts (procedural runtime)";
}

export function evaluateStaticAssetProbe(probe: StaticAssetProbe, scene: THREE.Object3D, colliders: StaticAssetCollider[],
  quality: StaticAssetQuality = "high"): StaticAssetProbeResult {
  if (![...probe.origin, ...probe.direction, probe.far].every(Number.isFinite) || probe.far <= 0
    || probe.direction.filter(value => value !== 0).length !== 1
    || !["open", "surface"].includes(probe.expectation)) throw new Error(`Invalid axis-aligned probe: ${probe.name}`);
  const origin = new THREE.Vector3(...probe.origin); const direction = new THREE.Vector3(...probe.direction).normalize();
  const raycaster = new THREE.Raycaster(origin, direction, 0, probe.far);
  const visibleHits = raycaster.intersectObject(scene, true).filter(visibleHit).map(hit => ({
    name: hit.object.name || `(unnamed ${hit.object.type})`, source: sourceOf(hit.object), at: hit.point.toArray(), distance: hit.distance,
  }));
  const collisionHits = colliders.flatMap(({ name, source, box }) => {
    if (box.isEmpty() || ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) throw new Error(`Invalid collider: ${source} / ${name}`);
    // intersectBox alone returns an exit beyond far for a ray enclosed by a blocker.
    const point = box.containsPoint(origin) ? origin.clone() : raycaster.ray.intersectBox(box, new THREE.Vector3());
    if (!point || point.distanceTo(origin) > probe.far) return [];
    return [{ name, source, at: point.toArray(), distance: point.distanceTo(origin), min: box.min.toArray(), max: box.max.toArray() }];
  }).sort((a, b) => a.distance - b.distance);
  const failures: string[] = [];
  if (probe.expectation === "open") {
    if (visibleHits.length) failures.push("visible_seal");
    if (collisionHits.length) failures.push(visibleHits.length ? "blocked_route" : "invisible_blocker");
  } else {
    if (!visibleHits.length) failures.push("missing_visual_surface");
    if (!collisionHits.length) failures.push("missing_collision_surface");
    const tolerance = probe.tolerance;
    if (probe.visualCoordinate === undefined || probe.collisionCoordinate === undefined || tolerance === undefined || !Number.isFinite(tolerance) || tolerance <= 0) throw new Error(`Surface probe lacks explicit coordinate/tolerance contract: ${probe.name}`);
    const axis = probe.direction.findIndex(value => value !== 0);
    const visualExpected = typeof probe.visualCoordinate === "number" ? probe.visualCoordinate : probe.visualCoordinate[quality];
    if (!Number.isFinite(visualExpected) || !Number.isFinite(probe.collisionCoordinate)) throw new Error(`Invalid surface coordinates: ${probe.name}`);
    if (visibleHits.length && Math.abs(visibleHits[0].at[axis] - visualExpected) > tolerance) failures.push("visual_coordinate_mismatch");
    if (collisionHits.length && Math.abs(collisionHits[0].at[axis] - probe.collisionCoordinate) > tolerance) failures.push("collision_coordinate_mismatch");
  }
  return { ...probe, passed: failures.length === 0, failures, visibleHits: visibleHits.slice(0, 8), collisionHits };
}

interface StaticWorld { scene: THREE.Scene; map: HarborV2BuildResult; gateCollider: THREE.Box3 | null; metadata: Map<THREE.Box3, StaticAssetCollider> }
async function buildStaticWorld(inputs: AssetSnapshot[], quality: StaticAssetQuality): Promise<StaticWorld> {
  installHeadlessDom();
  const { buildHarborV2Map } = await import("../../client/src/game/world/maps/harborV2Map");
  const mapData = (await import("../../client/src/game/world/harbor-warehouse.json")).default;
  const metadata = new Map<THREE.Box3, StaticAssetCollider>();
  const assets = new Map<string, ReturnType<typeof prepareMapAsset>>();
  for (const input of inputs) {
    const root = await readStaticAssetGeometry(input.data);
    root.userData.staticAssetGateSource = input.path; root.updateMatrixWorld(true);
    const authored = new Map<string, string[]>();
    root.traverse(object => {
      if (!/^(COL_MOVE_|COL_LADDER_)/.test(object.name)) return;
      const key = boundsKey(new THREE.Box3().setFromObject(object));
      authored.set(key, [...(authored.get(key) ?? []), object.name]);
    });
    const asset = prepareMapAsset(root, quality, input.id === "cinematic"
      ? { zoneOverrides: HARBOR_ZONE_ASSETS.filter(zone => zone.promoted).map(zone => zone.override) } : undefined);
    let meshes = 0;
    root.traverse(object => {
      if (!object.matrixWorld.elements.every(Number.isFinite)) throw new Error(`Non-finite transform: ${input.path} / ${object.name}`);
      if (!(object instanceof THREE.Mesh) || !object.visible) return;
      const position = (object as THREE.Mesh<THREE.BufferGeometry>).geometry.getAttribute("position");
      if (!position?.count) return;
      meshes++;
      for (let i = 0; i < position.count; i++) {
        if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)) throw new Error(`Non-finite vertex: ${input.path} / ${object.name}`);
      }
    });
    if (!meshes) throw new Error(`${input.id} has no surviving render meshes at ${quality}`);
    for (const box of asset.colliders) {
      const names = authored.get(boundsKey(box));
      if (!names) throw new Error(`Unattributed prepared collider in ${input.path}`);
      metadata.set(box, { name: names.join(" | "), source: input.path, box });
    }
    assets.set(input.id, asset);
  }
  const warehouse = assets.get("warehouse"); const cinematic = assets.get("cinematic");
  if (!warehouse || !cinematic) throw new Error("Required warehouse/cinematic assets missing");
  const zones = HARBOR_ZONE_ASSETS.filter(zone => zone.promoted).map(zone => {
    const asset = assets.get(zone.id); if (!asset) throw new Error(`Required zone ${zone.id} missing`); return asset;
  });
  const scene = new THREE.Scene(); const map = buildHarborV2Map(scene, mapData as never, warehouse, quality, cinematic, zones);
  for (let index = 0; index < map.colliders.length; index++) {
    const box = map.colliders[index];
    if (!metadata.has(box)) metadata.set(box, { name: `procedural_${index}`, source: "client/src/game/world/maps/oldHarborFortnite.ts + harborV2Map.ts", box });
  }
  const world = { scene, map, metadata, gateCollider: map.colliders[map.gateColliderIndex] ?? null };
  if (!world.gateCollider || map.gateMesh?.userData.gameplayRole !== "hunterGate") throw new Error(`No surviving native response gate/collider on ${quality}`);
  scene.updateMatrixWorld(true); return world;
}
function currentColliders(world: StaticWorld): StaticAssetCollider[] {
  return world.map.colliders.map(box => { const metadata = world.metadata.get(box); if (!metadata) throw new Error("Unattributed runtime collider"); return metadata; });
}
function evaluateWorldProbe(world: StaticWorld, probe: StaticAssetProbe, quality: StaticAssetQuality): StaticAssetProbeResult {
  setHunterGateOpen(world.map.colliders, world.gateCollider, world.map.gateMesh, probe.gate === "open");
  if (probe.gate === "open") updateHunterGateVisual(world.map.gateMesh, .45);
  world.scene.updateMatrixWorld(true);
  return evaluateStaticAssetProbe(probe, world.scene, currentColliders(world), quality);
}

function negativeControls(world: StaticWorld, quality: StaticAssetQuality) {
  return NEGATIVE_CONTROL_DEFINITIONS.map(definition => {
    const probe = STATIC_ASSET_PROBES.find(item => item.name === definition.probe)!;
    const baseline = evaluateWorldProbe(world, probe, quality);
    let undo = () => {}; let mutationSource: string;
    if (definition.name === "missing_floor") {
      const object = world.scene.getObjectByName(baseline.visibleHits[0]?.name ?? "");
      mutationSource = baseline.visibleHits[0]?.source ?? "missing baseline floor";
      if (object) { const visible = object.visible; object.visible = false; undo = () => { object.visible = visible; }; }
    } else {
      const center = new THREE.Vector3(...probe.origin).addScaledVector(new THREE.Vector3(...probe.direction), probe.far / 2);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(.1, 2, 1), new THREE.MeshBasicMaterial());
      mesh.name = `StaticAssetGate_MUTATION_${definition.name}`;
      mutationSource = "StaticAssetGate in-memory negative control (never saved to GLB)";
      mesh.userData.staticAssetGateSource = mutationSource; mesh.position.copy(center); mesh.updateMatrixWorld(true);
      if (definition.name === "visible_seal") world.scene.add(mesh);
      else {
        const box = new THREE.Box3().setFromObject(mesh);
        world.map.colliders.push(box); world.metadata.set(box, { name: mesh.name, source: mutationSource, box });
        undo = () => { world.map.colliders.splice(world.map.colliders.indexOf(box), 1); world.metadata.delete(box); };
      }
      const removeCollider = undo;
      undo = () => { removeCollider(); mesh.removeFromParent(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); };
    }
    let mutated: StaticAssetProbeResult;
    try { mutated = evaluateWorldProbe(world, probe, quality); } finally { undo(); }
    const restored = evaluateWorldProbe(world, probe, quality);
    return { name: definition.name, probe: definition.probe, source: mutationSource, baselinePassed: baseline.passed,
      detected: baseline.passed && mutated.failures.includes(definition.code), restored: restored.passed,
      passed: baseline.passed && mutated.failures.includes(definition.code) && restored.passed, evidence: mutated };
  });
}

export async function runStaticAssetGate(options: StaticAssetGateOptions) {
  assertStaticAssetGateCoverage();
  const snapshots = snapshotStaticAssets(options);
  const inventory = snapshots.map(({ id, path: file, sha256, bytes, candidate }) => ({ id, path: file, sha256, bytes, candidate }));
  const sources = ["tools/harbor-v2/StaticAssetGate.ts", "tools/harbor-v2/StaticAssetGateContracts.ts", "tools/harbor-v2/StaticAssetGateCoverage.json", "tools/harbor-v2/audit_structural_routes.ts",
    "client/src/game/world/harbor-warehouse.json", "client/src/game/world/assets/MapAssetLoader.ts", "client/src/game/world/maps/harborV2Map.ts",
    "client/src/game/world/maps/oldHarborFortnite.ts", "client/src/game/world/zones/harborZones.ts", "client/src/game/world/HunterGateState.ts",
  ].map(file => ({ path: path.resolve(options.root, file), sha256: hash(readFileSync(path.resolve(options.root, file))) }));
  const qualities = {} as Record<StaticAssetQuality, { passed: boolean; probes: StaticAssetProbeResult[]; controls: ReturnType<typeof negativeControls> }>;
  for (const quality of ["high", "low"] as const) {
    const world = await buildStaticWorld(snapshots, quality);
    try {
      const probes = STATIC_ASSET_PROBES.map(probe => evaluateWorldProbe(world, probe, quality));
      const controls = options.negativeControls ? negativeControls(world, quality) : [];
      qualities[quality] = { passed: probes.every(probe => probe.passed) && controls.every(control => control.passed), probes, controls };
    } finally { world.map.mooringRopes?.dispose(); world.map.harborWater.dispose(); disposeMapAsset(world.scene); }
  }
  const changedInputs = [...inventory, ...sources].filter(entry => !existsSync(entry.path) || hash(readFileSync(entry.path)) !== entry.sha256).map(entry => entry.path);
  return {
    schema: "StaticAssetGate/v1", generatedAt: new Date().toISOString(), passed: qualities.high.passed && qualities.low.passed && changedInputs.length === 0,
    scope: "Static geometry rays against real GLTFLoader/prepareMapAsset/buildHarborV2Map High/Low integration. Material opacity/culling retained; textures and alpha-map pixels not decoded. Not capsule, dynamic boat/water, screenshot, lighting or performance certification.",
    options, inventory, sources, changedInputs, qualities,
    summary: { probes: STATIC_ASSET_PROBES.length * 2, failedProbes: Object.values(qualities).flatMap(tier => tier.probes).filter(probe => !probe.passed).length,
      controls: Object.values(qualities).flatMap(tier => tier.controls).length, failedControls: Object.values(qualities).flatMap(tier => tier.controls).filter(control => !control.passed).length },
  };
}
