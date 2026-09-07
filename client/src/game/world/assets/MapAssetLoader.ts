import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import type { GameRenderer } from "../../rendering/RendererFactory";
import { tagWeaponImpactSurface } from "../weaponImpactSurfaces";

type RenderMesh = THREE.Mesh;

function isRenderMesh(object: THREE.Object3D): object is RenderMesh {
  return object instanceof THREE.Mesh;
}

const SHADOWLESS_DETAIL_TOKENS = [
  "GLASS",
  "WINDOW",
  "LIGHT_",
  "SIGN_LETTER",
  "PUDDLE",
  "OIL_STAIN",
  "ROAD_MARK",
  "LILY_PAD",
  "FISHING_NET",
  "ROPE_COIL",
  "LIFE_RING",
  "TRAFFIC_CONE",
  "CONSTRUCTION_REBAR",
] as const;

function shouldCastMapShadow(object: RenderMesh): boolean {
  const upperName = object.name.toUpperCase();
  if (upperName.includes("BASE_") || upperName.includes("IMPACT_FOLIAGE")) {
    return false;
  }
  return !SHADOWLESS_DETAIL_TOKENS.some((token) => upperName.includes(token));
}

export interface MapAssetLadder {
  /** World AABB of the rung column; it is also one of `colliders`. */
  box: THREE.Box3;
  /** Optional `ladderApproach` extra ("+x" | "-x" | "+z" | "-z"): the side a body hangs on. */
  approach?: string;
}

export interface MapAssetInstance {
  root: THREE.Group;
  colliders: THREE.Box3[];
  markers: Map<string, THREE.Vector3>;
  /** `COL_LADDER_*` nodes: explicit climbable columns (see `LadderClimb.ts`). */
  ladders: MapAssetLadder[];
}

export type MapAssetQuality = "low" | "medium" | "high";

/**
 * A dedicated zone GLB (AC garden, AD construction) replaces part of the
 * cinematic Harbor. Legacy geometry for that zone must disappear so old and new
 * visuals never overlap: whole nodes tagged with the zone are dropped, while
 * map-wide merged LOD1 batches (`harbor_*`) are carved triangle-by-triangle
 * inside the carve box so other districts keep their low-tier geometry.
 */
export interface ZoneOverride {
  /** `harborZone` extras whose nodes belong to the replaced zone. */
  removeZones: string[];
  /** Explicit node names to drop (e.g. the old lawn slab). */
  removeNames?: string[];
  /**
   * Instanced legacy props (`MESH_BOLLARD_*`, `MESH_PIER_PILE_*`, ...) dropped by
   * name prefix, but only when their world bounds centre lies inside `carveBox`,
   * so the same prop family outside the district survives.
   */
  removeNamePrefixes?: string[];
  /** Three.js world AABB used to carve merged batches. */
  carveBox: THREE.Box3;
  /**
   * Merged map-wide batches tagged with another zone that still contain
   * geometry of the replaced zone; carved inside `box` (defaults to carveBox).
   * A raised `box.min.y` keeps ground slabs in the same batch intact.
   */
  carveNames?: { name: string; box?: THREE.Box3 }[];
}

export interface MapAssetPrepareOptions {
  /**
   * Maximum anisotropic filtering the renderer supports
   * (`renderer.getMaxAnisotropy()`). The effective value is clamped per
   * quality tier so mobile keeps the cheap path.
   */
  maxAnisotropy?: number;
  /** Zones replaced by dedicated zone GLBs (see ZoneOverride). */
  zoneOverrides?: ZoneOverride[];
}

const ANISOTROPY_BY_QUALITY: Record<MapAssetQuality, number> = {
  low: 1,
  medium: 4,
  high: 16,
};

const MATERIAL_TEXTURE_KEYS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
] as const;

