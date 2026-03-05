import * as THREE from "three";
import { getMaterial, getCustomMaterial, getEmissiveMaterial, PALETTE } from "../materials/materialLibrary";
import { spawnClutterProps, MAP_SEED } from "../props/clutterSpawner";
import type { MapData } from "@catch-and-run/shared";

interface MapBuildResult {
  colliders: THREE.Box3[];
  gateColliderIndex: number;
  gateMesh: THREE.Mesh | null;
  ferrisWheel: THREE.Group | null;
}

export function buildOldHarborFortniteMap(scene: THREE.Scene, _mapData: MapData): MapBuildResult {
  const colliders: THREE.Box3[] = [];
  const B = new MapBoxHelper(scene, colliders);

  buildGround(B);
  buildWarehouseHall(B);
  buildContainerYard(B);
  buildHarborEdge(B, scene);
  buildConstructionZone(B);
  buildCatwalkNetwork(B);
  const { gateIdx: gateColliderIndex, gateMesh } = buildHunterSpawn(B);
  buildLandmark(B, scene);
  buildVegetation(scene, B);
  buildStreetLamps(B, scene);
  buildParkour(B);
  buildBackgroundVista(B, scene);

  buildParkourStructures(B, scene);
  buildBackyardHouse(B, scene);
  buildBackyardGarden(B, scene);

  const clutterColliders = spawnClutterProps(scene, MAP_SEED);
  colliders.push(...clutterColliders);

  const ferrisWheel = buildFerrisWheel(scene, colliders);

  return { colliders, gateColliderIndex, gateMesh, ferrisWheel };
}

class MapBoxHelper {
  constructor(private scene: THREE.Scene, private colliders: THREE.Box3[]) {}

  box(w: number, h: number, d: number, x: number, y: number, z: number, matKey: string, collide = true): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = getMaterial(matKey as any);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collide) this.colliders.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }

  colorBox(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rough = 0.8, metal = 0.05, collide = true): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = getCustomMaterial(color, rough, metal);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collide) this.colliders.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }

  cyl(rT: number, rB: number, h: number, x: number, y: number, z: number, matKey: string, collide = false): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(rT, rB, h, 12);
    const mesh = new THREE.Mesh(geo, getMaterial(matKey as any));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collide) this.colliders.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }

  addCollider(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
    this.colliders.push(new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ)));
  }
}

// ========== ZONE 1: GROUND ==========
function buildGround(B: MapBoxHelper) {
  // Grass
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(200, 160), getMaterial("grass"));
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.02;
  grass.receiveShadow = true;
  (B as any).scene.add(grass);

  // Warehouse concrete floor (with collider to prevent sinking)
  B.box(46, 0.2, 36, 0, 0.1, 0, "concreteFloor", false);
  B.addCollider(-23, 0, -18, 23, 0.22, 18);
  // Container yard asphalt
  B.box(32, 0.1, 30, 40, 0.04, -10, "asphalt", false);
  // Dock planks (with collider)
  B.box(70, 0.15, 8, 15, 0.07, 38, "dockWood", false);
  B.addCollider(-20, 0, 34, 50, 0.18, 42);
  // Construction zone ground
  B.box(20, 0.1, 20, -35, 0.04, -22, "concreteDark", false);
  // Backyard grass ground collider (prevents sinking in the yard area)
  B.addCollider(-56, -0.1, 18, -16, 0.05, 48);

  // ===== BOUNDARY WALLS (prevent leaving play area) =====
  // Map bounds: x from -55 to 63, z from -43 to 47
  const BW = 2.0, BH = 8; // Thicker walls, taller to prevent any escape
  const MAP_MIN_X = -55, MAP_MAX_X = 63;
  const MAP_MIN_Z = -43, MAP_MAX_Z = 47;
  const MAP_WIDTH = MAP_MAX_X - MAP_MIN_X;
  const MAP_DEPTH = MAP_MAX_Z - MAP_MIN_Z;
  const MAP_CENTER_X = (MAP_MIN_X + MAP_MAX_X) / 2;
  const MAP_CENTER_Z = (MAP_MIN_Z + MAP_MAX_Z) / 2;

  // North wall (z = MAP_MIN_Z)
  B.colorBox(MAP_WIDTH + BW * 2, BH, BW, MAP_CENTER_X, BH / 2, MAP_MIN_Z - BW / 2, PALETTE.concreteDark, 0.9, 0.03, true);
  // South wall (z = MAP_MAX_Z)
  B.colorBox(MAP_WIDTH + BW * 2, BH, BW, MAP_CENTER_X, BH / 2, MAP_MAX_Z + BW / 2, PALETTE.concreteDark, 0.9, 0.03, true);
  // West wall (x = MAP_MIN_X)
  B.colorBox(BW, BH, MAP_DEPTH + BW * 2, MAP_MIN_X - BW / 2, BH / 2, MAP_CENTER_Z, PALETTE.concreteDark, 0.9, 0.03, true);
  // East wall (x = MAP_MAX_X)
  B.colorBox(BW, BH, MAP_DEPTH + BW * 2, MAP_MAX_X + BW / 2, BH / 2, MAP_CENTER_Z, PALETTE.concreteDark, 0.9, 0.03, true);

  // Visual fence on top of boundary walls
  const fenceH = 2.0;
  const postSpacing = 4;
  // North & South fence posts
  for (let x = MAP_MIN_X; x <= MAP_MAX_X; x += postSpacing) {
    B.colorBox(0.08, fenceH, 0.08, x, BH + fenceH / 2, MAP_MIN_Z, PALETTE.steel, 0.5, 0.5, false);
    B.colorBox(0.08, fenceH, 0.08, x, BH + fenceH / 2, MAP_MAX_Z, PALETTE.steel, 0.5, 0.5, false);
  }
  // East & West fence posts
  for (let z = MAP_MIN_Z; z <= MAP_MAX_Z; z += postSpacing) {
    B.colorBox(0.08, fenceH, 0.08, MAP_MIN_X, BH + fenceH / 2, z, PALETTE.steel, 0.5, 0.5, false);
    B.colorBox(0.08, fenceH, 0.08, MAP_MAX_X, BH + fenceH / 2, z, PALETTE.steel, 0.5, 0.5, false);
  }

  // Fence rails - all 4 sides (upper and lower)
  B.colorBox(MAP_WIDTH, 0.06, 0.06, MAP_CENTER_X, BH + fenceH * 0.8, MAP_MIN_Z, PALETTE.steel, 0.5, 0.5, false);
  B.colorBox(MAP_WIDTH, 0.06, 0.06, MAP_CENTER_X, BH + fenceH * 0.8, MAP_MAX_Z, PALETTE.steel, 0.5, 0.5, false);
  B.colorBox(0.06, 0.06, MAP_DEPTH, MAP_MIN_X, BH + fenceH * 0.8, MAP_CENTER_Z, PALETTE.steel, 0.5, 0.5, false);
  B.colorBox(0.06, 0.06, MAP_DEPTH, MAP_MAX_X, BH + fenceH * 0.8, MAP_CENTER_Z, PALETTE.steel, 0.5, 0.5, false);
  B.colorBox(MAP_WIDTH, 0.06, 0.06, MAP_CENTER_X, BH + fenceH * 0.3, MAP_MIN_Z, PALETTE.steel, 0.5, 0.5, false);
  B.colorBox(MAP_WIDTH, 0.06, 0.06, MAP_CENTER_X, BH + fenceH * 0.3, MAP_MAX_Z, PALETTE.steel, 0.5, 0.5, false);
  B.colorBox(0.06, 0.06, MAP_DEPTH, MAP_MIN_X, BH + fenceH * 0.3, MAP_CENTER_Z, PALETTE.steel, 0.5, 0.5, false);
  B.colorBox(0.06, 0.06, MAP_DEPTH, MAP_MAX_X, BH + fenceH * 0.3, MAP_CENTER_Z, PALETTE.steel, 0.5, 0.5, false);

  // Fence top colliders to prevent jumping over (all 4 sides) - extended to be thicker
  B.addCollider(MAP_MIN_X - BW, BH, MAP_MIN_Z - BW, MAP_MAX_X + BW, BH + fenceH + 2, MAP_MIN_Z + BW);
  B.addCollider(MAP_MIN_X - BW, BH, MAP_MAX_Z - BW, MAP_MAX_X + BW, BH + fenceH + 2, MAP_MAX_Z + BW);
  B.addCollider(MAP_MIN_X - BW, BH, MAP_MIN_Z - BW, MAP_MIN_X + BW, BH + fenceH + 2, MAP_MAX_Z + BW);
  B.addCollider(MAP_MAX_X - BW, BH, MAP_MIN_Z - BW, MAP_MAX_X + BW, BH + fenceH + 2, MAP_MAX_Z + BW);
}

// ========== ZONE 2: WAREHOUSE HALL ==========
function buildWarehouseHall(B: MapBoxHelper) {
  const W = 46, H = 8, D = 36;

  // Walls with door openings
  B.box(W, H, 2.0, 0, H / 2, -D / 2, "concrete");           // back (extra thick to prevent clipping)
  B.box(14, H, 0.6, -16, H / 2, D / 2, "concrete");         // front-left
  B.box(14, H, 0.6, 16, H / 2, D / 2, "concrete");          // front-right
  B.box(18, 2.5, 0.6, 0, H - 1.25, D / 2, "concrete");      // front-top beam
  B.box(0.35, H, D, -W / 2, H / 2, 0, "concrete");          // left
  B.box(0.35, H, 12, W / 2, H / 2, -12, "concrete");        // right-top
  B.box(0.35, H, 8, W / 2, H / 2, 14, "concrete");          // right-bottom
  B.box(0.35, 2.5, 16, W / 2, H - 1.25, 2, "concrete");     // right beam
  // Back wall: very thick collider (3 units deep) so physics can never skip through
  B.addCollider(-W / 2, 0, -D / 2 - 2.0, W / 2, H + 2, -D / 2 + 1.0);
  // Front wall colliders (left and right of door opening)
  B.addCollider(-W / 2, 0, D / 2 - 0.5, -9, H, D / 2 + 0.5);
  B.addCollider(9, 0, D / 2 - 0.5, W / 2, H, D / 2 + 0.5);


  // Roof panels (visual only - no individual collision to avoid gap issues)
  for (let i = 0; i < 5; i++) {
    const rz = -D / 2 + 4 + i * (D / 5);
    const shade = i % 2 === 0 ? 0x7a7570 : 0x888380;
    B.colorBox(W + 1, 0.15, D / 5 + 0.5, 0, H + 0.08, rz, shade, 0.55, 0.35, false);
  }
  // ONE solid roof collider - thin slab at exactly roof height
  // min.y = H so players stand on top at feetY=H; max.y = H+0.2 thin
  B.addCollider(-W / 2 - 0.5, H, -D / 2 - 0.5, W / 2 + 0.5, H + 0.2, D / 2 + 0.5);

  // Steel I-beams
  for (let i = 0; i < 4; i++) {
    const bz = -12 + i * 8;
    B.box(W - 2, 0.25, 0.4, 0, H - 0.4, bz, "steel", false);
    B.box(0.15, H, 0.15, -W / 2 + 1.5, H / 2, bz, "steel", false);
    B.box(0.15, H, 0.15, W / 2 - 1.5, H / 2, bz, "steel", false);
  }

  // Shelving racks (2 rows, 3 per row)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      buildShelfRack(B, -12 + col * 8, -8 + row * 12);
    }
  }

  // Crate stacks
  B.box(1.2, 1.2, 1.2, -18, 0.6, -14, "wood");
  B.box(1.2, 1.2, 1.2, -16.7, 0.6, -14, "woodDark");
  B.box(1.0, 1.0, 1.0, -17.3, 1.8, -14, "woodOld");
  B.box(0.8, 0.8, 0.8, 18, 0.4, 8, "wood");
  B.box(1.2, 1.2, 1.2, -18, 0.6, 10, "woodDark");

  // Tarp-covered pile
  B.colorBox(2.5, 1.2, 1.8, -8, 0.6, -14, PALETTE.tarpBlue, 0.92, 0, true);

  // Cardboard boxes (hiding spot)
  const cb = 0xc4953d;
  B.colorBox(0.7, 0.5, 0.5, 8, 0.25, -14, cb, 0.9, 0, false);
  B.colorBox(0.7, 0.5, 0.5, 8.8, 0.25, -14, cb, 0.9, 0, false);
  B.colorBox(0.6, 0.5, 0.5, 8.4, 0.75, -14, cb, 0.9, 0, false);

  // Hanging light fixtures
  const fixtureMat = getMaterial("steelDark");
  const bulbMat = getEmissiveMaterial(0xffffdd, 0xffeeaa, 0.8);
  const positions = [[-8, 7, -5], [5, 7, -5], [-8, 7, 7], [5, 7, 7], [0, 7, 0]];
  for (const [fx, fy, fz] of positions) {
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.3), fixtureMat);
    fixture.position.set(fx, fy, fz);
    (B as any).scene.add(fixture);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 4), fixtureMat);
    wire.position.set(fx, fy + 0.5, fz);
    (B as any).scene.add(wire);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), bulbMat);
    bulb.position.set(fx, fy - 0.06, fz);
    (B as any).scene.add(bulb);
  }
}

