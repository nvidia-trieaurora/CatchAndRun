import * as THREE from "three";
import { tagWeaponImpactSurface } from "../weaponImpactSurfaces";

/**
 * Sunny School map — coordinates must stay in sync with
 * server/src/data/maps/school.json (bounds, walls, spawns, gate).
 *
 * Layout:
 * - Main building (2 floors): x [-30, 30], z [-28, 0]; corridor z [-6, 0]
 * - Gym: x [-45, -32], z [2, 30]
 * - Cafeteria: x [32, 45], z [2, 26]
 * - Schoolyard: z [2, 32]; school gate (hunter pen) at z = 32
 */

const C = {
  grass: 0x6a9a4a,
  concrete: 0xb8b0a0,
  brick: 0xc06848,
  brickDark: 0x9a5038,
  wallInner: 0xe8e0d0,
  floorTile: 0xd8cfc0,
  corridorTile: 0xc8c0b0,
  roof: 0x7a5a48,
  blackboard: 0x2a4a3a,
  woodDesk: 0xba8a4a,
  woodDark: 0x8a5a2a,
  locker: 0x4a6a8a,
  gymFloor: 0xcaa060,
  bleacher: 0x9a7a4a,
  counter: 0xd0d0c8,
  fridge: 0xe0e0e0,
  metalFence: 0x607068,
  gateGreen: 0x2a6a4a,
  flagRed: 0xda251d,
  flagYellow: 0xffdd00,
  bench: 0x8a6a4a,
  planter: 0x9a4a3a,
  leaf: 0x3a7a2a,
  trunk: 0x6a4a2a,
  bikeRack: 0x888888,
  pathGray: 0xa8a098,
  window: 0x9ac8e0,
};

function mat(color: number, rough = 0.85, metal = 0.05): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

interface MapBuildResult {
  colliders: THREE.Box3[];
  gateColliderIndex: number;
  gateMesh: THREE.Mesh | null;
  ferrisWheel: THREE.Group | null;
  ferrisCabinColliders: THREE.Box3[];
}

class B {
  constructor(private scene: THREE.Scene, private colliders: THREE.Box3[]) {}

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, collide = true, rough = 0.85): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, rough));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collide) this.colliders.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }

  cyl(rT: number, rB: number, h: number, x: number, y: number, z: number, color: number, collide = true): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, 12), mat(color, 0.7));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collide) this.colliders.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }
}

export function buildSchoolMap(scene: THREE.Scene): MapBuildResult {
  const colliders: THREE.Box3[] = [];
  const b = new B(scene, colliders);

  buildGround(b, scene);
  buildMainBuilding(b, scene);
  buildGym(b);
  buildCafeteria(b);
  buildYard(b, scene);
  const { gateIdx, gateMesh } = buildGateAndFence(b, scene, colliders);

  return {
    colliders,
    gateColliderIndex: gateIdx,
    gateMesh,
    ferrisWheel: null,
    ferrisCabinColliders: [],
  };
}

function buildGround(b: B, scene: THREE.Scene) {
  // Grass base covering play area
  const grass = new THREE.Mesh(new THREE.BoxGeometry(120, 0.2, 100), mat(C.grass, 0.95));
  grass.position.set(0, -0.1, 0);
  grass.receiveShadow = true;
  scene.add(grass);

  // Yard concrete
  b.box(64, 0.24, 30, 0, -0.08, 17, C.concrete, false, 0.95);
  // Path from gate to entrance
  b.box(5, 0.28, 32, 0, -0.04, 16, C.pathGray, false, 0.95);
}