export function anisotropyForQuality(
  quality: MapAssetQuality,
  maxAnisotropy = 1,
): number {
  return Math.max(1, Math.min(ANISOTROPY_BY_QUALITY[quality], Math.floor(maxAnisotropy)));
}

function tuneMapMaterial(
  material: THREE.Material,
  anisotropy: number,
  quality: MapAssetQuality,
) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  for (const key of MATERIAL_TEXTURE_KEYS) {
    const texture = material[key];
    if (texture instanceof THREE.Texture && texture.anisotropy !== anisotropy) {
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    }
  }
  // Authored PBR sets carry AO in the ORM red channel; keep it subtle so the
  // HDRI + practical lights still read, and drop it entirely on low tier.
  if (material.aoMap) {
    material.aoMapIntensity = quality === "low" ? 0 : 0.85;
  }
  // Low tier (mobile) never uploads normal maps: they are the largest data
  // textures of a zone set and LOD1 silhouettes do not need them.
  if (quality === "low" && material.normalMap) {
    material.normalMap = null;
    material.needsUpdate = true;
  }
  // Transparent skylight glass must not write depth or the roof below vanishes
  // behind it at grazing angles on WebGPU.
  if (material.transparent) {
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
  }
}

const MERGED_BATCH_PREFIX = "harbor_";

/**
 * Remove every triangle whose centroid (world space) lies inside `box`.
 * Returns the number of triangles removed; the geometry is replaced in place
 * with a non-indexed copy of the surviving triangles.
 */
export function carveGeometryInsideBox(mesh: THREE.Mesh, box: THREE.Box3): number {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  if (!position) return 0;
  mesh.updateWorldMatrix(true, false);
  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;
  const keep: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  let removed = 0;
  for (let t = 0; t < triangleCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld);
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (box.containsPoint(centroid)) {
      removed++;
    } else {
      keep.push(i0, i1, i2);
    }
  }
  if (removed === 0) return 0;
  const carved = new THREE.BufferGeometry();
  for (const [name, source] of Object.entries(geometry.attributes)) {
    const itemSize = source.itemSize;
    const array = new Float32Array(keep.length * itemSize);
    for (let k = 0; k < keep.length; k++) {
      for (let component = 0; component < itemSize; component++) {
        array[k * itemSize + component] = source.getComponent(keep[k], component);
      }
    }
    carved.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
  }
  carved.computeBoundingBox();
  carved.computeBoundingSphere();
  geometry.dispose();
  mesh.geometry = carved;
  return removed;
}

const prefixBoundsScratch = new THREE.Box3();
const prefixCenterScratch = new THREE.Vector3();

function matchesRemovablePrefix(object: THREE.Object3D, override: ZoneOverride): boolean {
  const prefixes = override.removeNamePrefixes;
  if (!prefixes || !isRenderMesh(object)) return false;
  if (!prefixes.some((prefix) => object.name.startsWith(prefix))) return false;
  prefixBoundsScratch.setFromObject(object);
  if (prefixBoundsScratch.isEmpty()) return false;
  prefixBoundsScratch.getCenter(prefixCenterScratch);
  return override.carveBox.containsPoint(prefixCenterScratch);
}