function buildShelfRack(B: MapBoxHelper, x: number, z: number) {
  // Vertical posts (visual)
  B.colorBox(0.08, 3.8, 0.08, x - 0.9, 1.9, z - 0.55, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(0.08, 3.8, 0.08, x + 0.9, 1.9, z - 0.55, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(0.08, 3.8, 0.08, x - 0.9, 1.9, z + 0.55, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(0.08, 3.8, 0.08, x + 0.9, 1.9, z + 0.55, PALETTE.steelDark, 0.5, 0.5, false);
  // Front/back face colliders (block passage through the rack)
  B.addCollider(x - 1.0, 0, z - 0.65, x + 1.0, 0.45, z - 0.45);
  B.addCollider(x - 1.0, 0, z + 0.45, x + 1.0, 0.45, z + 0.65);
  // Shelf 1 (walkable)
  B.box(2.0, 0.1, 1.2, x, 1.3, z, "wood", false);
  B.addCollider(x - 1.0, 1.24, z - 0.6, x + 1.0, 1.36, z + 0.6);
  // Shelf 2 (walkable)
  B.box(2.0, 0.1, 1.2, x, 2.6, z, "wood", false);
  B.addCollider(x - 1.0, 2.54, z - 0.6, x + 1.0, 2.66, z + 0.6);
  // Top bar (walkable)
  B.colorBox(2.0, 0.1, 1.2, x, 3.8, z, PALETTE.steelDark, 0.5, 0.5, false);
  B.addCollider(x - 1.0, 3.74, z - 0.6, x + 1.0, 3.86, z + 0.6);
  // Cross braces (with blocking colliders)
  B.colorBox(2.0, 0.08, 0.08, x, 0.5, z - 0.55, PALETTE.steelDark, 0.5, 0.5, false);
  B.addCollider(x - 1.0, 0.45, z - 0.65, x + 1.0, 0.58, z - 0.45);
  B.colorBox(2.0, 0.08, 0.08, x, 0.5, z + 0.55, PALETTE.steelDark, 0.5, 0.5, false);
  B.addCollider(x - 1.0, 0.45, z + 0.45, x + 1.0, 0.58, z + 0.65);
}

// ========== ZONE 3: CONTAINER YARD ==========
function buildContainerYard(B: MapBoxHelper) {
  buildContainer(B, 38, 0, -8, PALETTE.containerRed, 0);
  buildContainer(B, 38, 0, -12.5, PALETTE.containerBlue, 0);
  buildContainer(B, 40, 2.6, -8, PALETTE.containerGreen, 0);
  buildContainer(B, 46, 0, -3, PALETTE.containerYlow, Math.PI / 2);
  buildContainer(B, 32, 0, -18, PALETTE.containerRed, 0.15);

  // Metal staircase up to stacked container top
  const csH = 5.1;
  const csSteps = 14;
  const csRise = csH / csSteps;
  const csRun = 0.5;
  const csStartX = 32;
  const csZ = -8;
  for (let i = 0; i < csSteps; i++) {
    const sx = csStartX + i * csRun + csRun / 2;
    const sy = csRise * (i + 1);
    B.colorBox(1.6, 0.06, csRun - 0.04, sx, sy, csZ, PALETTE.steel, 0.5, 0.5, false);
    B.addCollider(sx - 0.8, sy - 0.06, csZ - 0.8, sx + 0.8, sy, csZ + 0.8);
  }
  // Platform on top of stacked container
  B.addCollider(36.9, 5.1, -10.2, 43.1, 5.2, -5.8);

  // Fence - extended to cover full yard boundary
  for (let i = 0; i < 14; i++) {
    B.colorBox(0.06, 2.2, 0.06, 22 + i * 2.8, 1.1, 2, PALETTE.steel, 0.5, 0.5, false);
  }
  B.colorBox(38, 0.05, 0.05, 41, 2.0, 2, PALETTE.steel, 0.5, 0.5, false);
  B.colorBox(38, 0.05, 0.05, 41, 1.1, 2, PALETTE.steel, 0.5, 0.5, false);
  B.colorBox(38, 0.05, 0.05, 41, 0.4, 2, PALETTE.steel, 0.5, 0.5, false);
  // Full fence collider from warehouse edge to east boundary
  B.addCollider(22, 0, 1.5, 58, 2.5, 2.5);
}

function buildContainer(B: MapBoxHelper, x: number, y: number, z: number, color: number, rotY: number) {
  const g = new THREE.Group();
  const bodyMat = getCustomMaterial(color, 0.65, 0.2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.5, 2.4), bodyMat);
  body.position.y = 1.25;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const darker = new THREE.Color(color).multiplyScalar(0.75).getHex();
  for (let i = 0; i < 8; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.3, 2.42), getCustomMaterial(darker, 0.6, 0.3));
    line.position.set(-2.7 + i * 0.77, 1.25, 0);
    g.add(line);
  }

  const frameMat = getCustomMaterial(PALETTE.steelDark, 0.5, 0.5);
  const top = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.08, 2.5), frameMat);
  top.position.y = 2.52;
  g.add(top);
  const bot = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.08, 2.5), frameMat);
  bot.position.y = 0.04;
  g.add(bot);

  g.position.set(x, y, z);
  g.rotation.y = rotY;
  (B as any).scene.add(g);

  const cm = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.5, 2.4));
  cm.position.set(x, y + 1.25, z);
  cm.rotation.y = rotY;
  cm.updateMatrixWorld();
  (B as any).colliders.push(new THREE.Box3().setFromObject(cm));
}

// ========== ZONE 4: HARBOR EDGE ==========
function buildHarborEdge(B: MapBoxHelper, scene: THREE.Scene) {
  // Dock edge
  B.box(70, 0.5, 0.4, 15, 0.25, 42, "concreteDark");

  // Bollards
  for (let i = 0; i < 8; i++) {
    B.cyl(0.12, 0.16, 0.7, -12 + i * 8, 0.35, 39, "accentYellow");
  }

  // Water
  const waterMat = new THREE.MeshStandardMaterial({
    color: PALETTE.water, roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.82,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(100, 40), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(15, -0.4, 62);
  water.receiveShadow = true;
  scene.add(water);

  // Rope coils, buoys
  B.cyl(0.25, 0.25, 0.15, 5, 0.15, 39, "rope");
  B.cyl(0.25, 0.25, 0.15, 30, 0.15, 39, "rope");

  // Anchor
  B.colorBox(0.6, 0.8, 0.15, 15, 0.4, 39, PALETTE.steelDark, 0.5, 0.5, false);
}

// ========== ZONE 5: CONSTRUCTION ZONE ==========
function buildConstructionZone(B: MapBoxHelper) {
  const cx = -35, cz = -22;

  // Scaffolding towers
  for (let i = 0; i < 2; i++) {
    const sx = cx - 5 + i * 10;
    // Uprights
    B.cyl(0.04, 0.04, 5, sx - 1, 2.5, cz - 3, "scaffold");
    B.cyl(0.04, 0.04, 5, sx + 1, 2.5, cz - 3, "scaffold");
    B.cyl(0.04, 0.04, 5, sx - 1, 2.5, cz + 3, "scaffold");
    B.cyl(0.04, 0.04, 5, sx + 1, 2.5, cz + 3, "scaffold");
    // Platforms
    B.box(2.5, 0.08, 6.5, sx, 2.5, cz, "woodPlank", true);
    B.box(2.5, 0.08, 6.5, sx, 4.5, cz, "woodPlank", true);
    // Cross braces
    B.colorBox(3.0, 0.04, 0.04, sx, 1.5, cz - 3, PALETTE.scaffoldYellow, 0.6, 0.3, false);
    B.colorBox(3.0, 0.04, 0.04, sx, 3.5, cz + 3, PALETTE.scaffoldYellow, 0.6, 0.3, false);
  }

  // Cement bag pile
  for (let i = 0; i < 4; i++) {
    B.box(0.6, 0.25, 0.4, cx + 3 + (i % 2) * 0.7, 0.13 + Math.floor(i / 2) * 0.25, cz + 5, "cement", false);
  }

  // Rebar bundle
  for (let i = 0; i < 5; i++) {
    B.cyl(0.02, 0.02, 3, cx + 6 + i * 0.06, 0.1, cz - 5, "steelDark");
  }

  // Tarp cover
  B.colorBox(3, 0.8, 2, cx, 0.4, cz + 8, PALETTE.tarpGreen, 0.92, 0, true);

  // Warning tape stripes (hazard)
  B.colorBox(0.3, 0.8, 0.04, cx - 6, 0.4, cz - 8, PALETTE.accentYellow, 0.7, 0.1, false);
  B.colorBox(0.3, 0.8, 0.04, cx + 6, 0.4, cz - 8, PALETTE.accentYellow, 0.7, 0.1, false);
  B.colorBox(12, 0.04, 0.04, cx, 0.8, cz - 8, PALETTE.accentYellow, 0.7, 0.1, false);
}

// ========== ZONE 6: CATWALK NETWORK ==========
function buildCatwalkNetwork(B: MapBoxHelper) {
  // Main catwalk along warehouse back wall at height 4m
  B.box(30, 0.1, 1.8, 0, 4.0, -16.5, "steel", true);
  // Railing (with collider strips to prevent falling off)
  B.colorBox(30, 0.05, 0.05, 0, 4.9, -17.3, PALETTE.steelLight, 0.5, 0.5, false);
  B.colorBox(30, 0.05, 0.05, 0, 4.9, -15.7, PALETTE.steelLight, 0.5, 0.5, false);
  // Back-side railing: tall collider fills gap between catwalk and back wall (prevents jumping over)
  B.addCollider(-15, 4.0, -18.5, 15, 8.0, -17.1);
  B.addCollider(-15, 4.0, -15.9, 15, 5.5, -15.5);
  for (let i = 0; i < 10; i++) {
    B.colorBox(0.04, 0.9, 0.04, -14 + i * 3, 4.5, -17.3, PALETTE.steelLight, 0.5, 0.5, false);
  }

  // Hazard stripes on catwalk edge
  B.colorBox(30, 0.02, 0.15, 0, 4.06, -15.7, PALETTE.accentYellow, 0.7, 0.1, false);
  B.colorBox(30, 0.02, 0.15, 0, 4.06, -17.3, PALETTE.accentYellow, 0.7, 0.1, false);

  // Access ladder (left side) -- step colliders for climbing
  for (let i = 0; i < 10; i++) {
    const ladY = i * 0.4;
    B.colorBox(0.5, 0.04, 0.04, -14, ladY + 0.2, -16.5, PALETTE.steelLight, 0.5, 0.5, false);
    B.addCollider(-14.3, ladY, -16.8, -13.7, ladY + 0.4, -16.2);
  }
  B.colorBox(0.04, 4.0, 0.04, -14.2, 2.0, -16.3, PALETTE.steelLight, 0.5, 0.5, false);
  B.colorBox(0.04, 4.0, 0.04, -13.8, 2.0, -16.7, PALETTE.steelLight, 0.5, 0.5, false);

  // Office staircase (wide wooden deck stairs)
  buildStairs(B, 26, 6, 3.2);
}

function buildStairs(B: MapBoxHelper, ox: number, oz: number, oy: number) {
  // ===== PARKOUR PLATFORM STAIRCASE (Office removed) =====
  // 3 large platforms in zigzag pattern -- simple, no getting stuck
  const platW = 5.0;
  const platD = 3.0;
  const baseZ = oz - 6;

  // Platform 1: ground level to 1m
  const p1y = oy * 0.33;
  B.box(platW, 0.2, platD, ox - 6, p1y, baseZ, "woodPlank", true);
  // Railing visual
  B.colorBox(platW, 0.06, 0.06, ox - 6, p1y + 0.9, baseZ - platD / 2, PALETTE.steelLight, 0.5, 0.5, false);
  // Support legs
  B.colorBox(0.15, p1y, 0.15, ox - 8, p1y / 2, baseZ - 1, PALETTE.woodDark, 0.85, 0.02, false);
  B.colorBox(0.15, p1y, 0.15, ox - 4, p1y / 2, baseZ + 1, PALETTE.woodDark, 0.85, 0.02, false);
  // Hazard edge stripe
  B.colorBox(platW, 0.03, 0.15, ox - 6, p1y + 0.11, baseZ + platD / 2, PALETTE.accentYellow, 0.7, 0.1, false);

  // Platform 2: mid height
  const p2y = oy * 0.66;
  B.box(platW, 0.2, platD, ox - 2, p2y, baseZ + 1, "woodPlank", true);
  B.colorBox(platW, 0.06, 0.06, ox - 2, p2y + 0.9, baseZ + 1 - platD / 2, PALETTE.steelLight, 0.5, 0.5, false);
  B.colorBox(0.15, p2y, 0.15, ox - 4, p2y / 2, baseZ, PALETTE.woodDark, 0.85, 0.02, false);
  B.colorBox(0.15, p2y, 0.15, ox, p2y / 2, baseZ + 2, PALETTE.woodDark, 0.85, 0.02, false);
  B.colorBox(platW, 0.03, 0.15, ox - 2, p2y + 0.11, baseZ + 1 + platD / 2, PALETTE.accentYellow, 0.7, 0.1, false);

  // Platform 3: landing level (connects to office floor)
  B.box(platW, 0.2, platD + 1, ox + 2, oy - 0.1, baseZ + 2, "woodPlank", true);
  B.colorBox(platW, 0.06, 0.06, ox + 2, oy + 0.8, baseZ + 2 - platD / 2, PALETTE.steelLight, 0.5, 0.5, false);
  B.colorBox(0.15, oy, 0.15, ox, oy / 2, baseZ + 1, PALETTE.woodDark, 0.85, 0.02, false);
  B.colorBox(0.15, oy, 0.15, ox + 4, oy / 2, baseZ + 3, PALETTE.woodDark, 0.85, 0.02, false);

  // Visual connecting ramps between platforms (no collider, just decoration)
  const ramp1 = B.colorBox(3.5, 0.1, 1.5, ox - 4, (p1y + p2y) / 2, baseZ, PALETTE.woodWarm, 0.82, 0.02, false);
  ramp1.rotation.z = -Math.atan2(p2y - p1y, 4);
  const ramp2 = B.colorBox(3.5, 0.1, 1.5, ox, (p2y + oy) / 2, baseZ + 1.5, PALETTE.woodWarm, 0.82, 0.02, false);
  ramp2.rotation.z = -Math.atan2(oy - p2y, 4);
}

// ========== HUNTER SPAWN ==========
function buildHunterSpawn(B: MapBoxHelper): { gateIdx: number; gateMesh: THREE.Mesh | null } {
  const JAIL_H = 5.0;
  const JAIL_Y = JAIL_H / 2;

  B.box(14, 0.1, 14, -42, 0.05, 0, "concreteFloor", true);
  B.box(14, JAIL_H, 0.25, -42, JAIL_Y, -7, "concreteDark");
  B.box(14, JAIL_H, 0.25, -42, JAIL_Y, 7, "concreteDark");
  B.colorBox(0.25, JAIL_H, 14, -49, JAIL_Y, 0, PALETTE.concreteDark, 0.9, 0.03, true);

  // Roof - thick and covers entire jail area including gate edge
  B.colorBox(15, 0.4, 15, -42, JAIL_H + 0.2, 0, PALETTE.concreteDark, 0.9, 0.03, true);

  // Gate (WITH collider during hide phase -- removed during active)
  const gateMesh = B.colorBox(0.25, JAIL_H, 14, -35, JAIL_Y, 0, PALETTE.accentOrange, 0.7, 0.2, true);
  const gateIdx = (B as any).colliders.length - 1;

  B.colorBox(0.3, 0.3, 14.5, -35, JAIL_H + 0.15, 0, PALETTE.steelDark, 0.5, 0.5, false);

  // Interior props
  B.colorBox(0.8, 0.5, 0.5, -45, 0.25, -4, 0x4a5a2a, 0.85, 0.02, true);
  B.colorBox(0.8, 0.5, 0.5, -45, 0.25, 4, 0x4a5a2a, 0.85, 0.02, true);
  B.box(2.0, 0.35, 0.5, -46, 0.175, 0, "woodOld", true);

  return { gateIdx, gateMesh };
}

// ========== LANDMARK ==========
function buildLandmark(B: MapBoxHelper, scene: THREE.Scene) {
  // Crane silhouette
  const craneMat = getCustomMaterial(PALETTE.steelDark, 0.6, 0.4);
  [
    [0.8, 28, 0.8, 72, 14, -25],
    [22, 0.6, 0.8, 72, 27, -25],
    [0.5, 6, 0.5, 60, 24, -25],
    [0.3, 10, 0.3, 80, 22, -25],
  ].forEach(([w, h, d, x, y, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), craneMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    scene.add(m);
  });

  // "OLD HARBOR" sign on warehouse facade
  B.colorBox(8, 1.2, 0.12, 0, 7.0, 18.3, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(7.5, 0.8, 0.06, 0, 7.0, 18.4, PALETTE.offWhite, 0.8, 0.02, false);
}

// ========== VEGETATION ==========
function buildVegetation(scene: THREE.Scene, B: MapBoxHelper) {
  const leafMats = [
    getCustomMaterial(0x3a7a2a, 0.85, 0),
    getCustomMaterial(0x4a8a3a, 0.85, 0),
    getCustomMaterial(0x558a2e, 0.85, 0),
  ];
  const trunkMat = getCustomMaterial(0x5a3a1a, 0.9, 0);

  // All trees positioned INSIDE map bounds (x: -55..63, z: -43..47)
  // Removed [-58, -8] (outside boundary) -> moved to [-51, -8]
  const trees = [
    [-30, 15], [-25, 22], [-38, -28], [52, 22], [55, 15],
    [-50, 18], [-46, 28], [50, -28], [-51, -8], [55, -3],
    [-20, 28], [30, 28], [45, 28],
  ];

  for (const [tx, tz] of trees) {
    const h = 4 + Math.sin(tx * 13.37) * 2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 8), trunkMat);
    trunk.position.set(tx, h / 2, tz);
    trunk.castShadow = true;
    scene.add(trunk);

    // Short trunk collider (waist-height only) -- prevents walking through but allows shooting over
    B.addCollider(tx - 0.25, 0, tz - 0.25, tx + 0.25, 1.5, tz + 0.25);

    const crownR = 1.8 + Math.sin(tz * 7.13) * 0.6;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(crownR, 8, 6), leafMats[Math.abs(Math.floor(tx)) % 3]);
    crown.position.set(tx, h + crownR * 0.35, tz);
    crown.scale.y = 0.65 + Math.abs(Math.sin(tx * 3.7)) * 0.3;
    crown.castShadow = true;
    scene.add(crown);
  }

  // Bushes
  const bushMat = getCustomMaterial(0x3a6a2a, 0.9, 0);
  const bushes = [[-22, 18], [22, 20], [-15, 22], [0, 22], [45, 6], [-42, 12], [-42, -12], [32, 28], [-20, -25]];
  for (const [bx, bz] of bushes) {
    const s = 0.5 + Math.abs(Math.sin(bx * bz * 0.1)) * 0.7;
    const bush = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), bushMat);
    bush.position.set(bx, s * 0.45, bz);
    bush.scale.y = 0.6;
    bush.castShadow = true;
    scene.add(bush);
  }

  // Rocks
  const rockMat = getCustomMaterial(0x7a7a72, 0.92, 0.03);
  const rockPositions = [
    [-32, 22], [-38, -18], [50, 10], [55, -15], [-48, 12],
    [42, 22], [-25, -30], [48, -22], [-52, -8], [35, 30],
    [-30, -10], [52, 5], [30, -20], [-20, 30],
  ];
  for (const [rx, rz] of rockPositions) {
    const s = 0.2 + Math.abs(Math.sin(rx * 7 + rz * 3)) * 0.5;
    const geo = Math.abs(rx) % 2 === 0
      ? new THREE.DodecahedronGeometry(s, 0)
      : new THREE.IcosahedronGeometry(s, 0);
    const rock = new THREE.Mesh(geo, rockMat);
    rock.position.set(rx, s * 0.35, rz);
    rock.rotation.set(rx * 0.3, rz * 0.5, rx * 0.2);
    rock.scale.y = 0.4 + Math.abs(Math.sin(rx)) * 0.4;
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }

  // Tall grass clusters
  const grassMat2 = getCustomMaterial(0x4a7a28, 0.95, 0);
  const grassClusters = [
    [-30, 25], [-35, 18], [48, 15], [52, -10], [-50, -5],
    [45, 25], [-45, 20], [55, -20], [-38, -15], [30, 28],
  ];
  for (const [gx, gz] of grassClusters) {
    for (let j = 0; j < 6; j++) {
      const ox = gx + (Math.sin(j * 17 + gx) * 1.5);
      const oz = gz + (Math.cos(j * 13 + gz) * 1.5);
      const h = 0.3 + Math.abs(Math.sin(j * 7)) * 0.3;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05 + j * 0.008, h, 4), grassMat2);
      blade.position.set(ox, h / 2, oz);
      blade.rotation.y = j * 1.2;
      scene.add(blade);
    }
  }

  // Flower patches near bushes
  const flowerColors = [0xff88aa, 0xcc66ff, 0xffffff, 0xffcc66];
  for (const [bx, bz] of bushes) {
    for (let f = 0; f < 3; f++) {
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 4, 4),
        getCustomMaterial(flowerColors[f % flowerColors.length], 0.8, 0)
      );
      flower.position.set(bx + Math.sin(f * 2) * 0.8, 0.15, bz + Math.cos(f * 2) * 0.8);
      scene.add(flower);
    }
  }
}