function buildMainBuilding(b: B, scene: THREE.Scene) {
  const H = 3.8;        // floor height
  const SLAB = 0.4;     // slab thickness

  // Ground slab + floor tiles
  b.box(60, 0.3, 28, 0, 0.05, -14, C.floorTile, false, 0.95);
  b.box(60, 0.06, 6, 0, 0.23, -3, C.corridorTile, false, 0.95);

  // South wall (corridor side) with main entrance gap x [-2, 2]
  b.box(28, H, 0.4, -16, H / 2, 0, C.brick);
  b.box(28, H, 0.4, 16, H / 2, 0, C.brick);
  b.box(4, 0.8, 0.4, 0, H - 0.4, 0, C.brick, true);      // lintel above entrance
  // South wall floor 2 (full)
  b.box(60, H, 0.4, 0, H + SLAB + H / 2, 0, C.brick);

  // North wall (both floors)
  b.box(60, 2 * H + SLAB, 0.8, 0, (2 * H + SLAB) / 2, -28, C.brick);
  // East + West walls (both floors)
  b.box(0.8, 2 * H + SLAB, 28, -30, (2 * H + SLAB) / 2, -14, C.brickDark);
  b.box(0.8, 2 * H + SLAB, 28, 30, (2 * H + SLAB) / 2, -14, C.brickDark);

  // Windows on south wall floor 2 (visual)
  for (let i = -2; i <= 2; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 0.1), mat(C.window, 0.2, 0.6));
    win.position.set(i * 11, H + SLAB + 2, 0.25);
    scene.add(win);
  }

  // Floor-2 slab: classrooms area full; corridor slab leaves stair openings at both ends
  b.box(60, SLAB, 22, 0, H + SLAB / 2, -17, C.floorTile);
  b.box(48, SLAB, 6, 0, H + SLAB / 2, -3, C.corridorTile);

  // Roof
  b.box(61, 0.4, 29, 0, 2 * H + SLAB + 0.2, -14, C.roof);

  // Classroom dividers (floor 1): x = -15, 0, 15 across z [-28, -6]
  for (const x of [-15, 0, 15]) {
    b.box(0.4, H, 22, x, H / 2, -17, C.wallInner);
  }

  // Corridor/classroom wall (z = -6) with door gaps at x = ±7.5, ±22.5
  const segs: [number, number][] = [[-30, -23.5], [-21.5, -8.5], [-6.5, 6.5], [8.5, 21.5], [23.5, 30]];
  for (const [x1, x2] of segs) {
    b.box(x2 - x1, H, 0.4, (x1 + x2) / 2, H / 2, -6, C.wallInner);
  }

  // Stairs at both corridor ends: 9 steps up to floor 2
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const sx = side * (29 - i * 0.62);
      b.box(0.62, 0.44 * (i + 1), 3.4, sx, 0.22 * (i + 1), -3, C.concrete);
    }
  }

  // Floor-2 railing along corridor edge
  b.box(48, 1, 0.2, 0, H + SLAB + 0.5, -6, C.metalFence);

  // Classroom furnishings (4 rooms)
  const roomCenters = [-22.5, -7.5, 7.5, 22.5];
  for (const cx of roomCenters) {
    // Blackboard on north wall
    const bb = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 0.15), mat(C.blackboard, 0.9));
    bb.position.set(cx, 1.8, -27.5);
    scene.add(bb);
    // Teacher desk
    b.box(2, 0.8, 0.9, cx, 0.4, -25, C.woodDesk);
    // Student desks 2×3
    for (let r = 0; r < 3; r++) {
      for (let c2 = 0; c2 < 2; c2++) {
        b.box(1.2, 0.8, 0.6, cx - 2.5 + c2 * 5, 0.4, -21 + r * 4, C.woodDesk);
        b.box(0.5, 0.9, 0.5, cx - 2.5 + c2 * 5, 0.45, -19.9 + r * 4, C.woodDark);
      }
    }
    // Lockers along divider wall
    b.box(0.5, 2, 4, cx - 6.5, 1, -12, C.locker);
  }

  // Corridor lockers
  for (const x of [-18, -10, 10, 18]) {
    b.box(3, 2, 0.5, x, 1, -5.5, C.locker);
  }

  // Floor-2 bookshelves (open study hall)
  for (const x of [-12, 0, 12]) {
    b.box(1.6, 1.8, 0.4, x, H + SLAB + 0.9, -20, C.woodDark);
  }
}

function buildGym(b: B) {
  const H = 8;
  // Walls: door gap on east wall z [14, 17]
  b.box(0.8, H, 28, -45, H / 2, 16, C.brick);                 // west
  b.box(13, H, 0.8, -38.5, H / 2, 2, C.brick);                // south
  b.box(13, H, 0.8, -38.5, H / 2, 30, C.brick);               // north
  b.box(0.8, H, 12, -32, H / 2, 8, C.brick);                  // east below door
  b.box(0.8, H, 13, -32, H / 2, 23.5, C.brick);               // east above door
  b.box(0.8, H - 3, 3, -32, 3 + (H - 3) / 2, 15.5, C.brick); // header over door (y 3..8)
  // Roof + floor
  b.box(14, 0.4, 29, -38.5, H + 0.2, 16, C.roof);
  b.box(13, 0.15, 27.5, -38.5, 0.1, 16, C.gymFloor, false, 0.9);

  // Bleachers (3 tiers along west wall)
  for (let i = 0; i < 3; i++) {
    b.box(1.2, 0.5 * (i + 1), 20, -43.8 + i * 1.2, 0.25 * (i + 1), 16, C.bleacher);
  }
  // Mats + balls clutter
  b.box(2, 0.3, 1, -36, 0.15, 6, 0x2a4a8a);
  b.box(2, 0.3, 1, -34.5, 0.15, 26, 0x8a2a4a);
  b.cyl(0.4, 0.4, 0.8, -40, 0.4, 25, 0xd2691e);
}