function applyZoneOverrides(root: THREE.Object3D, overrides: ZoneOverride[]): { removed: number; carved: number } {
  const toRemove: THREE.Object3D[] = [];
  let carved = 0;
  root.traverse((object) => {
    const zone = (object.userData as Record<string, unknown>).harborZone;
    for (const override of overrides) {
      const zoneMatch = typeof zone === "string" && override.removeZones.includes(zone);
      const nameMatch = (override.removeNames?.includes(object.name) ?? false)
        || matchesRemovablePrefix(object, override);
      const carveEntries = override.carveNames?.filter((entry) => entry.name === object.name) ?? [];
      if (carveEntries.length > 0 && isRenderMesh(object)) {
        for (const entry of carveEntries) {
          carved += carveGeometryInsideBox(object, entry.box ?? override.carveBox);
        }
        break;
      }
      if (!zoneMatch && !nameMatch) continue;
      if (zoneMatch && object.name.startsWith(MERGED_BATCH_PREFIX) && isRenderMesh(object)) {
        carved += carveGeometryInsideBox(object, override.carveBox);
      } else {
        toRemove.push(object);
      }
      break;
    }
  });
  for (const object of toRemove) {
    object.removeFromParent();
  }
  // Materials/textures stay shared with surviving meshes (disposed with the
  // map); only geometry that no surviving mesh references is released now.
  const kept = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    if (isRenderMesh(object)) kept.add(object.geometry);
  });
  for (const object of toRemove) {
    object.traverse((child) => {
      if (isRenderMesh(child) && !kept.has(child.geometry)) child.geometry.dispose();
    });
  }
  return { removed: toRemove.length, carved };
}

export interface CompressedMapLoader {
  loader: GLTFLoader;
  dispose(): void;
}

export function createCompressedMapLoader(
  renderer: GameRenderer,
): CompressedMapLoader {
  const ktx2Loader = new KTX2Loader()
    .setTranscoderPath("/assets/basis/")
    .setWorkerLimit(2)
    .detectSupport(renderer);
  const loader = new GLTFLoader()
    .setKTX2Loader(ktx2Loader)
    .setMeshoptDecoder(MeshoptDecoder);

  return {
    loader,
    dispose: () => {
      ktx2Loader.dispose();
    },
  };
}

export function prepareMapAsset(
  root: THREE.Group,
  quality: MapAssetQuality = "high",
  options: MapAssetPrepareOptions = {},
): MapAssetInstance {
  const colliders: THREE.Box3[] = [];
  const ladders: MapAssetLadder[] = [];
  const markers = new Map<string, THREE.Vector3>();
  const discardedMeshes: THREE.Object3D[] = [];
  const useLod1 = quality === "low";
  const anisotropy = anisotropyForQuality(quality, options.maxAnisotropy);
  const tunedMaterials = new Set<THREE.Material>();

  root.updateMatrixWorld(true);
  if (options.zoneOverrides && options.zoneOverrides.length > 0) {
    applyZoneOverrides(root, options.zoneOverrides);
  }
  root.traverse((object) => {
    if (object.name.startsWith("COL_MOVE_")) {
      colliders.push(new THREE.Box3().setFromObject(object));
      object.visible = false;
      discardedMeshes.push(object);
      return;
    }

    if (object.name.startsWith("COL_LADDER_")) {
      // A ladder column blocks movement like any collider and is also climbable.
      const box = new THREE.Box3().setFromObject(object);
      colliders.push(box);
      const approach = object.userData.ladderApproach;
      ladders.push(typeof approach === "string" ? { box, approach } : { box });
      object.visible = false;
      discardedMeshes.push(object);
      return;
    }

    if (object.name.startsWith("MARKER_")) {
      markers.set(object.name, object.getWorldPosition(new THREE.Vector3()));
      object.visible = false;
      return;
    }

    if (isRenderMesh(object)) {
      const discardLod = (useLod1 && object.name.endsWith("_LOD0"))
        || (!useLod1 && object.name.endsWith("_LOD1"));
      if (discardLod) {
        discardedMeshes.push(object);
        return;
      }
      if (object.name.includes("IMPACT_FOLIAGE")) {
        tagWeaponImpactSurface(object, "foliage");
      } else if (object.name.includes("IMPACT_WATER")) {
        tagWeaponImpactSurface(object, "water");
      }
      object.castShadow = shouldCastMapShadow(object);
      object.receiveShadow = true;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (tunedMaterials.has(material)) continue;
        tunedMaterials.add(material);
        tuneMapMaterial(material, anisotropy, quality);
      }
    }
  });

  for (const discardedMesh of discardedMeshes) {
    discardedMesh.removeFromParent();
  }

  collapseRepeatedMeshes(root);

  return { root, colliders, markers, ladders };
}

