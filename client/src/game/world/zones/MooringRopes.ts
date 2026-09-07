import * as THREE from "three";

/**
 * Mooring lines between boat sockets and dock cleats. Sockets are authored in
 * the zone GLB as empties:
 *
 *   SOCKET_<ZONE>_MOOR_<BOAT>_<n>_BOAT   (child of the bobbing boat root; extra
 *                                        `dock` = name of the cleat socket)
 *   SOCKET_<ZONE>_MOOR_DOCK_<k>          (static, on the seawall cap)
 *
 * Each rope is one fixed-size tube whose vertex positions are rewritten in
 * place every frame from the two socket world positions with a quadratic sag:
 * no allocation, no new geometry, and the low tier gets a straight 2-segment
 * line. Ropes never carry colliders and ignore weapon raycasts.
 */
export const ROPE_SAG = 0.22;
const ROPE_RADIUS = 0.022;
const ROPE_SIDES = 4;
const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const scratchP = new THREE.Vector3();
const scratchT = new THREE.Vector3();
const scratchN = new THREE.Vector3();
const scratchBn = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

interface Rope {
  boatSocket: THREE.Object3D;
  dockSocket: THREE.Object3D;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  segments: number;
}

export class MooringRopes {
  readonly group = new THREE.Group();
  private readonly ropes: Rope[] = [];
  private readonly material: THREE.MeshStandardMaterial;

  constructor(roots: readonly THREE.Object3D[], lowTier: boolean) {
    this.group.name = "mooring-ropes";
    this.group.userData.ignoreWeaponRaycast = true;
    this.material = new THREE.MeshStandardMaterial({ color: 0x8f7d5a, roughness: 0.95, metalness: 0 });
    const docks = new Map<string, THREE.Object3D>();
    const boats: THREE.Object3D[] = [];
    for (const root of roots) root.traverse((object) => {
      if (!object.name.startsWith("SOCKET_")) return;
      if (object.name.includes("_MOOR_DOCK_")) docks.set(object.name, object);
      else if (object.name.endsWith("_BOAT")) boats.push(object);
    });
    const segments = lowTier ? 2 : 8;
    for (const boatSocket of boats) {
      const dockName: unknown = (boatSocket.userData as Record<string, unknown>).dock;
      const dockSocket = typeof dockName === "string" ? docks.get(dockName) : undefined;
      if (!dockSocket) continue;
      const geometry = new THREE.BufferGeometry();
      const rings = segments + 1;
      const positions = new Float32Array(rings * ROPE_SIDES * 3);
      const normals = new Float32Array(rings * ROPE_SIDES * 3);
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
      const index: number[] = [];
      for (let s = 0; s < segments; s++) {
        for (let k = 0; k < ROPE_SIDES; k++) {
          const a = s * ROPE_SIDES + k;
          const b = s * ROPE_SIDES + ((k + 1) % ROPE_SIDES);
          const c = (s + 1) * ROPE_SIDES + k;
          const d = (s + 1) * ROPE_SIDES + ((k + 1) % ROPE_SIDES);
          index.push(a, c, b, b, c, d);
        }
      }
      geometry.setIndex(index);
      geometry.boundingSphere = new THREE.Sphere();
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.name = `ROPE_${boatSocket.name}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.userData.ignoreWeaponRaycast = true;
      this.group.add(mesh);
      this.ropes.push({ boatSocket, dockSocket, mesh, segments });
    }
    this.update();
  }

  getRopeCount(): number {
    return this.ropes.length;
  }

  /** Rewrite every rope from the live socket positions (call once per frame). */
  update(): void {
    for (const rope of this.ropes) {
      rope.boatSocket.getWorldPosition(scratchA);
      rope.dockSocket.getWorldPosition(scratchB);
      const attribute = rope.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      const normalAttribute = rope.mesh.geometry.getAttribute("normal") as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      const normals = normalAttribute.array as Float32Array;
      scratchT.subVectors(scratchB, scratchA);
      const length = scratchT.length();
      if (length < 1e-4) continue;
      scratchT.divideScalar(length);
      // frame perpendicular to the rope
      scratchN.crossVectors(scratchT, UP);
      if (scratchN.lengthSq() < 1e-6) scratchN.set(1, 0, 0);
      scratchN.normalize();
      scratchBn.crossVectors(scratchT, scratchN).normalize();
      const sag = Math.min(ROPE_SAG, length * 0.12);
      let write = 0;
      for (let s = 0; s <= rope.segments; s++) {
        const t = s / rope.segments;
        scratchP.lerpVectors(scratchA, scratchB, t);
        scratchP.y -= sag * 4 * t * (1 - t);
        for (let k = 0; k < ROPE_SIDES; k++) {
          const phase = (k / ROPE_SIDES) * Math.PI * 2;
          const c = Math.cos(phase);
          const s = Math.sin(phase);
          // ring vertex and its outward normal share the same frame direction
          const dx = scratchN.x * c + scratchBn.x * s;
          const dy = scratchN.y * c + scratchBn.y * s;
          const dz = scratchN.z * c + scratchBn.z * s;
          normals[write] = dx;
          array[write++] = scratchP.x + dx * ROPE_RADIUS;
          normals[write] = dy;
          array[write++] = scratchP.y + dy * ROPE_RADIUS;
          normals[write] = dz;
          array[write++] = scratchP.z + dz * ROPE_RADIUS;
        }
      }
      attribute.needsUpdate = true;
      normalAttribute.needsUpdate = true;
      const sphere = rope.mesh.geometry.boundingSphere;
      if (sphere) {
        sphere.center.lerpVectors(scratchA, scratchB, 0.5);
        sphere.radius = length * 0.5 + sag + ROPE_RADIUS;
      }
    }
  }

  dispose(): void {
    for (const rope of this.ropes) rope.mesh.geometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
    this.ropes.length = 0;
  }
}