// ========== STREET LAMPS ==========
function buildStreetLamps(B: MapBoxHelper, scene: THREE.Scene) {
  const lampPositions: [number, number][] = [
    [-25, 32], [0, 32], [25, 32], [52, 0], [-32, -15], [50, -20],
    [-40, 20], [-15, 20], [10, 20], [35, 20],
    [-50, 0], [-35, 0], [0, 0], [20, 0],
    [-45, -25], [-20, -30], [10, -25], [40, -30],
    [-50, 38], [-30, 42], [50, 30],
    [-10, 42], [30, 42],
    [55, -10], [-55, 10],
  ];
  for (const [lx, lz] of lampPositions) {
    B.cyl(0.06, 0.08, 5, lx, 2.5, lz, "steelDark");
    B.colorBox(1.0, 0.06, 0.06, lx + 0.5, 5, lz, PALETTE.steelDark, 0.5, 0.5, false);
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.25),
      getEmissiveMaterial(0xffffdd, 0xffeeaa, 0.5)
    );
    lamp.position.set(lx + 1.0, 4.92, lz);
    scene.add(lamp);
  }
}

// ========== BACKGROUND VISTA ==========
// ========== PARKOUR PLATFORMS ==========
function buildParkour(B: MapBoxHelper) {
  const ROOF_Y = 8.0; // Warehouse roof height

  // ===== WAREHOUSE ROOFTOP ACCESS =====
  // Fire-escape staircase on the WEST SIDE of warehouse (outside left wall at x=-23)
  // Steps go SOUTH (z increasing from -13 toward +15) while rising from 0 to 8m
  // stepH=0.4 (≤ STEP_UP=0.5) so players can walk up without jumping
  const stairX = -26;
  const stairW = 3.0;
  const stepH = 0.4;
  const stepDZ = 1.4;        // z advance per step
  const stairStartZ = -13;
  const numSteps = 21;       // 21 × 0.4 = 8.4m → clears roof at 8m

  // Walkable step boxes
  // Physics: body check starts at feetY+STEP_UP, so steps ≤ 0.5m tall are automatically
  // climbed by findGround without horizontal blocking.
  for (let i = 0; i < numSteps; i++) {
    const boxH = stepH;
    const centerY = i * stepH + boxH / 2;
    const centerZ = stairStartZ + i * stepDZ + stepDZ / 2;
    B.colorBox(stairW, boxH, stepDZ, stairX, centerY, centerZ, PALETTE.steel, 0.5, 0.5, true);
  }

  // Top landing bridge: connects staircase top to warehouse roof (x=-23)
  // Landing spans from stairX-1.5 (=-27.5) to x=-21 to overlap with roof collider
  const landingZ = stairStartZ + (numSteps - 1) * stepDZ + stepDZ / 2;
  B.colorBox(7, 0.2, stepDZ + 0.5, stairX + 2, ROOF_Y + 0.15, landingZ, PALETTE.steel, 0.5, 0.5, true);

  // Railing posts every 4 steps
  for (let i = 0; i < numSteps; i += 4) {
    const postY = (i + 1) * stepH + 0.5;
    const postZ = stairStartZ + i * stepDZ;
    B.colorBox(0.05, 1.0, 0.05, stairX - stairW / 2, postY, postZ, PALETTE.steelLight, 0.5, 0.5, false);
  }

  // ===== EAST SIDE FIRE-ESCAPE STAIRCASE (right wall, x=26) =====
  const stairX2 = 26;
  const stairStartZ2 = 15;
  const numSteps2 = 21;

  for (let i = 0; i < numSteps2; i++) {
    const boxH2 = stepH;
    const centerY2 = i * stepH + boxH2 / 2;
    const centerZ2 = stairStartZ2 - i * stepDZ - stepDZ / 2;
    B.colorBox(stairW, boxH2, stepDZ, stairX2, centerY2, centerZ2, PALETTE.steel, 0.5, 0.5, true);
  }

  const landingZ2 = stairStartZ2 - (numSteps2 - 1) * stepDZ - stepDZ / 2;
  B.colorBox(7, 0.2, stepDZ + 0.5, stairX2 - 2, ROOF_Y + 0.15, landingZ2, PALETTE.steel, 0.5, 0.5, true);

  for (let i = 0; i < numSteps2; i += 4) {
    const postY2 = (i + 1) * stepH + 0.5;
    const postZ2 = stairStartZ2 - i * stepDZ;
    B.colorBox(0.05, 1.0, 0.05, stairX2 + stairW / 2, postY2, postZ2, PALETTE.steelLight, 0.5, 0.5, false);
  }

  // ===== ROOFTOP OBSTACLES & DETAILS =====
  // Air conditioning units on warehouse roof
  B.colorBox(2, 1.2, 1.5, -10, ROOF_Y + 0.75, -5, PALETTE.steelLight, 0.6, 0.3, true);
  B.colorBox(2, 1.2, 1.5, 5, ROOF_Y + 0.75, 5, PALETTE.steelLight, 0.6, 0.3, true);
  B.colorBox(1.5, 0.8, 1, 15, ROOF_Y + 0.55, 10, PALETTE.steelLight, 0.6, 0.3, true);
  // Skylight frames
  B.colorBox(3, 0.25, 3, 0, ROOF_Y + 0.2, -8, 0x88bbdd, 0.1, 0.4, true);
  // Roof edge safety railings (visual only)
  B.colorBox(46, 0.06, 0.06, 0, ROOF_Y + 1.0, -17.5, PALETTE.steelLight, 0.5, 0.5, false);
  B.colorBox(46, 0.06, 0.06, 0, ROOF_Y + 1.0, 17.5, PALETTE.steelLight, 0.5, 0.5, false);
  B.colorBox(0.06, 0.06, 36, -23, ROOF_Y + 1.0, 0, PALETTE.steelLight, 0.5, 0.5, false);
  B.colorBox(0.06, 0.06, 36, 23, ROOF_Y + 1.0, 0, PALETTE.steelLight, 0.5, 0.5, false);

  // ===== CONTAINER YARD JUMP COURSE =====
  B.colorBox(3, 0.2, 2, 30, 1.5, -2, PALETTE.accentYellow, 0.7, 0.1, true);
  B.colorBox(2.5, 0.2, 2, 34, 2.8, 0, PALETTE.accentYellow, 0.7, 0.1, true);
  B.colorBox(2, 0.2, 2, 38, 4.0, -2, PALETTE.accentYellow, 0.7, 0.1, true);
  B.colorBox(3, 0.03, 0.15, 30, 1.62, -1, PALETTE.hazardStripe, 0.8, 0.05, false);
  B.colorBox(2.5, 0.03, 0.15, 34, 2.92, 1, PALETTE.hazardStripe, 0.8, 0.05, false);

  // ===== HARBOR DOCK PLATFORMS =====
  B.box(2, 0.2, 2, 0, 1.0, 30, "dockWood", true);
  B.box(1.8, 0.2, 1.8, 5, 2.0, 32, "dockWood", true);
  B.box(1.5, 0.2, 1.5, 10, 3.0, 30, "dockWood", true);

  // ===== CONSTRUCTION ZONE PLATFORMS =====
  B.colorBox(3, 0.15, 3, -38, 1.8, -28, PALETTE.scaffoldYellow, 0.6, 0.3, true);
  B.colorBox(2, 0.15, 2, -34, 3.2, -30, PALETTE.scaffoldYellow, 0.6, 0.3, true);

  // ===== WAREHOUSE INTERIOR BEAM TOPS =====
  B.colorBox(1.5, 0.15, 1.5, -8, 5.0, -12, PALETTE.steel, 0.5, 0.5, true);
  B.colorBox(1.5, 0.15, 1.5, 0, 5.0, -4, PALETTE.steel, 0.5, 0.5, true);
  B.colorBox(1.5, 0.15, 1.5, 8, 5.0, 4, PALETTE.steel, 0.5, 0.5, true);
}