function buildCafeteria(b: B) {
  const H = 4;
  // Walls: door gap on west wall z [12, 15]
  b.box(0.8, H, 24, 45, H / 2, 14, C.brick);                  // east
  b.box(13, H, 0.8, 38.5, H / 2, 2, C.brick);                 // south
  b.box(13, H, 0.8, 38.5, H / 2, 26, C.brick);                // north
  b.box(0.8, H, 10, 32, H / 2, 7, C.brick);                   // west below door
  b.box(0.8, H, 11, 32, H / 2, 20.5, C.brick);                // west above door
  // Roof + floor
  b.box(14, 0.4, 25, 38.5, H + 0.2, 14, C.roof);
  b.box(13, 0.15, 23.5, 38.5, 0.1, 14, C.floorTile, false, 0.95);

  // Serving counter + fridge
  b.box(8, 1.1, 1.2, 39, 0.55, 24, C.counter);
  b.box(1.4, 2.2, 1.2, 44, 1.1, 23, C.fridge);
  // Round-ish tables
  for (const [tx, tz] of [[36, 8], [41, 8], [36, 15], [41, 15]] as const) {
    b.cyl(1.1, 1.1, 0.1, tx, 0.85, tz, C.woodDesk);
    b.cyl(0.15, 0.15, 0.85, tx, 0.42, tz, C.metalFence);
  }
}

function buildYard(b: B, scene: THREE.Scene) {
  // Flagpole with Vietnamese flag
  b.cyl(0.08, 0.12, 9, 0, 4.5, 20, C.bikeRack);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.05), mat(C.flagRed, 0.8));
  flag.position.set(1.2, 8, 20);
  scene.add(flag);
  const star = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 5), mat(C.flagYellow, 0.6));
  star.rotation.x = Math.PI / 2;
  star.position.set(1.2, 8, 19.95);
  scene.add(star);
  // Flagpole base
  b.box(1.6, 0.5, 1.6, 0, 0.25, 20, C.concrete);

  // Benches
  for (const [bx, bz] of [[-12, 12], [12, 12], [-20, 24], [20, 24]] as const) {
    b.box(2.4, 0.45, 0.6, bx, 0.22, bz, C.bench);
  }

  // Planters with small trees
  for (const [px, pz] of [[-25, 5], [25, 5], [-6, 28], [6, 28]] as const) {
    b.box(1.6, 0.8, 1.6, px, 0.4, pz, C.planter);
    const trunk = b.cyl(0.12, 0.16, 1.6, px, 1.6, pz, C.trunk, false);
    tagWeaponImpactSurface(trunk, "foliage");
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), mat(C.leaf, 0.9));
    leaf.position.set(px, 2.9, pz);
    leaf.castShadow = true;
    tagWeaponImpactSurface(leaf, "foliage");
    scene.add(leaf);
  }

  // Bike racks near gate
  for (let i = 0; i < 4; i++) {
    b.box(0.1, 0.8, 1.6, -14 + i * 1.2, 0.4, 29, C.bikeRack);
  }
}

function buildGateAndFence(b: B, scene: THREE.Scene, colliders: THREE.Box3[]): { gateIdx: number; gateMesh: THREE.Mesh | null } {
  // Perimeter fence (visual posts + rail, collision via thin boxes)
  const FY = 1.4;
  // South fence with gate gap x [-3, 3]
  b.box(42, FY, 0.3, -24, FY / 2, 32, C.metalFence);
  b.box(42, FY, 0.3, 24, FY / 2, 32, C.metalFence);
  // Other sides
  b.box(0.3, FY, 70, -47, FY / 2, 3, C.metalFence);
  b.box(0.3, FY, 70, 47, FY / 2, 3, C.metalFence);
  b.box(94, FY, 0.3, 0, FY / 2, -31, C.metalFence);
  b.box(94, FY, 0.3, 0, FY / 2, 38, C.metalFence);

  // Gate pillars
  b.box(0.8, 2.6, 0.8, -3.4, 1.3, 32, C.brickDark);
  b.box(0.8, 2.6, 0.8, 3.4, 1.3, 32, C.brickDark);
  // School sign above gate
  const sign = new THREE.Mesh(new THREE.BoxGeometry(7.5, 1, 0.3), mat(C.gateGreen, 0.8));
  sign.position.set(0, 3, 32);
  scene.add(sign);

  // The gate itself — removed when the ACTIVE phase starts
  const gateMesh = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 0.3), mat(C.gateGreen, 0.6, 0.4));
  gateMesh.position.set(0, 1.2, 32);
  gateMesh.castShadow = true;
  scene.add(gateMesh);
  const gateCollider = new THREE.Box3().setFromObject(gateMesh);
  colliders.push(gateCollider);
  const gateIdx = colliders.length - 1;

  return { gateIdx, gateMesh };
}
