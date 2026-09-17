import * as THREE from "three";
import { getSupportHeightAt, registerMovingSupport, type SupportTransforms } from "../SupportSurfaces";

interface BoatPart {
  local: THREE.Box3;
  world: THREE.Box3;
  previous: THREE.Box3;
  sourceMeshName: string;
}

interface Boat {
  root: THREE.Object3D;
  transforms: SupportTransforms;
  parts: BoatPart[];
  hullInterior?: BoatHullInterior;
}

export interface BoatHullInterior {
  worldToLocal: THREE.Matrix4;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floorY: number;
}

export interface BoatCollisionInfo {
  name: string;
  boxes: readonly THREE.Box3[];
  /** Parallel diagnostic snapshots; mutating them cannot alter physics. */
  localBoxes: readonly THREE.Box3[];
  sourceMeshNames: readonly string[];
  minimumDeckLocalY: number;
  moored: boolean;
}

/**
 * One-time collision extraction from the surviving boat LOD's real mesh faces.
 * Render-only spars, tyres and mooring ropes never become a giant hull AABB.
 * Each connected solid's upward horizontal patches supply a deck/roof/crate
 * footprint and its actual thickness. Baked material batches are welded only
 * for this extraction; the rendered geometry and its UVs remain untouched.
 */
function solidSupports(mesh: THREE.Mesh, boat: THREE.Object3D): THREE.Box3[] {
  const positions = mesh.geometry.getAttribute("position");
  const matrix = boat.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const points: THREE.Vector3[] = [];
  const representatives: number[] = [];
  const unique = new Map<string, number>();
  const parents: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix);
    points.push(p);
    const key = [p.x, p.y, p.z].map((value) => Math.round(value * 10000)).join("|");
    let id = unique.get(key);
    if (id === undefined) {
      id = i;
      unique.set(key, id);
      parents[id] = id;
    }
    representatives.push(id);
  }
  const find = (value: number): number => {
    let root = value;
    while (parents[root] !== root) root = parents[root];
    while (value !== root) {
      const next = parents[value];
      parents[value] = root;
      value = next;
    }
    return root;
  };
  const index = mesh.geometry.getIndex();
  const count = index?.count ?? positions.count;
  const vertex = (i: number) => index ? index.getX(i) : i;
  for (let i = 0; i < count; i += 3) {
    const a = find(representatives[vertex(i)]);
    parents[find(representatives[vertex(i + 1)])] = a;
    parents[find(representatives[vertex(i + 2)])] = a;
  }
  const components = new Map<number, THREE.Box3>();
  for (let i = 0; i < points.length; i++) {
    const key = find(representatives[i]);
    let bounds = components.get(key);
    if (!bounds) { bounds = new THREE.Box3(); components.set(key, bounds); }
    bounds.expandByPoint(points[i]);
  }
  const patches = new Map<string, { bounds: THREE.Box3; component: THREE.Box3; area: number }>();
  const edge1 = new THREE.Vector3(), edge2 = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    const ia = vertex(i), a = points[ia], b = points[vertex(i + 1)], c = points[vertex(i + 2)];
    normal.crossVectors(edge1.subVectors(b, a), edge2.subVectors(c, a));
    // Sloped hull skins and underside triangles do not provide a dry deck.
    if (normal.y <= 0 || normal.y / normal.length() < .999) continue;
    if (Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) > .002) continue;
    const componentId = find(representatives[ia]);
    const component = components.get(componentId);
    if (!component) continue;
    const key = `${componentId}|${Math.round((a.y + b.y + c.y) / 3 * 1000)}`;
    let patch = patches.get(key);
    if (!patch) { patch = { bounds: new THREE.Box3(), component, area: 0 }; patches.set(key, patch); }
    patch.bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
    patch.area += normal.y / 2;
  }
  const supports: THREE.Box3[] = [];
  for (const patch of patches.values()) {
    const width = patch.bounds.max.x - patch.bounds.min.x;
    const depth = patch.bounds.max.z - patch.bounds.min.z;
    // Preserve real benches, bulwarks and narrow solid rails; their footprint
    // stays narrow, never stretched into a sheet across the hull opening.
    const deck = width >= .12 && depth >= .12 && patch.area >= .08;
    const rail = Math.min(width, depth) >= .018 && Math.max(width, depth) >= .6 && patch.area >= .02;
    if ((!deck && !rail) || patch.area < width * depth * .74) continue;
    const box = patch.bounds.clone();
    box.min.y = Math.min(patch.component.min.y, box.max.y - .04);
    supports.push(box);
  }
  return supports;
}

export class BoatCollisionRig {
  readonly colliders: THREE.Box3[] = [];
  readonly hullInteriors: BoatHullInterior[] = [];
  private readonly boats: Boat[] = [];
  private readonly point = new THREE.Vector3();
  private readonly transformed = new THREE.Vector3();