// ========== PARKOUR STRUCTURES & ARCHITECTURE ==========
function buildParkourStructures(B: MapBoxHelper, scene: THREE.Scene) {
  // ===== WATCHTOWER near dock (climbable) =====
  const twX = 40, twZ = 30;
  // 4 legs (with colliders)
  B.colorBox(0.25, 6, 0.25, twX - 1.5, 3, twZ - 1.5, PALETTE.steelDark, 0.5, 0.5, true);
  B.colorBox(0.25, 6, 0.25, twX + 1.5, 3, twZ - 1.5, PALETTE.steelDark, 0.5, 0.5, true);
  B.colorBox(0.25, 6, 0.25, twX - 1.5, 3, twZ + 1.5, PALETTE.steelDark, 0.5, 0.5, true);
  B.colorBox(0.25, 6, 0.25, twX + 1.5, 3, twZ + 1.5, PALETTE.steelDark, 0.5, 0.5, true);
  // Platform
  B.colorBox(4, 0.15, 4, twX, 6, twZ, PALETTE.steel, 0.5, 0.5, true);
  // Half-walls
  B.colorBox(4, 1.0, 0.12, twX, 6.6, twZ - 2, PALETTE.woodDark, 0.85, 0.02, true);
  B.colorBox(4, 1.0, 0.12, twX, 6.6, twZ + 2, PALETTE.woodDark, 0.85, 0.02, true);
  B.colorBox(0.12, 1.0, 4, twX - 2, 6.6, twZ, PALETTE.woodDark, 0.85, 0.02, true);
  B.colorBox(0.12, 1.0, 4, twX + 2, 6.6, twZ, PALETTE.woodDark, 0.85, 0.02, false);
  // Ladder up (walkable step colliders)
  for (let i = 0; i < 15; i++) {
    const ladY = i * 0.4;
    B.colorBox(0.6, 0.04, 0.04, twX + 1.8, ladY + 0.2, twZ, PALETTE.steelLight, 0.5, 0.5, false);
    B.addCollider(twX + 1.5, ladY, twZ - 0.3, twX + 2.1, ladY + 0.4, twZ + 0.3);
  }
  B.colorBox(0.04, 6, 0.04, twX + 1.55, 3, twZ - 0.25, PALETTE.steelLight, 0.5, 0.5, false);
  B.colorBox(0.04, 6, 0.04, twX + 2.05, 3, twZ + 0.25, PALETTE.steelLight, 0.5, 0.5, false);
  // Roof
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(3, 1.5, 4), getCustomMaterial(PALETTE.containerRed, 0.7, 0.2));
  towerRoof.position.set(twX, 7.5, twZ);
  towerRoof.rotation.y = Math.PI / 4;
  towerRoof.castShadow = true;
  scene.add(towerRoof);

  // (pipe bridge removed)

  // ===== SHIPPING CRATE PARKOUR near container yard =====
  // Staggered crates at different heights for jumping
  B.colorBox(2, 0.8, 2, 52, 0.4, -30, PALETTE.containerBlue, 0.7, 0.2, true);
  B.colorBox(1.8, 0.8, 1.8, 55, 1.2, -28, PALETTE.containerRed, 0.7, 0.2, true);
  B.colorBox(1.5, 0.8, 1.5, 52, 2.0, -26, PALETTE.containerGreen, 0.7, 0.2, true);
  B.colorBox(2, 0.8, 2, 56, 2.8, -24, PALETTE.containerYlow, 0.7, 0.2, true);
  B.colorBox(1.5, 0.8, 1.5, 53, 3.6, -22, PALETTE.containerBlue, 0.7, 0.2, true);

  // ===== BRICK ARCHWAY (decorative entrance to construction zone) =====
  const archX = -28, archZ = -15;
  B.colorBox(0.5, 4, 1, archX - 2, 2, archZ, 0x8a4030, 0.85, 0.02, true);
  B.colorBox(0.5, 4, 1, archX + 2, 2, archZ, 0x8a4030, 0.85, 0.02, true);
  B.colorBox(4.5, 0.6, 1, archX, 4.3, archZ, 0x8a4030, 0.85, 0.02, false);
  // Keystone accent
  B.colorBox(0.4, 0.7, 1.02, archX, 4.65, archZ, PALETTE.concreteDark, 0.9, 0.03, false);

  // ===== GAZEBO / REST AREA near dock =====
  const gzX = 5, gzZ = 30;
  // Floor platform (solid)
  B.colorBox(4.5, 0.15, 4.5, gzX, 0.08, gzZ, PALETTE.woodWarm, 0.82, 0.02, false);
  B.addCollider(gzX - 2.25, 0, gzZ - 2.25, gzX + 2.25, 0.2, gzZ + 2.25);
  // 4 pillars (with colliders)
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    B.cyl(0.08, 0.1, 3, gzX + dx, 1.5, gzZ + dz, "woodDark");
    B.addCollider(gzX + dx - 0.15, 0, gzZ + dz - 0.15, gzX + dx + 0.15, 3, gzZ + dz + 0.15);
  }
  // Roof beams
  B.colorBox(4.5, 0.1, 0.15, gzX, 3, gzZ - 2, PALETTE.woodDark, 0.85, 0.02, false);
  B.colorBox(4.5, 0.1, 0.15, gzX, 3, gzZ + 2, PALETTE.woodDark, 0.85, 0.02, false);
  B.colorBox(0.15, 0.1, 4.5, gzX - 2, 3, gzZ, PALETTE.woodDark, 0.85, 0.02, false);
  B.colorBox(0.15, 0.1, 4.5, gzX + 2, 3, gzZ, PALETTE.woodDark, 0.85, 0.02, false);
  // Roof panels (with collider - walkable on top)
  B.colorBox(4.8, 0.15, 4.8, gzX, 3.1, gzZ, PALETTE.woodWarm, 0.85, 0.02, false);
  B.addCollider(gzX - 2.4, 3.0, gzZ - 2.4, gzX + 2.4, 3.2, gzZ + 2.4);
  // Bench inside
  B.colorBox(3, 0.06, 0.4, gzX, 0.45, gzZ - 1.2, PALETTE.woodWarm, 0.85, 0.02, true);
  B.colorBox(3, 0.5, 0.06, gzX, 0.7, gzZ - 1.4, PALETTE.woodDark, 0.85, 0.02, false);

  // ===== WALL-RUN PLATFORMS inside warehouse =====
  // Thin ledges on warehouse walls for skilled movement
  B.colorBox(8, 0.15, 0.6, -18, 2.5, -17, PALETTE.steel, 0.5, 0.5, true);
  B.colorBox(8, 0.15, 0.6, 18, 2.5, -17, PALETTE.steel, 0.5, 0.5, true);
  B.colorBox(0.6, 0.15, 8, -22, 3.0, -8, PALETTE.steel, 0.5, 0.5, true);
  B.colorBox(0.6, 0.15, 8, 22, 3.0, 8, PALETTE.steel, 0.5, 0.5, true);

  // ===== CARGO NET FRAME (visual + climbable ladder) =====
  const netX = -45, netZ = -30;
  B.colorBox(0.2, 4, 0.2, netX - 2, 2, netZ, PALETTE.steelDark, 0.5, 0.5, true);
  B.colorBox(0.2, 4, 0.2, netX + 2, 2, netZ, PALETTE.steelDark, 0.5, 0.5, true);
  B.colorBox(4.2, 0.15, 0.15, netX, 4, netZ, PALETTE.steelDark, 0.5, 0.5, false);
  // Net lines (visual)
  for (let i = 0; i < 5; i++) {
    B.colorBox(0.02, 4, 0.02, netX - 2 + i, 2, netZ, PALETTE.ropeBeige, 0.9, 0, false);
    B.colorBox(4, 0.02, 0.02, netX, i * 0.8 + 0.4, netZ, PALETTE.ropeBeige, 0.9, 0, false);
  }
  // Platform on top
  B.colorBox(4.5, 0.15, 2, netX, 4.1, netZ, PALETTE.steel, 0.5, 0.5, true);
  // Climbable ladder (step colliders)
  for (let i = 0; i < 10; i++) {
    const ladY = i * 0.4;
    B.addCollider(netX - 2.2, ladY, netZ - 0.2, netX - 1.8, ladY + 0.4, netZ + 0.2);
  }

  // ===== SILO TOWER (cylinder landmark near construction zone) =====
  const siloMat = getCustomMaterial(PALETTE.concreteDark, 0.85, 0.03);
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 8, 16), siloMat);
  silo.position.set(-48, 4, -22);
  silo.castShadow = true;
  silo.receiveShadow = true;
  scene.add(silo);
  B.addCollider(-50.2, 0, -24.2, -45.8, 8, -19.8);
  // Silo top platform (walkable)
  B.colorBox(5, 0.15, 5, -48, 8.1, -22, PALETTE.steel, 0.5, 0.5, true);
  // Railing
  B.colorBox(5, 0.06, 0.06, -48, 9.0, -24.5, PALETTE.steelLight, 0.5, 0.5, false);
  B.colorBox(5, 0.06, 0.06, -48, 9.0, -19.5, PALETTE.steelLight, 0.5, 0.5, false);
  // Ladder on silo exterior (walkable step colliders)
  for (let i = 0; i < 20; i++) {
    const ladY = i * 0.4;
    B.colorBox(0.5, 0.04, 0.04, -46, ladY + 0.2, -22, PALETTE.steelLight, 0.5, 0.5, false);
    B.addCollider(-46.3, ladY, -22.15, -45.7, ladY + 0.4, -21.85);
  }
  // Ladder side rails
  B.colorBox(0.04, 8, 0.04, -46.25, 4, -22, PALETTE.steelLight, 0.5, 0.5, false);
  B.colorBox(0.04, 8, 0.04, -45.75, 4, -22, PALETTE.steelLight, 0.5, 0.5, false);

  // ===== SUSPENDED PLATFORMS (warehouse ceiling) =====
  // Chain-suspended metal platforms hanging from roof beams
  const chainMat = getCustomMaterial(PALETTE.steelLight, 0.4, 0.6);
  const suspPositions: [number, number, number][] = [[-15, 5.5, 0], [0, 5.8, 8], [12, 5.3, -5]];
  for (const [sx, sy, sz] of suspPositions) {
    B.colorBox(2.5, 0.12, 2.5, sx, sy, sz, PALETTE.steel, 0.5, 0.5, true);
    // Chains (4 corners)
    for (const [cdx, cdz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const chain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 8 - sy + 0.5, 4),
        chainMat
      );
      chain.position.set(sx + cdx, (8 + sy) / 2, sz + cdz);
      scene.add(chain);
    }
    // Hazard stripe on platform edge
    B.colorBox(2.5, 0.02, 0.12, sx, sy + 0.07, sz - 1.2, PALETTE.accentYellow, 0.7, 0.1, false);
  }

  // ===== TIRE WALL (parkour obstacle in yard) =====
  const tireMat = getCustomMaterial(0x1a1a1a, 0.92, 0);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 12), tireMat);
      t.position.set(28 + col * 0.7, 0.35 + row * 0.65, -30);
      t.rotation.x = Math.PI / 2;
      t.castShadow = true;
      scene.add(t);
    }
  }
  B.addCollider(27.5, 0, -30.3, 31.5, 2.3, -29.7);
}