function collapseRepeatedMeshes(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const candidates = new Map<string, THREE.Mesh[]>();
  root.traverse((object) => {
    if (!isRenderMesh(object) || object instanceof THREE.InstancedMesh) return;
    const instanceKey = object.userData.instanceKey;
    if (typeof instanceKey !== "string" || instanceKey === "") return;
    const entries = candidates.get(instanceKey) ?? [];
    entries.push(object);
    candidates.set(instanceKey, entries);
  });

  const inverseRoot = root.matrixWorld.clone().invert();
  for (const [instanceKey, meshes] of candidates) {
    if (meshes.length < 2) continue;
    const source = meshes[0];
    const material = Array.isArray(source.material)
      ? source.material[0]
      : source.material;
    const instances = new THREE.InstancedMesh(
      source.geometry,
      material,
      meshes.length,
    );
    instances.name = `INSTANCE_${instanceKey}`;
    instances.castShadow = source.castShadow;
    instances.receiveShadow = source.receiveShadow;

    meshes.forEach((mesh, index) => {
      const localMatrix = inverseRoot.clone().multiply(mesh.matrixWorld);
      instances.setMatrixAt(index, localMatrix);
      mesh.removeFromParent();
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.computeBoundingSphere();
    root.add(instances);
  }
}

export function disposeMapAsset(root: THREE.Object3D) {
  disposeObjectResources(root);
  root.removeFromParent();
}

export function disposeObjectResources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    if (!isRenderMesh(object)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of meshMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function cloneTemplate(template: THREE.Group): THREE.Group {
  const clone = template.clone(true);
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, THREE.Material>();
  const textures = new Map<THREE.Texture, THREE.Texture>();
  clone.traverse((object) => {
    if (!isRenderMesh(object)) return;
    const sourceGeometry = object.geometry;
    let geometry = geometries.get(sourceGeometry);
    if (!geometry) {
      geometry = sourceGeometry.clone();
      geometries.set(sourceGeometry, geometry);
    }
    object.geometry = geometry;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) =>
        cloneSharedMaterial(material, materials, textures)
      )
      : cloneSharedMaterial(object.material, materials, textures);
  });
  return clone;
}

function cloneSharedMaterial(
  material: THREE.Material,
  materials: Map<THREE.Material, THREE.Material>,
  textures: Map<THREE.Texture, THREE.Texture>,
): THREE.Material {
  const existing = materials.get(material);
  if (existing) return existing;

  const clone = material.clone();
  materials.set(material, clone);
  const properties = clone as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(properties)) {
    if (value instanceof THREE.Texture) {
      let texture = textures.get(value);
      if (!texture) {
        texture = value.clone();
        texture.needsUpdate = true;
        textures.set(value, texture);
      }
      properties[key] = texture;
    }
  }
  return clone;
}

export class MapAssetLoader {
  private template: THREE.Group | null = null;
  private loadPromise: Promise<boolean> | null = null;

  constructor(
    private readonly url = "/assets/maps/harbor-v2/warehouse.glb",
    private readonly loader = new GLTFLoader(),
  ) {}

  preload(): Promise<boolean> {
    if (this.template) return Promise.resolve(true);
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loader.loadAsync(this.url)
      .then((gltf) => {
        this.template = gltf.scene;
        return true;
      })
      .catch((error: unknown) => {
        console.warn(`[Harbor V2] Unable to load ${this.url}; keeping the fallback visuals.`, error);
        return false;
      });

    return this.loadPromise;
  }

  isReady(): boolean {
    return this.template !== null;
  }

  createInstance(
    quality: MapAssetQuality = "high",
    options: MapAssetPrepareOptions = {},
  ): MapAssetInstance | null {
    if (!this.template) return null;
    return prepareMapAsset(cloneTemplate(this.template), quality, options);
  }
}