  constructor(roots: readonly THREE.Object3D[]) {
    for (const root of roots) {
      root.updateWorldMatrix(true, true);
      root.traverse((object) => {
        if (!object.name.startsWith("RIG_FERRIS_HARBOR_BOAT_") || typeof object.userData.ambientMotion !== "string") return;
        const parts: BoatPart[] = [];
        object.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          // Authored cosmetic fittings do not create support patches. A glTF
          // multi-material node may put its extras on a Group ancestor, so
          // honor the whole tagged subtree, not only primitive Mesh extras.
          for (let ancestor: THREE.Object3D | null = child; ancestor; ancestor = ancestor.parent) {
            if (ancestor.userData.boatDetailOnly === true) return;
            if (ancestor === object) break;
          }
          for (const local of solidSupports(child as THREE.Mesh, object)) {
            const world = local.clone().applyMatrix4(object.matrixWorld);
            parts.push({ local, world, previous: world.clone(), sourceMeshName: child.name });
            this.colliders.push(world);
          }
        });
        if (parts.length) {
          const transforms: SupportTransforms = {
            current: object.matrixWorld.clone(), inverseCurrent: object.matrixWorld.clone().invert(),
            previous: object.matrixWorld.clone(), inversePrevious: object.matrixWorld.clone().invert(),
          };
          const boat: Boat = { root: object, parts, transforms };
          for (const part of parts) registerMovingSupport(part.world, part.local, transforms);
          // Only the real open skiff floor needs a cutout. LOD1 has a solid
          // raised hull top: never remove water around its rectangular hull.
          if (object.name.includes("SKIFF_")) {
            const floor = parts.find(({ local }) => local.max.y < .12 && local.max.x - local.min.x > 2 && local.max.z - local.min.z > .7);
            if (floor) {
              boat.hullInterior = {
                worldToLocal: object.matrixWorld.clone().invert(),
                minX: floor.local.min.x, maxX: floor.local.max.x,
                minZ: floor.local.min.z, maxZ: floor.local.max.z, floorY: floor.local.max.y,
              };
              this.hullInteriors.push(boat.hullInterior);
            }
          }
          this.boats.push(boat);
        }
      });
    }
  }

  /** Call after ambient motion and before movement/collision queries each frame. */
  update(): void {
    for (const boat of this.boats) {
      boat.transforms.previous.copy(boat.transforms.current);
      boat.transforms.inversePrevious.copy(boat.transforms.inverseCurrent);
      boat.root.updateWorldMatrix(true, false);
      boat.transforms.current.copy(boat.root.matrixWorld);
      boat.transforms.inverseCurrent.copy(boat.root.matrixWorld).invert();
      boat.hullInterior?.worldToLocal.copy(boat.root.matrixWorld).invert();
      for (const part of boat.parts) {
        part.previous.copy(part.world);
        part.world.copy(part.local).applyMatrix4(boat.root.matrixWorld);
      }
    }
  }

  /** Delta for feet supported on the previous frame's moving deck, not swimmers. */
  carryDelta(x: number, feetY: number, z: number, out: THREE.Vector3, radius = .28): boolean {
    let support: BoatPart | null = null;
    let owner: Boat | null = null;
    let error = .09;
    for (const boat of this.boats) for (const part of boat.parts) {
      const height = getSupportHeightAt(part.world, x, z, radius, true);
      if (height === null) continue;
      const distance = Math.abs(feetY - height);
      if (distance >= error) continue;
      support = part;
      owner = boat;
      error = distance;
    }
    if (!support || !owner) { out.set(0, 0, 0); return false; }
    this.point.set(x, feetY, z);
    this.transformed.copy(this.point).applyMatrix4(owner.transforms.inversePrevious).applyMatrix4(owner.transforms.current);
    out.subVectors(this.transformed, this.point);
    // The contact follows the real plane at this local point, not a global
    // AABB corner whose height changes with tilt and deck length.
    return true;
  }

  getBoats(): BoatCollisionInfo[] {
    return this.boats.map((boat) => ({
      name: boat.root.name,
      moored: boat.root.userData.boatMoored === true,
      boxes: boat.parts.map((part) => part.world),
      localBoxes: boat.parts.map((part) => part.local.clone()),
      sourceMeshNames: boat.parts.map((part) => part.sourceMeshName),
      minimumDeckLocalY: Math.min(...boat.parts.filter((part) => {
        const size = part.local.getSize(new THREE.Vector3());
        return size.x * size.z > .8;
      }).map((part) => part.local.max.y)),
    }));
  }

  /** Exact current contact height, using this rig's registered finite patches. */
  supportHeightAt(box: THREE.Box3, x: number, z: number, radius = .28): number | null {
    return getSupportHeightAt(box, x, z, radius);
  }
}