// ========== BACKYARD 2-STORY HOUSE ==========
function buildBackyardHouse(B: MapBoxHelper, scene: THREE.Scene) {
  const hx = -35, hz = 22;
  const F = 5.0;
  const W = 0.5;
  const HW = 10, HD = 8;
  const wallColor = 0xf0e6d0;
  const trimColor = PALETTE.woodDark;
  // === FOUNDATION ===
  B.colorBox(HW + 2, 0.35, HD + 2, hx, 0.175, hz, PALETTE.concreteDark, 0.9, 0.03, false);

  // === 1F FLOOR ===
  B.colorBox(HW, 0.15, HD, hx, 0.35, hz, PALETTE.woodWarm, 0.82, 0.02, false);
  B.addCollider(hx - HW / 2, 0.2, hz - HD / 2, hx + HW / 2, 0.5, hz + HD / 2);

  // === 1F WALLS ===
  const baseY1 = 0.35;
  const winH1 = 2.0, winSill1 = 1.0;

  // Back wall 1F - solid wall, chimney protrudes inward from it
  const chX = hx + HW / 2 - 1.5, chZ = hz - HD / 2 + 1.0;
  B.colorBox(HW + W, F, W, hx, baseY1 + F / 2, hz - HD / 2, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY1, hz - HD / 2 - W / 2, hx + HW / 2 + W / 2, baseY1 + F, hz - HD / 2 + W / 2);

  // Left wall 1F - open window (can see through and jump in)
  // Below window
  B.colorBox(W, winSill1, HD, hx - HW / 2, baseY1 + winSill1 / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY1, hz - HD / 2, hx - HW / 2 + W / 2, baseY1 + winSill1, hz + HD / 2);
  // Above window
  B.colorBox(W, F - winSill1 - winH1, HD, hx - HW / 2, baseY1 + winSill1 + winH1 + (F - winSill1 - winH1) / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY1 + winSill1 + winH1, hz - HD / 2, hx - HW / 2 + W / 2, baseY1 + F, hz + HD / 2);
  // Side pillars around window
  B.colorBox(W, winH1, 1.5, hx - HW / 2, baseY1 + winSill1 + winH1 / 2, hz - HD / 2 + 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY1 + winSill1, hz - HD / 2, hx - HW / 2 + W / 2, baseY1 + winSill1 + winH1, hz - HD / 2 + 1.5);
  B.colorBox(W, winH1, 1.5, hx - HW / 2, baseY1 + winSill1 + winH1 / 2, hz + HD / 2 - 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY1 + winSill1, hz + HD / 2 - 1.5, hx - HW / 2 + W / 2, baseY1 + winSill1 + winH1, hz + HD / 2);
  // Window frame
  B.colorBox(0.08, winH1 + 0.1, 0.08, hx - HW / 2, baseY1 + winSill1 + winH1 / 2, hz - HD / 2 + 1.5, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, winH1 + 0.1, 0.08, hx - HW / 2, baseY1 + winSill1 + winH1 / 2, hz + HD / 2 - 1.5, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, 0.08, HD - 3, hx - HW / 2, baseY1 + winSill1, hz, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, 0.08, HD - 3, hx - HW / 2, baseY1 + winSill1 + winH1, hz, trimColor, 0.85, 0.02, false);

  // Right wall 1F - same open window pattern
  B.colorBox(W, winSill1, HD, hx + HW / 2, baseY1 + winSill1 / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + HW / 2 - W / 2, baseY1, hz - HD / 2, hx + HW / 2 + W / 2, baseY1 + winSill1, hz + HD / 2);
  B.colorBox(W, F - winSill1 - winH1, HD, hx + HW / 2, baseY1 + winSill1 + winH1 + (F - winSill1 - winH1) / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + HW / 2 - W / 2, baseY1 + winSill1 + winH1, hz - HD / 2, hx + HW / 2 + W / 2, baseY1 + F, hz + HD / 2);
  B.colorBox(W, winH1, 1.5, hx + HW / 2, baseY1 + winSill1 + winH1 / 2, hz - HD / 2 + 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + HW / 2 - W / 2, baseY1 + winSill1, hz - HD / 2, hx + HW / 2 + W / 2, baseY1 + winSill1 + winH1, hz - HD / 2 + 1.5);
  B.colorBox(W, winH1, 1.5, hx + HW / 2, baseY1 + winSill1 + winH1 / 2, hz + HD / 2 - 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + HW / 2 - W / 2, baseY1 + winSill1, hz + HD / 2 - 1.5, hx + HW / 2 + W / 2, baseY1 + winSill1 + winH1, hz + HD / 2);
  B.colorBox(0.08, winH1 + 0.1, 0.08, hx + HW / 2, baseY1 + winSill1 + winH1 / 2, hz - HD / 2 + 1.5, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, winH1 + 0.1, 0.08, hx + HW / 2, baseY1 + winSill1 + winH1 / 2, hz + HD / 2 - 1.5, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, 0.08, HD - 3, hx + HW / 2, baseY1 + winSill1, hz, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, 0.08, HD - 3, hx + HW / 2, baseY1 + winSill1 + winH1, hz, trimColor, 0.85, 0.02, false);

  // Front wall - with door (thick colliders to prevent jump-through)
  const fwThick = 1.0;
  B.colorBox(3.5, F, W, hx - 3.25, baseY1 + F / 2, hz + HD / 2, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - 5, baseY1, hz + HD / 2 - fwThick / 2, hx - 1.5, baseY1 + F, hz + HD / 2 + fwThick / 2);
  B.colorBox(3.5, F, W, hx + 3.25, baseY1 + F / 2, hz + HD / 2, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + 1.5, baseY1, hz + HD / 2 - fwThick / 2, hx + 5, baseY1 + F, hz + HD / 2 + fwThick / 2);
  // Above door
  const doorTopY = 3.15;
  B.colorBox(3, F - (doorTopY - baseY1), W, hx, (doorTopY + baseY1 + F) / 2, hz + HD / 2, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - 1.5, doorTopY, hz + HD / 2 - fwThick / 2, hx + 1.5, baseY1 + F, hz + HD / 2 + fwThick / 2);
  // Door frame
  B.colorBox(0.12, doorTopY - baseY1, 0.15, hx - 1.5, (baseY1 + doorTopY) / 2, hz + HD / 2, trimColor, 0.85, 0.02, false);
  B.colorBox(0.12, doorTopY - baseY1, 0.15, hx + 1.5, (baseY1 + doorTopY) / 2, hz + HD / 2, trimColor, 0.85, 0.02, false);
  B.colorBox(3.1, 0.12, 0.15, hx, doorTopY, hz + HD / 2, trimColor, 0.85, 0.02, false);

  // === 2F FLOOR - with staircase opening on left side + chimney hole ===
  const stairOpenW = 2.0;
  const stairOpenZ2 = hz + 0.5;
  const stairOpenX1 = hx - HW / 2;
  const stairOpenX2 = hx - HW / 2 + stairOpenW;
  const chHoleR = 0.7;
  // Visual floor panels (with holes cut for stair and chimney)
  B.colorBox(HW - stairOpenW, 0.2, HD, hx - HW / 2 + stairOpenW + (HW - stairOpenW) / 2, F + 0.45, hz, PALETTE.woodWarm, 0.82, 0.02, false);
  B.colorBox(stairOpenW, 0.2, HD / 2 - 0.5, stairOpenX1 + stairOpenW / 2, F + 0.45, hz + HD / 4 + 0.25, PALETTE.woodWarm, 0.82, 0.02, false);
  // Floor colliders split around stair opening AND chimney hole
  // Left of chimney (from stair opening edge to chimney hole)
  B.addCollider(stairOpenX2, F + 0.35, hz - HD / 2, chX - chHoleR, F + 0.55, hz + HD / 2);
  // Right of chimney
  B.addCollider(chX + chHoleR, F + 0.35, hz - HD / 2, hx + HW / 2, F + 0.55, hz + HD / 2);
  // Front of chimney hole (chimney to front wall)
  B.addCollider(chX - chHoleR, F + 0.35, chZ + chHoleR, chX + chHoleR, F + 0.55, hz + HD / 2);
  // Back of chimney hole (chimney to back wall)
  B.addCollider(chX - chHoleR, F + 0.35, hz - HD / 2, chX + chHoleR, F + 0.55, chZ - chHoleR);
  // Stair exit landing
  B.addCollider(stairOpenX1, F + 0.35, stairOpenZ2, stairOpenX2, F + 0.55, hz + HD / 2);

  // === 2F WALLS ===
  const baseY2 = F + 0.35;
  // Back wall 2F - solid
  B.colorBox(HW + W, F, W, hx, baseY2 + F / 2, hz - HD / 2, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY2, hz - HD / 2 - W / 2, hx + HW / 2 + W / 2, baseY2 + F, hz - HD / 2 + W / 2);
  // Left wall 2F - open window (same pattern as 1F)
  B.colorBox(W, winSill1, HD, hx - HW / 2, baseY2 + winSill1 / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY2, hz - HD / 2, hx - HW / 2 + W / 2, baseY2 + winSill1, hz + HD / 2);
  B.colorBox(W, F - winSill1 - winH1, HD, hx - HW / 2, baseY2 + winSill1 + winH1 + (F - winSill1 - winH1) / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY2 + winSill1 + winH1, hz - HD / 2, hx - HW / 2 + W / 2, baseY2 + F, hz + HD / 2);
  B.colorBox(W, winH1, 1.5, hx - HW / 2, baseY2 + winSill1 + winH1 / 2, hz - HD / 2 + 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY2 + winSill1, hz - HD / 2, hx - HW / 2 + W / 2, baseY2 + winSill1 + winH1, hz - HD / 2 + 1.5);
  B.colorBox(W, winH1, 1.5, hx - HW / 2, baseY2 + winSill1 + winH1 / 2, hz + HD / 2 - 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY2 + winSill1, hz + HD / 2 - 1.5, hx - HW / 2 + W / 2, baseY2 + winSill1 + winH1, hz + HD / 2);
  B.colorBox(0.08, winH1 + 0.1, 0.08, hx - HW / 2, baseY2 + winSill1 + winH1 / 2, hz - HD / 2 + 1.5, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, winH1 + 0.1, 0.08, hx - HW / 2, baseY2 + winSill1 + winH1 / 2, hz + HD / 2 - 1.5, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, 0.08, HD - 3, hx - HW / 2, baseY2 + winSill1, hz, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, 0.08, HD - 3, hx - HW / 2, baseY2 + winSill1 + winH1, hz, trimColor, 0.85, 0.02, false);
  // Right wall 2F - open window
  B.colorBox(W, winSill1, HD, hx + HW / 2, baseY2 + winSill1 / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + HW / 2 - W / 2, baseY2, hz - HD / 2, hx + HW / 2 + W / 2, baseY2 + winSill1, hz + HD / 2);
  B.colorBox(W, F - winSill1 - winH1, HD, hx + HW / 2, baseY2 + winSill1 + winH1 + (F - winSill1 - winH1) / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + HW / 2 - W / 2, baseY2 + winSill1 + winH1, hz - HD / 2, hx + HW / 2 + W / 2, baseY2 + F, hz + HD / 2);
  B.colorBox(W, winH1, 1.5, hx + HW / 2, baseY2 + winSill1 + winH1 / 2, hz - HD / 2 + 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + HW / 2 - W / 2, baseY2 + winSill1, hz - HD / 2, hx + HW / 2 + W / 2, baseY2 + winSill1 + winH1, hz - HD / 2 + 1.5);
  B.colorBox(W, winH1, 1.5, hx + HW / 2, baseY2 + winSill1 + winH1 / 2, hz + HD / 2 - 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + HW / 2 - W / 2, baseY2 + winSill1, hz + HD / 2 - 1.5, hx + HW / 2 + W / 2, baseY2 + winSill1 + winH1, hz + HD / 2);
  B.colorBox(0.08, winH1 + 0.1, 0.08, hx + HW / 2, baseY2 + winSill1 + winH1 / 2, hz - HD / 2 + 1.5, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, winH1 + 0.1, 0.08, hx + HW / 2, baseY2 + winSill1 + winH1 / 2, hz + HD / 2 - 1.5, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, 0.08, HD - 3, hx + HW / 2, baseY2 + winSill1, hz, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, 0.08, HD - 3, hx + HW / 2, baseY2 + winSill1 + winH1, hz, trimColor, 0.85, 0.02, false);
  // Front wall 2F - with balcony door
  B.colorBox(2.5, F, W, hx - 3.75, baseY2 + F / 2, hz + HD / 2, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - 5, baseY2, hz + HD / 2 - W / 2, hx - 2.5, baseY2 + F, hz + HD / 2 + W / 2);
  B.colorBox(2.5, F, W, hx + 3.75, baseY2 + F / 2, hz + HD / 2, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + 2.5, baseY2, hz + HD / 2 - W / 2, hx + 5, baseY2 + F, hz + HD / 2 + W / 2);
  B.colorBox(5, 0.6, W, hx, F * 2 + 0.05, hz + HD / 2, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - 2.5, F * 2 - 0.3, hz + HD / 2 - W / 2, hx + 2.5, F * 2 + 0.35, hz + HD / 2 + W / 2);

  // === BALCONY ===
  const balD = 1.8;
  B.colorBox(5, 0.15, balD, hx, F + 0.43, hz + HD / 2 + balD / 2, PALETTE.woodWarm, 0.82, 0.02, false);
  B.addCollider(hx - 2.5, F + 0.35, hz + HD / 2, hx + 2.5, F + 0.55, hz + HD / 2 + balD);
  // Balcony railing
  B.colorBox(5, 0.08, 0.08, hx, F + 1.3, hz + HD / 2 + balD, trimColor, 0.85, 0.02, false);
  B.addCollider(hx - 2.5, F + 0.35, hz + HD / 2 + balD - 0.15, hx + 2.5, F + 1.4, hz + HD / 2 + balD + 0.15);
  for (let i = 0; i < 6; i++) {
    B.colorBox(0.05, 0.9, 0.05, hx - 2.3 + i * 0.92, F + 0.88, hz + HD / 2 + balD, trimColor, 0.85, 0.02, false);
  }
  B.colorBox(0.08, 0.9, balD, hx - 2.5, F + 0.88, hz + HD / 2 + balD / 2, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, 0.9, balD, hx + 2.5, F + 0.88, hz + HD / 2 + balD / 2, trimColor, 0.85, 0.02, false);

  // === ROOF (flat horizontal - walkable, with chimney hole) ===
  const roofOverhang = 1.0;
  const roofTopY = F * 2 + 0.35;
  const roofColor = 0x555555;
  const roofL = hx - HW / 2 - roofOverhang, roofR = hx + HW / 2 + roofOverhang;
  const roofB = hz - HD / 2 - roofOverhang, roofF = hz + HD / 2 + roofOverhang;
  const hL = chX - chHoleR, hR = chX + chHoleR, hB2 = chZ - chHoleR, hF2 = chZ + chHoleR;
  // Left of hole
  B.colorBox(hL - roofL, 0.25, roofF - roofB, (roofL + hL) / 2, roofTopY + 0.12, (roofB + roofF) / 2, roofColor, 0.7, 0.2, false);
  // Right of hole
  B.colorBox(roofR - hR, 0.25, roofF - roofB, (hR + roofR) / 2, roofTopY + 0.12, (roofB + roofF) / 2, roofColor, 0.7, 0.2, false);
  // Back of hole (between left and right strips)
  B.colorBox(hR - hL, 0.25, hB2 - roofB, (hL + hR) / 2, roofTopY + 0.12, (roofB + hB2) / 2, roofColor, 0.7, 0.2, false);
  // Front of hole
  B.colorBox(hR - hL, 0.25, roofF - hF2, (hL + hR) / 2, roofTopY + 0.12, (hF2 + roofF) / 2, roofColor, 0.7, 0.2, false);
  // Roof colliders split around chimney opening
  B.addCollider(hx - HW / 2 - roofOverhang, roofTopY, hz - HD / 2 - roofOverhang, chX - chHoleR, roofTopY + 0.3, hz + HD / 2 + roofOverhang);
  B.addCollider(chX + chHoleR, roofTopY, hz - HD / 2 - roofOverhang, hx + HW / 2 + roofOverhang, roofTopY + 0.3, hz + HD / 2 + roofOverhang);
  B.addCollider(chX - chHoleR, roofTopY, chZ + chHoleR, chX + chHoleR, roofTopY + 0.3, hz + HD / 2 + roofOverhang);
  B.addCollider(chX - chHoleR, roofTopY, hz - HD / 2 - roofOverhang, chX + chHoleR, roofTopY + 0.3, chZ - chHoleR);
  // Roof edge trim (parapet)
  B.colorBox(HW + roofOverhang * 2, 0.5, 0.15, hx, roofTopY + 0.5, hz - HD / 2 - roofOverhang, wallColor, 0.85, 0.02, false);
  B.colorBox(HW + roofOverhang * 2, 0.5, 0.15, hx, roofTopY + 0.5, hz + HD / 2 + roofOverhang, wallColor, 0.85, 0.02, false);
  B.colorBox(0.15, 0.5, HD + roofOverhang * 2, hx - HW / 2 - roofOverhang, roofTopY + 0.5, hz, wallColor, 0.85, 0.02, false);
  B.colorBox(0.15, 0.5, HD + roofOverhang * 2, hx + HW / 2 + roofOverhang, roofTopY + 0.5, hz, wallColor, 0.85, 0.02, false);
  // Accent trim line
  B.colorBox(HW + roofOverhang * 2 + 0.3, 0.08, 0.2, hx, roofTopY - 0.1, hz - HD / 2 - roofOverhang, trimColor, 0.85, 0.02, false);
  B.colorBox(HW + roofOverhang * 2 + 0.3, 0.08, 0.2, hx, roofTopY - 0.1, hz + HD / 2 + roofOverhang, trimColor, 0.85, 0.02, false);

  // === INTERIOR STAIRCASE (clean, along left wall) ===
  const stairW = 1.4;
  const numSteps = 16;
  const stepRise = F / numSteps;
  const stepRun = 0.3;
  const stairStartZ = hz - HD / 2 + 0.8;
  const stairX = hx - HW / 2 + W / 2 + stairW / 2 + 0.15;
  for (let i = 0; i < numSteps; i++) {
    const sy = 0.35 + (i + 1) * stepRise;
    const sz = stairStartZ + i * stepRun;
    B.colorBox(stairW, 0.1, stepRun + 0.02, stairX, sy - 0.05, sz, PALETTE.woodWarm, 0.82, 0.02, false);
    B.addCollider(stairX - stairW / 2 - 0.05, sy - 0.1, sz - stepRun / 2 - 0.02, stairX + stairW / 2 + 0.05, sy, sz + stepRun / 2 + 0.02);
  }
  // === INTERIOR DETAILS 1F ===

  // --- LIVING ROOM (center of room, facing fireplace on right-back wall) ---
  // Sofa (center of room, facing back-right where fireplace is)
  const sofaX = hx, sofaZ = hz - 0.5;
  B.colorBox(2.5, 0.45, 0.9, sofaX, 0.58, sofaZ, 0x3355aa, 0.85, 0.02, true);
  B.colorBox(2.5, 0.6, 0.12, sofaX, 0.95, sofaZ + 0.42, 0x2244aa, 0.85, 0.02, false);
  B.colorBox(0.12, 0.4, 0.9, sofaX - 1.25, 0.75, sofaZ, 0x2244aa, 0.85, 0.02, false);
  B.colorBox(0.12, 0.4, 0.9, sofaX + 1.25, 0.75, sofaZ, 0x2244aa, 0.85, 0.02, false);
  // Throw pillows
  B.colorBox(0.3, 0.25, 0.25, sofaX - 0.8, 0.92, sofaZ - 0.15, 0xcc8844, 0.9, 0, false);
  B.colorBox(0.3, 0.25, 0.25, sofaX + 0.8, 0.92, sofaZ - 0.15, 0x44aa88, 0.9, 0, false);
  // Coffee table in front of sofa
  B.colorBox(1.0, 0.06, 0.5, sofaX, 0.58, sofaZ - 1.0, PALETTE.woodWarm, 0.82, 0.02, true);
  B.colorBox(0.06, 0.2, 0.06, sofaX - 0.4, 0.45, sofaZ - 1.2, trimColor, 0.85, 0.02, false);
  B.colorBox(0.06, 0.2, 0.06, sofaX + 0.4, 0.45, sofaZ - 1.2, trimColor, 0.85, 0.02, false);
  B.colorBox(0.06, 0.2, 0.06, sofaX - 0.4, 0.45, sofaZ - 0.8, trimColor, 0.85, 0.02, false);
  B.colorBox(0.06, 0.2, 0.06, sofaX + 0.4, 0.45, sofaZ - 0.8, trimColor, 0.85, 0.02, false);
  // Vase on coffee table
  B.cyl(0.08, 0.06, 0.2, sofaX + 0.2, 0.72, sofaZ - 1.0, "steelDark");
  // Rug under seating area
  B.colorBox(3.0, 0.02, 2.5, sofaX, 0.37, sofaZ - 0.3, 0x885544, 0.95, 0, false);
  // Armchair (left side, near left wall)
  B.colorBox(0.8, 0.4, 0.8, hx - HW / 2 + 1.5, 0.55, hz - 0.5, 0x556633, 0.9, 0.02, true);
  B.colorBox(0.8, 0.5, 0.1, hx - HW / 2 + 1.5, 0.85, hz - 0.9, 0x445522, 0.9, 0.02, false);
  // Bookshelf against left wall (near back, below staircase)
  B.colorBox(1.2, 1.8, 0.4, hx - HW / 2 + 0.7, 1.25, hz - HD / 2 + 3.0, trimColor, 0.85, 0.02, true);
  B.colorBox(1.0, 0.04, 0.35, hx - HW / 2 + 0.7, 0.9, hz - HD / 2 + 3.0, PALETTE.woodWarm, 0.82, 0.02, false);
  B.colorBox(1.0, 0.04, 0.35, hx - HW / 2 + 0.7, 1.5, hz - HD / 2 + 3.0, PALETTE.woodWarm, 0.82, 0.02, false);
  // Books
  B.colorBox(0.3, 0.25, 0.18, hx - HW / 2 + 0.5, 1.0, hz - HD / 2 + 2.95, 0xaa2222, 0.9, 0, false);
  B.colorBox(0.25, 0.3, 0.18, hx - HW / 2 + 0.9, 1.02, hz - HD / 2 + 2.95, 0x2255aa, 0.9, 0, false);
  B.colorBox(0.35, 0.25, 0.18, hx - HW / 2 + 0.6, 1.6, hz - HD / 2 + 2.95, 0x885500, 0.9, 0, false);
  // Floor lamp near armchair
  B.cyl(0.04, 0.06, 1.6, hx - HW / 2 + 1.5, 1.15, hz + 0.5, "steelDark");
  B.colorBox(0.35, 0.25, 0.35, hx - HW / 2 + 1.5, 2.0, hz + 0.5, 0xffeecc, 0.8, 0, false);

  // --- KITCHEN AREA (left-front side, near staircase) ---
  const kitX = hx - HW / 2 + 2.5, kitZ = hz + 1.5;
  // Fridge (tall, silver)
  B.colorBox(0.8, 2.0, 0.7, kitX - 1.0, 1.35, kitZ + 1.5, 0xcccccc, 0.3, 0.6, true);
  B.colorBox(0.75, 0.95, 0.05, kitX - 1.0, 1.8, kitZ + 1.15, 0xbbbbbb, 0.3, 0.6, false);
  B.colorBox(0.75, 0.95, 0.05, kitX - 1.0, 0.82, kitZ + 1.15, 0xbbbbbb, 0.3, 0.6, false);
  B.colorBox(0.04, 0.15, 0.04, kitX - 0.7, 1.8, kitZ + 1.14, 0x888888, 0.3, 0.7, false);
  B.colorBox(0.04, 0.15, 0.04, kitX - 0.7, 0.8, kitZ + 1.14, 0x888888, 0.3, 0.7, false);
  // Kitchen counter (L-shape along left wall and front wall)
  B.colorBox(2.0, 0.9, 0.6, kitX, 0.8, kitZ + 1.5, PALETTE.woodWarm, 0.82, 0.02, true);
  // Counter top (marble white)
  B.colorBox(2.0, 0.06, 0.65, kitX, 1.28, kitZ + 1.5, 0xeeeedd, 0.3, 0.1, false);
  // Sink basin (dark recess in counter)
  B.colorBox(0.5, 0.04, 0.35, kitX + 0.3, 1.22, kitZ + 1.5, 0x444444, 0.4, 0.5, false);
  // Faucet
  B.cyl(0.02, 0.02, 0.25, kitX + 0.3, 1.43, kitZ + 1.75, "steelDark");
  B.colorBox(0.15, 0.02, 0.02, kitX + 0.3, 1.55, kitZ + 1.65, 0xcccccc, 0.3, 0.7, false);
  // Stove / Cooktop (next to sink)
  B.colorBox(0.6, 0.04, 0.55, kitX - 0.5, 1.28, kitZ + 1.5, 0x222222, 0.8, 0.3, false);
  // Burner rings
  B.cyl(0.1, 0.1, 0.01, kitX - 0.3, 1.31, kitZ + 1.35, "steelDark");
  B.cyl(0.1, 0.1, 0.01, kitX - 0.7, 1.31, kitZ + 1.35, "steelDark");
  B.cyl(0.08, 0.08, 0.01, kitX - 0.3, 1.31, kitZ + 1.65, "steelDark");
  B.cyl(0.08, 0.08, 0.01, kitX - 0.7, 1.31, kitZ + 1.65, "steelDark");
  // Upper cabinets (on wall above counter, with collider)
  B.colorBox(2.0, 0.7, 0.35, kitX, 2.5, kitZ + 1.65, trimColor, 0.85, 0.02, true);
  B.colorBox(0.04, 0.55, 0.04, kitX - 0.4, 2.5, kitZ + 1.47, 0x888888, 0.3, 0.7, false);
  B.colorBox(0.04, 0.55, 0.04, kitX + 0.4, 2.5, kitZ + 1.47, 0x888888, 0.3, 0.7, false);
  // Pot on stove
  B.cyl(0.12, 0.1, 0.15, kitX - 0.5, 1.38, kitZ + 1.5, "steelDark");

  // --- DINING AREA (center-right, near front door) ---
  const dtX = hx + 2.0, dtZ = hz + 2.2;
  B.colorBox(1.6, 0.06, 0.9, dtX, 1.1, dtZ, PALETTE.woodWarm, 0.82, 0.02, true);
  B.colorBox(0.06, 0.72, 0.06, dtX - 0.7, 0.72, dtZ - 0.35, trimColor, 0.85, 0.02, false);
  B.colorBox(0.06, 0.72, 0.06, dtX + 0.7, 0.72, dtZ - 0.35, trimColor, 0.85, 0.02, false);
  B.colorBox(0.06, 0.72, 0.06, dtX - 0.7, 0.72, dtZ + 0.35, trimColor, 0.85, 0.02, false);
  B.colorBox(0.06, 0.72, 0.06, dtX + 0.7, 0.72, dtZ + 0.35, trimColor, 0.85, 0.02, false);
  // Chairs (2 sides)
  B.colorBox(0.4, 0.06, 0.4, dtX - 0.4, 0.8, dtZ - 0.7, trimColor, 0.85, 0.02, false);
  B.colorBox(0.4, 0.8, 0.06, dtX - 0.4, 1.1, dtZ - 0.9, trimColor, 0.85, 0.02, false);
  B.colorBox(0.4, 0.06, 0.4, dtX + 0.4, 0.8, dtZ - 0.7, trimColor, 0.85, 0.02, false);
  B.colorBox(0.4, 0.8, 0.06, dtX + 0.4, 1.1, dtZ - 0.9, trimColor, 0.85, 0.02, false);
  B.colorBox(0.4, 0.06, 0.4, dtX - 0.4, 0.8, dtZ + 0.7, trimColor, 0.85, 0.02, false);
  B.colorBox(0.4, 0.06, 0.4, dtX + 0.4, 0.8, dtZ + 0.7, trimColor, 0.85, 0.02, false);
  // Plates on table
  B.cyl(0.12, 0.12, 0.02, dtX - 0.3, 1.15, dtZ, "offWhite");
  B.cyl(0.12, 0.12, 0.02, dtX + 0.3, 1.15, dtZ, "offWhite");
  // Fruit bowl
  B.cyl(0.15, 0.12, 0.08, dtX, 1.17, dtZ, "steelDark");
  B.colorBox(0.1, 0.1, 0.1, dtX + 0.02, 1.25, dtZ, 0xff3333, 0.8, 0, false);
  B.colorBox(0.09, 0.09, 0.09, dtX - 0.06, 1.24, dtZ + 0.05, 0x33cc33, 0.8, 0, false);

  // --- ENTRYWAY (near front door) ---
  // Coat rack
  B.cyl(0.04, 0.06, 1.8, hx - 1.2, 1.25, hz + HD / 2 - 0.5, "steelDark");
  B.colorBox(0.5, 0.04, 0.04, hx - 1.2, 2.15, hz + HD / 2 - 0.5, 0x333333, 0.5, 0.5, false);
  // Shoe rack (low)
  B.colorBox(0.8, 0.3, 0.3, hx + 1.0, 0.5, hz + HD / 2 - 0.5, trimColor, 0.85, 0.02, false);
  // Welcome mat
  B.colorBox(1.2, 0.02, 0.6, hx, 0.37, hz + HD / 2 - 0.1, 0x665533, 0.95, 0, false);
  // Umbrella stand
  B.cyl(0.1, 0.12, 0.5, hx + 1.3, 0.6, hz + HD / 2 - 0.4, "steelDark");
  // Wall clock (on right wall near door)
  B.cyl(0.2, 0.2, 0.04, hx + HW / 2 - 0.03, 2.8, hz + 2.0, "woodDark");
  B.cyl(0.17, 0.17, 0.02, hx + HW / 2 - 0.01, 2.8, hz + 2.0, "offWhite");

  // === INTERIOR DETAILS 2F ===
  const f2y = F + 0.35;

  // --- BEDROOM (center-left area, away from chimney) ---
  const bedX = hx - 0.5;
  B.colorBox(2.2, 0.4, 1.8, bedX, f2y + 0.2, hz - 1.0, 0xcc9988, 0.9, 0.02, true);
  B.colorBox(2.2, 0.7, 0.15, bedX, f2y + 0.35, hz - 1.9, trimColor, 0.85, 0.02, false);
  B.colorBox(0.5, 0.08, 0.35, bedX, f2y + 0.45, hz - 1.6, 0xffffff, 0.9, 0, false);
  B.colorBox(0.45, 0.08, 0.3, bedX + 0.6, f2y + 0.45, hz - 1.6, 0xeeeeee, 0.9, 0, false);
  B.colorBox(2.0, 0.06, 1.3, bedX, f2y + 0.45, hz - 0.7, 0x7788aa, 0.9, 0.02, false);
  // Bed footboard
  B.colorBox(2.2, 0.4, 0.1, bedX, f2y + 0.2, hz - 0.1, trimColor, 0.85, 0.02, false);

  // Bedside table left + lamp
  B.colorBox(0.45, 0.45, 0.45, bedX + 1.5, f2y + 0.22, hz - 1.0, PALETTE.woodWarm, 0.82, 0.02, true);
  B.cyl(0.06, 0.06, 0.3, bedX + 1.5, f2y + 0.6, hz - 1.0, "steelDark");
  B.colorBox(0.2, 0.18, 0.2, bedX + 1.5, f2y + 0.85, hz - 1.0, 0xffeecc, 0.9, 0, false);
  // Bedside table right
  B.colorBox(0.45, 0.45, 0.45, bedX - 1.5, f2y + 0.22, hz - 1.0, PALETTE.woodWarm, 0.82, 0.02, true);
  // Alarm clock on right table
  B.colorBox(0.12, 0.1, 0.06, bedX - 1.5, f2y + 0.5, hz - 1.0, 0x222222, 0.9, 0.3, false);
  // Rug beside bed
  B.colorBox(1.8, 0.02, 0.8, bedX, f2y + 0.01, hz + 0.5, 0x996655, 0.95, 0, false);

  // --- STUDY AREA (center-right, near front wall) ---
  // Desk against front wall
  B.colorBox(1.5, 0.06, 0.6, hx + 1.5, f2y + 0.75, hz + HD / 2 - 0.7, PALETTE.woodWarm, 0.82, 0.02, true);
  B.colorBox(0.06, 0.75, 0.55, hx + 1.5 - 0.7, f2y + 0.38, hz + HD / 2 - 0.7, trimColor, 0.85, 0.02, false);
  B.colorBox(0.06, 0.75, 0.55, hx + 1.5 + 0.7, f2y + 0.38, hz + HD / 2 - 0.7, trimColor, 0.85, 0.02, false);
  // Desk chair
  B.colorBox(0.45, 0.06, 0.45, hx + 1.5, f2y + 0.55, hz + HD / 2 - 1.5, 0x333333, 0.9, 0.02, false);
  B.cyl(0.03, 0.04, 0.2, hx + 1.5, f2y + 0.42, hz + HD / 2 - 1.5, "steelDark");
  // Monitor on desk
  B.colorBox(0.6, 0.4, 0.04, hx + 1.5, f2y + 1.15, hz + HD / 2 - 0.55, 0x111111, 0.9, 0.5, false);
  B.colorBox(0.15, 0.2, 0.15, hx + 1.5, f2y + 0.88, hz + HD / 2 - 0.6, 0x333333, 0.5, 0.5, false);
  // Desk lamp
  B.cyl(0.04, 0.04, 0.3, hx + 1.5 + 0.5, f2y + 0.93, hz + HD / 2 - 0.7, "steelDark");
  B.colorBox(0.2, 0.1, 0.15, hx + 1.5 + 0.5, f2y + 1.13, hz + HD / 2 - 0.65, 0x333333, 0.5, 0.5, false);
  // Pencil cup
  B.cyl(0.04, 0.04, 0.1, hx + 1.5 - 0.5, f2y + 0.83, hz + HD / 2 - 0.7, "woodDark");

  // --- WARDROBE & DRESSER (back wall) ---
  // Wardrobe (tall, away from chimney)
  B.colorBox(1.2, 2.4, 0.55, hx - 0.5, f2y + 1.2, hz - HD / 2 + 0.65, trimColor, 0.85, 0.02, true);
  B.colorBox(0.04, 0.2, 0.04, hx - 0.9, f2y + 1.2, hz - HD / 2 + 0.37, 0x888888, 0.3, 0.7, false);
  B.colorBox(0.04, 0.2, 0.04, hx - 0.1, f2y + 1.2, hz - HD / 2 + 0.37, 0x888888, 0.3, 0.7, false);
  // Dresser (low, next to wardrobe)
  B.colorBox(0.9, 0.8, 0.45, hx + 0.8, f2y + 0.4, hz - HD / 2 + 0.6, trimColor, 0.85, 0.02, true);
  B.colorBox(0.04, 0.08, 0.04, hx + 0.5, f2y + 0.65, hz - HD / 2 + 0.37, 0x888888, 0.3, 0.7, false);
  B.colorBox(0.04, 0.08, 0.04, hx + 0.5, f2y + 0.45, hz - HD / 2 + 0.37, 0x888888, 0.3, 0.7, false);
  B.colorBox(0.04, 0.08, 0.04, hx + 1.1, f2y + 0.65, hz - HD / 2 + 0.37, 0x888888, 0.3, 0.7, false);
  // Mirror above dresser
  B.colorBox(0.7, 0.9, 0.04, hx + 0.8, f2y + 1.5, hz - HD / 2 + 0.3, 0xaaccdd, 0.05, 0.8, false);
  B.colorBox(0.8, 1.0, 0.06, hx + 0.8, f2y + 1.5, hz - HD / 2 + 0.28, trimColor, 0.85, 0.02, false);

  // --- MISC ITEMS ---
  // Potted plant on balcony
  B.colorBox(0.3, 0.3, 0.3, hx - 1.8, F + 0.58, hz + HD / 2 + 1.2, 0x774433, 0.9, 0.02, false);
  B.cyl(0.2, 0.15, 0.4, hx - 1.8, F + 0.93, hz + HD / 2 + 1.2, "woodDark");
  // Indoor plant near stair exit
  B.colorBox(0.25, 0.25, 0.25, hx - HW / 2 + 1.0, f2y + 0.12, hz + 1.5, 0x774433, 0.9, 0.02, false);
  B.cyl(0.15, 0.1, 0.3, hx - HW / 2 + 1.0, f2y + 0.4, hz + 1.5, "woodDark");
  // Laundry basket
  B.colorBox(0.5, 0.5, 0.4, hx - HW / 2 + 0.7, f2y + 0.25, hz - HD / 2 + 0.6, 0xddcc99, 0.95, 0, false);
  // Ceiling light 2F
  B.colorBox(0.5, 0.08, 0.5, hx + 1.5, f2y + F - 0.1, hz, 0xffeecc, 0.7, 0.1, false);
  // Ceiling light 1F
  B.colorBox(0.6, 0.08, 0.6, hx + 1.0, baseY1 + F - 0.1, hz, 0xffeecc, 0.7, 0.1, false);

  // Photo frames (on back wall, left of chimney)
  const houseFrameColor = getCustomMaterial(0xaa8855, 0.8, 0.1);
  const housePhotoTex = new THREE.TextureLoader().load('/assets/photos/thinhdeptrai.jpg');
  housePhotoTex.colorSpace = THREE.SRGBColorSpace;
  const housePhotoMat = new THREE.MeshStandardMaterial({ map: housePhotoTex, roughness: 0.3, metalness: 0.02 });
  // 1F photo (on left portion of back wall)
  const frame1a = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.06), houseFrameColor);
  frame1a.position.set(hx - 2, 2.4, hz - HD / 2 + 0.28);
  scene.add(frame1a);
  const photo1a = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.55), housePhotoMat);
  photo1a.position.set(hx - 2, 2.4, hz - HD / 2 + 0.32);
  scene.add(photo1a);
  // 2F photo (on left side of back wall, away from chimney)
  const frame2f = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.06), houseFrameColor);
  frame2f.position.set(hx - 1, F + 2.4, hz - HD / 2 + 0.28);
  scene.add(frame2f);
  const photo2f = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.65), housePhotoMat);
  photo2f.position.set(hx - 1, F + 2.4, hz - HD / 2 + 0.32);
  scene.add(photo2f);

  // === PORCH ===
  B.colorBox(HW + 1.5, 0.12, 2.5, hx, 0.24, hz + HD / 2 + 1.25, PALETTE.woodWarm, 0.82, 0.02, false);
  B.addCollider(hx - HW / 2 - 0.75, 0.15, hz + HD / 2, hx + HW / 2 + 0.75, 0.35, hz + HD / 2 + 2.5);
  // Porch columns (match door lintel height)
  const porchRoofY = doorTopY;
  B.colorBox(0.25, porchRoofY, 0.25, hx - 4.5, porchRoofY / 2, hz + HD / 2 + 2.2, 0xffffff, 0.85, 0.02, true);
  B.colorBox(0.25, porchRoofY, 0.25, hx + 4.5, porchRoofY / 2, hz + HD / 2 + 2.2, 0xffffff, 0.85, 0.02, true);
  B.colorBox(0.25, porchRoofY, 0.25, hx, porchRoofY / 2, hz + HD / 2 + 2.2, 0xffffff, 0.85, 0.02, true);
  // Porch roof (at door lintel height, with collider)
  B.colorBox(HW + 2, 0.15, 2.8, hx, porchRoofY + 0.08, hz + HD / 2 + 1.4, trimColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - 1, porchRoofY, hz + HD / 2, hx + HW / 2 + 1, porchRoofY + 0.2, hz + HD / 2 + 2.8);
  // Porch steps
  B.colorBox(3, 0.15, 0.5, hx, 0.15, hz + HD / 2 + 2.75, PALETTE.concreteDark, 0.9, 0.03, true);

  // === CHIMNEY (full-height hollow tube from cap to 1F fireplace) ===
  const chW = 1.2, chT = 0.15;
  const chTop = roofTopY + 2.5;
  const chBottom = 0.35;
  const chFullH = chTop - chBottom;
  const chCenterY = (chBottom + chTop) / 2;
  const brickColor = 0x884433;

  // Chimney exterior walls (full height from ground to top)
  // Back wall (against house back wall)
  B.colorBox(chW + 0.4, chFullH, chT, chX, chCenterY, chZ - chW / 2, brickColor, 0.85, 0.02, false);
  B.addCollider(chX - chW / 2 - 0.2, chBottom, chZ - chW / 2 - chT / 2, chX + chW / 2 + 0.2, chTop, chZ - chW / 2 + chT / 2);
  // Left side
  B.colorBox(chT, chFullH, chW, chX - chW / 2, chCenterY, chZ, brickColor, 0.85, 0.02, false);
  B.addCollider(chX - chW / 2 - chT / 2, chBottom, chZ - chW / 2, chX - chW / 2 + chT / 2, chTop, chZ + chW / 2);
  // Right side
  B.colorBox(chT, chFullH, chW, chX + chW / 2, chCenterY, chZ, brickColor, 0.85, 0.02, false);
  B.addCollider(chX + chW / 2 - chT / 2, chBottom, chZ - chW / 2, chX + chW / 2 + chT / 2, chTop, chZ + chW / 2);
  // Front wall (above fireplace opening, from mantel height to top)
  const mantelY = chBottom + 2.0;
  B.colorBox(chW + 0.4, chTop - mantelY, chT, chX, (mantelY + chTop) / 2, chZ + chW / 2, brickColor, 0.85, 0.02, false);
  B.addCollider(chX - chW / 2 - 0.2, mantelY, chZ + chW / 2 - chT / 2, chX + chW / 2 + 0.2, chTop, chZ + chW / 2 + chT / 2);

  // (interior is hollow - no lining, so you can see sky from below and fire from above)

  // Chimney top rim (open to sky - no cap, just a thin decorative rim)
  B.colorBox(chW + 0.3, 0.12, 0.08, chX, chTop + 0.06, chZ - chW / 2 - 0.04, 0x663322, 0.85, 0.02, false);
  B.colorBox(chW + 0.3, 0.12, 0.08, chX, chTop + 0.06, chZ + chW / 2 + 0.04, 0x663322, 0.85, 0.02, false);
  B.colorBox(0.08, 0.12, chW + 0.3, chX - chW / 2 - 0.04, chTop + 0.06, chZ, 0x663322, 0.85, 0.02, false);
  B.colorBox(0.08, 0.12, chW + 0.3, chX + chW / 2 + 0.04, chTop + 0.06, chZ, 0x663322, 0.85, 0.02, false);

  // === FIREPLACE (1F, open front niche facing into room) ===
  const fpFront = chZ + chW / 2 + 0.12;
  const fpOpenH = mantelY - chBottom;
  // Surround frame (border only - left pillar, right pillar, top beam)
  B.colorBox(0.15, fpOpenH, 0.15, chX - chW / 2 - 0.15, chBottom + fpOpenH / 2, fpFront, brickColor, 0.85, 0.02, false);
  B.colorBox(0.15, fpOpenH, 0.15, chX + chW / 2 + 0.15, chBottom + fpOpenH / 2, fpFront, brickColor, 0.85, 0.02, false);
  B.colorBox(chW + 0.6, 0.2, 0.15, chX, mantelY - 0.1, fpFront, brickColor, 0.85, 0.02, false);
  // Hearth stone (small, doesn't block view through shaft)
  B.colorBox(chW - chT * 2, 0.04, 0.3, chX, chBottom + 0.02, chZ + chW / 2 - 0.15, 0x555050, 0.9, 0.05, false);
  // Interior side linings (dark)
  B.colorBox(0.04, fpOpenH - 0.1, chW, chX - chW / 2 + chT / 2 + 0.03, chBottom + fpOpenH / 2, chZ, 0x222222, 0.95, 0, false);
  B.colorBox(0.04, fpOpenH - 0.1, chW, chX + chW / 2 - chT / 2 - 0.03, chBottom + fpOpenH / 2, chZ, 0x222222, 0.95, 0, false);
  // Mantel shelf
  B.colorBox(chW + 0.7, 0.12, 0.45, chX, mantelY, fpFront + 0.1, PALETTE.woodDark, 0.85, 0.02, true);
  // Hearth stone (in front)
  B.colorBox(chW + 0.8, 0.06, 0.5, chX, chBottom + 0.03, fpFront + 0.3, 0x7a7360, 0.9, 0.05, false);
  // Fire glow
  const fireMat = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 0.6, roughness: 0.9 });
  const fire = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.15), fireMat);
  fire.position.set(chX, chBottom + 0.3, chZ);
  scene.add(fire);
  // Logs on grate
  B.cyl(0.06, 0.06, 0.55, chX - 0.05, chBottom + 0.12, chZ + 0.1, "woodDark");
  B.cyl(0.05, 0.05, 0.5, chX + 0.1, chBottom + 0.18, chZ - 0.05, "woodOld");
  B.cyl(0.04, 0.04, 0.45, chX - 0.08, chBottom + 0.22, chZ, "wood");

  // === TV on left wall (1F, facing into room) ===
  const tvY = baseY1 + 2.0;
  B.colorBox(1.4, 0.8, 0.06, hx - HW / 2 + 0.06, tvY, hz + 0.5, 0x111111, 0.9, 0.5, false);
  B.colorBox(0.15, 0.3, 0.06, hx - HW / 2 + 0.06, tvY - 0.55, hz + 0.5, 0x222222, 0.5, 0.5, false);
  // TV stand shelf
  B.colorBox(1.0, 0.4, 0.35, hx - HW / 2 + 0.5, 0.55, hz + 0.5, trimColor, 0.85, 0.02, true);
}

