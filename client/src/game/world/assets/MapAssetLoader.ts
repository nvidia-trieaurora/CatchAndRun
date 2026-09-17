import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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
  // The exporter retains this extra after joining decorative palette batches;
  // their names no longer necessarily describe the tiny/light-only geometry.
  if (object.userData.castShadow === false) return false;
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

// GLTFLoader expands one multi-material node into a Group of primitive meshes.
// These non-transform semantics must reach those children for render/weapon
// consumers. Do not copy motion/instance tags: they belong to their rig owner.
const INHERITED_RENDER_TAGS = [
  "zoneLod", "castShadow", "weaponImpactKind", "ignoreWeaponRaycast", "dynamicWeaponRaycast",
] as const;

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
  if (quality === "low" && (material.normalMap || material.aoMap)) {
    material.normalMap = null;
    material.aoMap = null;
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
    // Every active zone gets a say: a map-wide merged batch may be carved by
    // several districts (each inside its own box), and a node one zone carves
    // can still be dropped outright by another.
    let remove = false;
    for (const override of overrides) {
      const zoneMatch = typeof zone === "string" && override.removeZones.includes(zone);
      const nameMatch = (override.removeNames?.includes(object.name) ?? false)
        || matchesRemovablePrefix(object, override);
      if (!zoneMatch && !nameMatch) continue;
      if (zoneMatch && object.name.startsWith(MERGED_BATCH_PREFIX) && isRenderMesh(object)) {
        carved += carveGeometryInsideBox(object, override.carveBox);
      } else {
        remove = true;
      }
    }
    if (remove) {
      toRemove.push(object);
      return;
    }
    if (!isRenderMesh(object)) return;
    for (const override of overrides) {
      for (const entry of override.carveNames ?? []) {
        if (entry.name !== object.name) continue;
        carved += carveGeometryInsideBox(object, entry.box ?? override.carveBox);
      }
    }
  });
  for (const object of toRemove) {
    object.removeFromParent();
  }
  // Removed districts may own full texture sets. Keep shared resources alive,
  // but do not leave their now-unreachable materials/textures resident.
  releaseUnreferencedResources(collectObjectResources(toRemove), collectObjectResources([root]));
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
  const skippedSubtrees = new Set<THREE.Object3D>();

  root.updateMatrixWorld(true);
  if (options.zoneOverrides && options.zoneOverrides.length > 0) {
    applyZoneOverrides(root, options.zoneOverrides);
  }
  const originalResources = collectObjectResources([root]);
  root.traverse((object) => {
    // traverse() still visits children after returning from a Group callback.
    // Never tune, extract colliders from, or resurrect a rejected LOD subtree.
    if (object.parent && skippedSubtrees.has(object.parent)) {
      skippedSubtrees.add(object);
      return;
    }
    const namedLod = object.name.endsWith("_LOD0") ? "LOD0" : object.name.endsWith("_LOD1") ? "LOD1" : undefined;
    if (object.userData.zoneLod === undefined && namedLod) object.userData.zoneLod = namedLod;
    for (const key of INHERITED_RENDER_TAGS) {
      if (object.userData[key] === undefined && object.parent?.userData[key] !== undefined) {
        object.userData[key] = object.parent.userData[key];
      }
    }
    const discardLod = (useLod1 && object.userData.zoneLod === "LOD0")
      || (!useLod1 && object.userData.zoneLod === "LOD1");
    if (discardLod) {
      discardedMeshes.push(object);
      skippedSubtrees.add(object);
      return;
    }
    if (object.name.startsWith("COL_MOVE_")) {
      colliders.push(new THREE.Box3().setFromObject(object));
      object.visible = false;
      discardedMeshes.push(object);
      skippedSubtrees.add(object);
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
      skippedSubtrees.add(object);
      return;
    }

    if (object.name.startsWith("MARKER_")) {
      markers.set(object.name, object.getWorldPosition(new THREE.Vector3()));
      object.visible = false;
      skippedSubtrees.add(object);
      return;
    }

    if (object.name.includes("IMPACT_FOLIAGE")) {
      tagWeaponImpactSurface(object, "foliage");
    } else if (object.name.includes("IMPACT_WATER")) {
      tagWeaponImpactSurface(object, "water");
    }
    if (isRenderMesh(object)) {
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
  releaseUnreferencedResources(originalResources, collectObjectResources([root]));

  return { root, colliders, markers, ladders };
}

/** Offset between equal geometries whose translations were baked by Blender.
 * Reject differences in topology, UVs, normals and vertex colors: instanceKey
 * is an authoring hint, not permission to replace a differently shaped prop.
 */
function geometryTranslation(source: THREE.BufferGeometry, target: THREE.BufferGeometry): THREE.Vector3 | null {
  if (source === target) return new THREE.Vector3();
  if (JSON.stringify(source.groups) !== JSON.stringify(target.groups)
    || source.drawRange.start !== target.drawRange.start
    || source.drawRange.count !== target.drawRange.count
    || Object.keys(source.morphAttributes).length || Object.keys(target.morphAttributes).length) return null;
  const sourceIndex = source.index;
  const targetIndex = target.index;
  if (!!sourceIndex !== !!targetIndex || sourceIndex?.count !== targetIndex?.count) return null;
  if (sourceIndex && targetIndex) {
    for (let i = 0; i < sourceIndex.count; i++) if (sourceIndex.getX(i) !== targetIndex.getX(i)) return null;
  }
  const names = Object.keys(source.attributes);
  if (names.length !== Object.keys(target.attributes).length) return null;
  const a = source.getAttribute("position");
  const b = target.getAttribute("position");
  if (!a || !b || !a.count || a.count !== b.count) return null;
  const offset = new THREE.Vector3(b.getX(0) - a.getX(0), b.getY(0) - a.getY(0), b.getZ(0) - a.getZ(0));
  const epsilon = 0.00001; // Float32 export error at harbor-scale coordinates.
  for (const name of names) {
    const first = source.getAttribute(name);
    const second = target.getAttribute(name);
    if (first.count !== second?.count || first.itemSize !== second.itemSize || first.normalized !== second.normalized) return null;
    for (let i = 0; i < first.count; i++) {
      for (let component = 0; component < first.itemSize; component++) {
        const shift = name === "position" && component < 3 ? offset.getComponent(component) : 0;
        if (Math.abs(first.getComponent(i, component) + shift - second.getComponent(i, component)) > epsilon) return null;
      }
    }
  }
  return offset;
}

function instanceCompatibilityKey(mesh: THREE.Mesh): string {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return JSON.stringify([
    mesh.parent?.uuid,
    materials.map((material) => material.uuid),
    mesh.castShadow, mesh.receiveShadow, mesh.visible, mesh.layers.mask, mesh.renderOrder,
    mesh.userData.ambientMotion, mesh.userData.spinAxis, mesh.userData.spinRpm,
    mesh.userData.weaponImpactKind, mesh.userData.ignoreWeaponRaycast,
    mesh.userData.dynamicWeaponRaycast,
  ]);
}

/** Distinct baked UV/color variants cannot instance, but static ones can still
 * share a draw without throwing their authored geometry away. */
function mergeStaticVariants(meshes: THREE.Mesh[], name: string): boolean {
  const source = meshes[0];
  if (Array.isArray(source.material) || source.userData.ambientMotion
    || source.userData.dynamicWeaponRaycast) return false;
  const attributes = Object.keys(source.geometry.attributes).sort();
  for (const mesh of meshes) {
    if (mesh.geometry.drawRange.start !== 0 || mesh.geometry.drawRange.count !== Infinity
      || Object.keys(mesh.geometry.morphAttributes).length
      || JSON.stringify(Object.keys(mesh.geometry.attributes).sort()) !== JSON.stringify(attributes)) return false;
    for (const name of attributes) {
      const a = source.geometry.getAttribute(name);
      const b = mesh.geometry.getAttribute(name);
      if (a.itemSize !== b.itemSize || a.normalized !== b.normalized || a.array.constructor !== b.array.constructor) return false;
    }
  }
  const parent = source.parent!;
  const inverseParent = parent.matrixWorld.clone().invert();
  // Use non-indexed copies so a mixture of indexed / flat exported variants
  // stays mergeable. These small fallback families are tens of props, not
  // the map-wide structure; compatible families still use GPU instancing.
  const transformed = meshes.map((mesh) => {
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(inverseParent.clone().multiply(mesh.matrixWorld));
    return geometry;
  });
  const geometry = mergeGeometries(transformed, false);
  for (const temporary of transformed) temporary.dispose();
  if (!geometry) return false;
  // glTF can pad RGB8 to a 4-byte interleaved stride. mergeGeometries unpacks
  // that into RGB8 (3 bytes), which WebGPU cannot bind as a vertex buffer.
  // Expand only these tiny fallback batches to normalized float RGB; keep
  // the compressed/padded attributes on all other imported meshes intact.
  const color = geometry.getAttribute("color");
  if (color && (color.itemSize * color.array.BYTES_PER_ELEMENT) % 4 !== 0) {
    const values = new Float32Array(color.count * color.itemSize);
    for (let i = 0; i < color.count; i++) {
      for (let component = 0; component < color.itemSize; component++) {
        values[i * color.itemSize + component] = color.getComponent(i, component);
      }
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(values, color.itemSize));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const batch = new THREE.Mesh(geometry, source.material);
  batch.name = name;
  batch.userData = { ...source.userData };
  batch.castShadow = source.castShadow;
  batch.receiveShadow = source.receiveShadow;
  batch.visible = source.visible;
  batch.layers.mask = source.layers.mask;
  batch.renderOrder = source.renderOrder;
  for (const mesh of meshes) mesh.removeFromParent();
  parent.add(batch);
  return true;
}

function collapseRepeatedMeshes(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const candidates = new Map<string, THREE.Mesh[]>();
  root.traverse((object) => {
    if (!isRenderMesh(object) || object instanceof THREE.InstancedMesh
      || object instanceof THREE.SkinnedMesh || object.children.length > 0 || object.morphTargetInfluences) return;
    const instanceKey = object.userData.instanceKey;
    if (typeof instanceKey !== "string" || instanceKey === "") return;
    const entries = candidates.get(instanceKey) ?? [];
    entries.push(object);
    candidates.set(instanceKey, entries);
  });

  for (const [instanceKey, meshes] of candidates) {
    if (meshes.length < 2) continue;
    const groups: { key: string; entries: { mesh: THREE.Mesh; offset: THREE.Vector3 }[] }[] = [];
    for (const mesh of meshes) {
      const key = instanceCompatibilityKey(mesh);
      let grouped = false;
      for (const group of groups) {
        if (group.key !== key) continue;
        const offset = geometryTranslation(group.entries[0].mesh.geometry, mesh.geometry);
        if (!offset) continue;
        // Motion profiles use local positions for hubs and wind/pendulum
        // ramps. Do not change that frame while deduplicating baked props.
        if (mesh.userData.ambientMotion && offset.lengthSq() > 1e-10) continue;
        group.entries.push({ mesh, offset });
        grouped = true;
        break;
      }
      if (!grouped) groups.push({ key, entries: [{ mesh, offset: new THREE.Vector3() }] });
    }
    let batchIndex = 0;
    const mergedKeys = new Set<string>();
    for (const { key, entries } of groups) {
      if (mergedKeys.has(key)) continue;
      const variants = groups.filter((group) => group.key === key);
      if (variants.length > 1 && mergeStaticVariants(
        variants.flatMap((group) => group.entries.map((entry) => entry.mesh)),
        `BATCH_${instanceKey}_${batchIndex}`,
      )) {
        mergedKeys.add(key);
        batchIndex++;
        continue;
      }
      if (entries.length < 2) continue;
      const source = entries[0].mesh;
      const parent = source.parent!;
      const inverseParent = parent.matrixWorld.clone().invert();
      const instances = new THREE.InstancedMesh(source.geometry, source.material, entries.length);
      instances.name = `INSTANCE_${instanceKey}${batchIndex === 0 ? "" : `_${batchIndex}`}`;
      batchIndex++;
      instances.castShadow = source.castShadow;
      instances.receiveShadow = source.receiveShadow;
      instances.visible = source.visible;
      instances.layers.mask = source.layers.mask;
      instances.renderOrder = source.renderOrder;
      instances.userData = { ...source.userData };
      const localMatrix = new THREE.Matrix4();
      const translation = new THREE.Matrix4();
      entries.forEach(({ mesh, offset }, index) => {
        localMatrix.copy(inverseParent).multiply(mesh.matrixWorld)
          .multiply(translation.makeTranslation(offset.x, offset.y, offset.z));
        instances.setMatrixAt(index, localMatrix);
        mesh.removeFromParent();
      });
      instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingBox();
      instances.computeBoundingSphere();
      parent.add(instances);
    }
  }
}

export function disposeMapAsset(root: THREE.Object3D) {
  disposeObjectResources(root);
  root.removeFromParent();
}

function collectObjectResources(roots: readonly THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  for (const root of roots) root.traverse((object) => {
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

  return { geometries, materials, textures };
}

function releaseUnreferencedResources(
  original: ReturnType<typeof collectObjectResources>,
  retained: ReturnType<typeof collectObjectResources>,
) {
  for (const resource of original.textures) if (!retained.textures.has(resource)) resource.dispose();
  for (const resource of original.materials) if (!retained.materials.has(resource)) resource.dispose();
  for (const resource of original.geometries) if (!retained.geometries.has(resource)) resource.dispose();
}

export function disposeObjectResources(root: THREE.Object3D) {
  const { textures, materials, geometries } = collectObjectResources([root]);

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