// ========== BACKYARD KOI POND & GARDEN ==========
function buildBackyardGarden(B: MapBoxHelper, scene: THREE.Scene) {
  const gx = -48, gz = 38;

  // Garden ground (with collider to prevent sinking)
  B.colorBox(14, 0.15, 14, gx, 0.075, gz, 0x4a7a2c, 0.95, 0, false);
  B.addCollider(gx - 7, 0, gz - 7, gx + 7, 0.18, gz + 7);
  // Stone paving
  B.colorBox(10, 0.08, 10, gx, 0.04, gz, 0x99917a, 0.92, 0.03, false);

  // === KOI POND (round) ===
  const pondR = 3.0;
  const rimMat = getCustomMaterial(0x6b6355, 0.88, 0.05);
  const rimMesh = new THREE.Mesh(new THREE.CylinderGeometry(pondR + 0.4, pondR + 0.5, 0.35, 12), rimMat);
  rimMesh.position.set(gx, 0.18, gz);
  rimMesh.castShadow = true;
  scene.add(rimMesh);
  B.addCollider(gx - pondR - 0.5, 0, gz - pondR - 0.5, gx + pondR + 0.5, 0.4, gz + pondR + 0.5);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(pondR, pondR, 0.05, 16), getCustomMaterial(0x2277aa, 0.1, 0.4));
  water.position.set(gx, 0.15, gz);
  scene.add(water);

  // Lily pads + flowers
  const lilyMat = getCustomMaterial(0x2d8c2d, 0.85, 0);
  for (const la of [0.3, 1.5, 2.8, 4.2, 5.5]) {
    const lr = pondR * 0.5 + Math.sin(la * 2) * 0.4;
    const lily = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 8), lilyMat);
    lily.position.set(gx + Math.cos(la) * lr, 0.18, gz + Math.sin(la) * lr);
    scene.add(lily);
  }
  // Pink lotus flowers
  for (const la of [1.0, 3.5]) {
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), getCustomMaterial(0xff88aa, 0.7, 0));
    fl.position.set(gx + Math.cos(la) * 1.5, 0.24, gz + Math.sin(la) * 1.5);
    fl.scale.set(1, 0.6, 1);
    scene.add(fl);
  }

  // Koi fish
  for (let i = 0; i < 7; i++) {
    const fc = [0xff6633, 0xffffff, 0xcc2222, 0xff9900, 0xffcc66, 0xff4444, 0xffaa33][i];
    const fish = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.07), getCustomMaterial(fc, 0.5, 0.1));
    const a = (i / 7) * Math.PI * 2 + 0.3;
    fish.position.set(gx + Math.cos(a) * (1.0 + (i % 3) * 0.3), 0.16, gz + Math.sin(a) * (1.0 + (i % 3) * 0.3));
    fish.rotation.y = a + Math.PI / 2;
    scene.add(fish);
  }

  // === HON NON BO (stylized miniature mountain landscape) ===
  const hnbX = gx + 0.5, hnbZ = gz;
  const rockMat1 = getCustomMaterial(0x6a7a8a, 0.85, 0.05);
  const rockMat2 = getCustomMaterial(0x5a6a7a, 0.88, 0.04);
  const rockMat3 = getCustomMaterial(0x7a8a95, 0.82, 0.06);
  // Island platform (with collider)
  const islandBase = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 0.4, 8), rockMat1);
  islandBase.position.set(hnbX, 0.35, hnbZ);
  islandBase.castShadow = true;
  scene.add(islandBase);
  B.addCollider(hnbX - 1.2, 0.1, hnbZ - 1.2, hnbX + 1.2, 0.6, hnbZ + 1.2);
  // Main mountain peak (with collider)
  const mainPeak = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.5, 1.8, 7), rockMat2);
  mainPeak.position.set(hnbX, 1.45, hnbZ - 0.1);
  mainPeak.castShadow = true;
  scene.add(mainPeak);
  B.addCollider(hnbX - 0.5, 0.5, hnbZ - 0.6, hnbX + 0.5, 2.4, hnbZ + 0.4);
  // Second peak (with collider)
  const peak2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.4, 1.3, 6), rockMat3);
  peak2.position.set(hnbX + 0.4, 1.2, hnbZ + 0.25);
  peak2.castShadow = true;
  scene.add(peak2);
  B.addCollider(hnbX + 0.0, 0.5, hnbZ - 0.15, hnbX + 0.8, 1.9, hnbZ + 0.65);
  // Third peak (with collider)
  const peak3 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.3, 0.9, 5), rockMat1);
  peak3.position.set(hnbX - 0.35, 1.0, hnbZ + 0.15);
  peak3.castShadow = true;
  scene.add(peak3);
  B.addCollider(hnbX - 0.65, 0.5, hnbZ - 0.15, hnbX - 0.05, 1.5, hnbZ + 0.45);
  // Layered rocks
  for (const [rx, ry, rz, rs] of [[0.3, 0.4, 0.4, 0.25], [-0.4, 0.35, -0.3, 0.2], [0.1, 0.38, -0.5, 0.18], [-0.2, 0.42, 0.5, 0.22]] as [number, number, number, number][]) {
    const rock = new THREE.Mesh(new THREE.SphereGeometry(rs, 6, 5), rockMat2);
    rock.position.set(hnbX + rx, ry, hnbZ + rz);
    rock.scale.set(1.3, 0.6, 1.1);
    rock.castShadow = true;
    scene.add(rock);
  }
  // Moss
  const mossMat = getCustomMaterial(0x3a8a3a, 0.9, 0);
  for (const [mx, my, mz] of [[0.15, 0.6, -0.05], [-0.1, 0.55, 0.2], [0.35, 0.55, 0.15]] as [number, number, number][]) {
    const moss = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), mossMat);
    moss.position.set(hnbX + mx, my, hnbZ + mz);
    moss.scale.set(1.5, 0.3, 1.5);
    scene.add(moss);
  }
  // Bonsai trees
  const bonsaiTrunkMat = getCustomMaterial(0x5a4030, 0.85, 0.02);
  const bonsaiLeafMat = getCustomMaterial(0x1a6b1a, 0.82, 0);
  for (const [tx, ty, tz, th, cr] of [[0.08, 2.35, -0.1, 0.3, 0.18], [0.42, 1.85, 0.25, 0.25, 0.14], [-0.3, 0.6, -0.35, 0.2, 0.1]] as [number, number, number, number, number][]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, th, 4), bonsaiTrunkMat);
    trunk.position.set(hnbX + tx, ty + th / 2, hnbZ + tz);
    scene.add(trunk);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(cr, 6, 5), bonsaiLeafMat);
    canopy.position.set(hnbX + tx, ty + th + cr * 0.5, hnbZ + tz);
    canopy.scale.set(1.2, 0.7, 1.2);
    scene.add(canopy);
  }
  // Waterfall
  const waterfallMat = new THREE.MeshStandardMaterial({ color: 0x44ccdd, transparent: true, opacity: 0.6, roughness: 0.2, metalness: 0.1 });
  const waterfall = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.8), waterfallMat);
  waterfall.position.set(hnbX + 0.15, 1.0, hnbZ - 0.35);
  waterfall.rotation.y = -0.3;
  scene.add(waterfall);
  // Mini pond at waterfall base
  const miniPond = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 8), getCustomMaterial(0x33aabb, 0.1, 0.3));
  miniPond.position.set(hnbX + 0.15, 0.57, hnbZ - 0.35);
  scene.add(miniPond);

  // === FLAT KOI POND (separate small pond near garden edge) ===
  const kpX = gx + 4.5, kpZ = gz - 1.5;
  const kpR = 1.8;
  // Stone border
  const kpRimMesh = new THREE.Mesh(new THREE.CylinderGeometry(kpR + 0.25, kpR + 0.35, 0.25, 10), getCustomMaterial(0x6b6355, 0.88, 0.05));
  kpRimMesh.position.set(kpX, 0.13, kpZ);
  kpRimMesh.castShadow = true;
  scene.add(kpRimMesh);
  B.addCollider(kpX - kpR - 0.35, 0, kpZ - kpR - 0.35, kpX + kpR + 0.35, 0.3, kpZ + kpR + 0.35);
  // Water surface
  const kpWater = new THREE.Mesh(new THREE.CylinderGeometry(kpR, kpR, 0.04, 12), getCustomMaterial(0x1a6699, 0.08, 0.35));
  kpWater.position.set(kpX, 0.1, kpZ);
  scene.add(kpWater);
  // Lily pads
  for (const la of [0.5, 2.0, 3.8, 5.0]) {
    const lr = kpR * 0.5 + Math.sin(la) * 0.3;
    const lily = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 8), getCustomMaterial(0x2d8c2d, 0.85, 0));
    lily.position.set(kpX + Math.cos(la) * lr, 0.13, kpZ + Math.sin(la) * lr);
    scene.add(lily);
  }
  // Colorful koi fish (big, visible, eye-catching)
  const koiColors = [0xff4422, 0xffffff, 0xffaa00, 0xff6688, 0xffcc44, 0xcc2200, 0xff8844, 0xffeecc];
  for (let i = 0; i < koiColors.length; i++) {
    const kMat = getCustomMaterial(koiColors[i], 0.35, 0.15);
    const angle = (i / koiColors.length) * Math.PI * 2 + i * 0.2;
    const r = 0.4 + (i % 3) * 0.35;
    const fx = kpX + Math.cos(angle) * r;
    const fz = kpZ + Math.sin(angle) * r;
    // Fish body (elongated)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, 0.1), kMat);
    body.position.set(fx, 0.12, fz);
    body.rotation.y = angle + Math.PI / 2;
    scene.add(body);
    // Tail fin (wider)
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.14), kMat);
    tail.position.set(fx - Math.cos(angle + Math.PI / 2) * 0.15, 0.12, fz - Math.sin(angle + Math.PI / 2) * 0.15);
    tail.rotation.y = angle + Math.PI / 2;
    scene.add(tail);
    // White spot on some fish
    if (i % 3 === 0) {
      const spot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.055, 0.06), getCustomMaterial(0xffffff, 0.4, 0.1));
      spot.position.set(fx + Math.cos(angle + Math.PI / 2) * 0.05, 0.125, fz + Math.sin(angle + Math.PI / 2) * 0.05);
      spot.rotation.y = angle + Math.PI / 2;
      scene.add(spot);
    }
  }

  // === WOODEN BRIDGE over main pond ===
  const bridgeLen = pondR * 2 + 0.5;
  B.colorBox(1.2, 0.12, bridgeLen, gx - 1.6, 0.42, gz, PALETTE.woodWarm, 0.82, 0.02, false);
  B.addCollider(gx - 2.2, 0.3, gz - bridgeLen / 2, gx - 1.0, 0.55, gz + bridgeLen / 2);
  for (let i = 0; i < 6; i++) {
    const bz = gz - bridgeLen / 2 + 0.4 + i * (bridgeLen - 0.8) / 5;
    B.colorBox(0.04, 0.55, 0.04, gx - 2.15, 0.73, bz, PALETTE.woodDark, 0.85, 0.02, false);
    B.colorBox(0.04, 0.55, 0.04, gx - 1.05, 0.73, bz, PALETTE.woodDark, 0.85, 0.02, false);
  }
  B.colorBox(0.04, 0.04, bridgeLen - 0.3, gx - 2.15, 1.03, gz, PALETTE.woodDark, 0.85, 0.02, false);
  B.colorBox(0.04, 0.04, bridgeLen - 0.3, gx - 1.05, 1.03, gz, PALETTE.woodDark, 0.85, 0.02, false);

  // === STONE LANTERNS ===
  for (const [lx, lz] of [[gx + 4.0, gz - 3.5], [gx - 4.5, gz + 3.5]] as [number, number][]) {
    B.colorBox(0.4, 0.2, 0.4, lx, 0.1, lz, 0x7a7360, 0.9, 0.05, true);
    B.colorBox(0.18, 0.8, 0.18, lx, 0.6, lz, 0x7a7360, 0.9, 0.05, false);
    B.colorBox(0.45, 0.35, 0.45, lx, 1.2, lz, 0x7a7360, 0.9, 0.05, false);
    B.colorBox(0.3, 0.2, 0.3, lx, 1.2, lz, 0xffeecc, 0.3, 0, false);
    B.colorBox(0.55, 0.1, 0.55, lx, 1.45, lz, 0x6b6355, 0.9, 0.05, false);
    B.colorBox(0.35, 0.12, 0.35, lx, 1.55, lz, 0x6b6355, 0.9, 0.05, false);
  }

  // Bamboo clusters
  for (const [bx, bz, bh] of [[gx + 5.5, gz - 2, 3.5], [gx + 5.8, gz - 1.5, 4.0], [gx + 5.3, gz - 1, 3.2], [gx - 5.5, gz + 2, 3.0], [gx - 5.2, gz + 2.5, 3.5]] as [number, number, number][]) {
    B.cyl(0.04, 0.05, bh, bx, bh / 2, bz, "woodDark");
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.3, 5, 4), getCustomMaterial(0x2a7a2a, 0.85, 0));
    leaves.position.set(bx, bh + 0.15, bz);
    leaves.scale.set(0.8, 1.2, 0.8);
    scene.add(leaves);
  }

  // Stepping stones
  for (let i = 0; i < 5; i++) {
    B.colorBox(0.7, 0.06, 0.7, gx + 6.5 - i * 2.5, 0.03, gz + 5.5, 0x88816a, 0.92, 0.03, false);
  }

  // Stone bench
  B.colorBox(2.0, 0.12, 0.55, gx + 4, 0.5, gz + 4, 0x7a7360, 0.9, 0.05, true);
  B.colorBox(0.35, 0.45, 0.55, gx + 3.1, 0.22, gz + 4, 0x7a7360, 0.9, 0.05, false);
  B.colorBox(0.35, 0.45, 0.55, gx + 4.9, 0.22, gz + 4, 0x7a7360, 0.9, 0.05, false);

  // Decorative edge rocks
  const dRockMat = getCustomMaterial(0x6b6355, 0.95, 0.02);
  for (const [rx, ry, rz, rs] of [[gx + 3.8, 0.15, gz - 4.0, 0.3], [gx - 3.5, 0.2, gz - 3.8, 0.35], [gx + 2.0, 0.12, gz + 4.5, 0.25]] as [number, number, number, number][]) {
    const rock = new THREE.Mesh(new THREE.SphereGeometry(rs, 6, 5), dRockMat);
    rock.position.set(rx, ry, rz);
    rock.scale.set(1.2, 0.5, 1);
    rock.castShadow = true;
    scene.add(rock);
  }

}


// ========== FERRIS WHEEL ==========
// Hierarchy: ferrisRoot -> wheelPivot -> [rings, spokes, cabinMounts -> hinge -> cabin]
// Cabins are mounted OUTSIDE the ring with CLEARANCE so they never intersect the blue ring.
// Hinge groups counter-rotate so cabins stay upright during wheel rotation.
function buildFerrisWheel(scene: THREE.Scene, colliders: THREE.Box3[]): THREE.Group {
  const wheelPivot = new THREE.Group();
  const fwX = -10, fwZ = 34;
  const RING_R = 8;
  const CLEARANCE = 0.5;
  const MOUNT_R = RING_R + CLEARANCE;
  const numCabins = 8;
  const hubY = RING_R + 4;

  const frameMat = getCustomMaterial(0x2255bb, 0.35, 0.5);
  const supportMat = getCustomMaterial(0xddaa22, 0.4, 0.4);
  const spokeMat = getCustomMaterial(0xcccccc, 0.3, 0.5);
  const hubMat = getCustomMaterial(0xcc2222, 0.4, 0.5);
  const cabinColors = [0xff3333, 0x33bb33, 0xffcc00, 0x3366ff, 0xff66aa, 0xff8800, 0x33cccc, 0x9933ff];

  // === GROUND PLATFORM ===
  const platW = 14, platD = 10;
  const plat = new THREE.Mesh(new THREE.BoxGeometry(platW, 0.3, platD), getCustomMaterial(PALETTE.concreteDark, 0.85, 0.03));
  plat.position.set(fwX, 0.15, fwZ);
  plat.castShadow = true;
  scene.add(plat);
  colliders.push(new THREE.Box3(new THREE.Vector3(fwX - platW / 2, 0, fwZ - platD / 2), new THREE.Vector3(fwX + platW / 2, 0.35, fwZ + platD / 2)));

  // === A-FRAME SUPPORTS (legs only, no cross braces blocking cabins) ===
  const legSpread = 4.0;
  const legThick = 0.4;
  for (const zOff of [-2.2, 2.2]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(legThick, hubY + 2, legThick), supportMat);
      leg.position.set(fwX + side * legSpread * 0.5, hubY / 2, fwZ + zOff);
      leg.rotation.z = side * -0.17;
      leg.castShadow = true;
      scene.add(leg);
    }
  }

  // === WHEEL PIVOT (rotates around Z axis) ===
  wheelPivot.position.set(fwX, hubY, fwZ);
  scene.add(wheelPivot);

  // Hub
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 4.8, 12), hubMat);
  hub.rotation.x = Math.PI / 2;
  hub.castShadow = true;
  wheelPivot.add(hub);

  // Two rings (left/right, separated along Z so cabins sit between them)
  const ringThick = 0.12;
  for (const zOff of [-1.8, 1.8]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, ringThick, 8, 48), frameMat);
    ring.position.set(0, 0, zOff);
    ring.castShadow = true;
    wheelPivot.add(ring);
  }

  // Spokes (from hub to ring)
  for (let i = 0; i < numCabins * 2; i++) {
    const angle = (i / (numCabins * 2)) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, RING_R * 2, 0.08), spokeMat);
    spoke.rotation.z = angle;
    wheelPivot.add(spoke);
  }

  // === CABIN MOUNTS (positioned OUTSIDE the ring by CLEARANCE) ===
  const cabW = 1.8, cabH = 2.2, cabD = 1.4;
  for (let i = 0; i < numCabins; i++) {
    const angle = (i / numCabins) * Math.PI * 2;

    // Mount point: on the ring, rotates with wheel
    const mount = new THREE.Group();
    mount.position.set(Math.cos(angle) * MOUNT_R, Math.sin(angle) * MOUNT_R, 0);
    wheelPivot.add(mount);

    // Hinge arm (visual connector from ring to cabin)
    const hingeArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, CLEARANCE + 0.3, 0.06), hubMat);
    hingeArm.position.set(0, 0.15, 0);
    mount.add(hingeArm);

    // Hinge pivot (counter-rotates to keep cabin upright)
    const hinge = new THREE.Group();
    hinge.position.set(0, -CLEARANCE * 0.5, 0);
    mount.add(hinge);

    const color = cabinColors[i % cabinColors.length];
    const cMat = getCustomMaterial(color, 0.5, 0.3);
    cMat.side = THREE.DoubleSide;
    const darker = new THREE.Color(color).multiplyScalar(0.65).getHex();
    const cMatWall = getCustomMaterial(darker, 0.55, 0.25);
    cMatWall.side = THREE.DoubleSide;

    // Floor (thick)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(cabW, 0.2, cabD), cMat);
    floor.position.set(0, -cabH / 2, 0);
    floor.castShadow = true;
    hinge.add(floor);

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(cabW + 0.1, 0.15, cabD + 0.1), cMat);
    roof.position.set(0, cabH / 2, 0);
    hinge.add(roof);

    // Back wall (full height)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(cabW + 0.1, cabH, 0.15), cMatWall);
    backWall.position.set(0, 0, -cabD / 2);
    hinge.add(backWall);

    // Left wall (full height)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.15, cabH, cabD + 0.1), cMatWall);
    leftWall.position.set(-cabW / 2, 0, 0);
    hinge.add(leftWall);

    // Right wall (full height)
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.15, cabH, cabD + 0.1), cMatWall);
    rightWall.position.set(cabW / 2, 0, 0);
    hinge.add(rightWall);

    // Front is OPEN (props can enter)

    // Seat bench inside
    const seat = new THREE.Mesh(new THREE.BoxGeometry(cabW * 0.7, 0.1, cabD * 0.3), cMat);
    seat.position.set(0, -cabH / 2 + 0.35, -cabD / 4);
    hinge.add(seat);

    // Light
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffeeaa, emissiveIntensity: 0.4 }));
    light.position.set(0, cabH / 2 - 0.12, 0);
    hinge.add(light);
  }

  // Dynamic cabin colliders (floor + roof, updated each frame in GameManager)
  for (let i = 0; i < numCabins; i++) {
    const a = (i / numCabins) * Math.PI * 2;
    const cx = fwX + Math.cos(a) * MOUNT_R;
    const cy = hubY + Math.sin(a) * MOUNT_R;
    colliders.push(new THREE.Box3(new THREE.Vector3(cx - cabW / 2, cy - cabH / 2 - 0.15, fwZ - cabD / 2), new THREE.Vector3(cx + cabW / 2, cy - cabH / 2 + 0.08, fwZ + cabD / 2)));
    colliders.push(new THREE.Box3(new THREE.Vector3(cx - cabW / 2 - 0.1, cy + cabH / 2 - 0.1, fwZ - cabD / 2 - 0.1), new THREE.Vector3(cx + cabW / 2 + 0.1, cy + cabH / 2 + 0.1, fwZ + cabD / 2 + 0.1)));
  }

  // Ground shadow
  const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(platW + 2, platD + 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 }));
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(fwX, 0.02, fwZ);
  scene.add(shadowMesh);

  return wheelPivot;
}

function buildBackgroundVista(B: MapBoxHelper, scene: THREE.Scene) {
  // Distant containers
  B.colorBox(6.5, 2.6, 2.5, 68, 1.3, 10, 0x884422, 0.7, 0.2, false);
  B.colorBox(6.5, 2.6, 2.5, 68, 1.3, 14, 0x226688, 0.7, 0.2, false);
  B.colorBox(6.5, 2.6, 2.5, 69, 3.9, 12, 0x448822, 0.7, 0.2, false);

  // Distant buildings (moved outside play area to avoid fence overlap)
  B.colorBox(15, 10, 10, -68, 5, -48, 0x999088, 0.9, 0.05, false);
  B.colorBox(10, 14, 8, -75, 7, -45, 0x8a8278, 0.9, 0.05, false);
  B.colorBox(8, 8, 12, 75, 4, 25, 0x907868, 0.9, 0.05, false);

  // Ship silhouette on water
  const shipMat = getCustomMaterial(0x556070, 0.7, 0.3);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(18, 3, 5), shipMat);
  hull.position.set(40, 0.5, 75);
  scene.add(hull);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), getCustomMaterial(0xeeeeee, 0.8, 0.1));
  cabin.position.set(45, 3, 75);
  scene.add(cabin);
}
