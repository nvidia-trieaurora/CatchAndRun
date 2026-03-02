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

  // Warehouse concrete floor
  B.box(46, 0.12, 36, 0, 0.06, 0, "concreteFloor", false);
  // Container yard asphalt
  B.box(32, 0.1, 30, 40, 0.04, -10, "asphalt", false);
  // Dock planks
  B.box(70, 0.15, 8, 15, 0.07, 38, "dockWood", false);
  // Construction zone ground
  B.box(20, 0.1, 20, -35, 0.04, -22, "concreteDark", false);

  // ===== BOUNDARY WALLS (prevent leaving play area) =====
  // Map bounds: x from -55 to 63, z from -43 to 47
  const BW = 1.0, BH = 6;
  const MAP_MIN_X = -55, MAP_MAX_X = 63;
  const MAP_MIN_Z = -43, MAP_MAX_Z = 47;
  const MAP_WIDTH = MAP_MAX_X - MAP_MIN_X;
  const MAP_DEPTH = MAP_MAX_Z - MAP_MIN_Z;
  const MAP_CENTER_X = (MAP_MIN_X + MAP_MAX_X) / 2;
  const MAP_CENTER_Z = (MAP_MIN_Z + MAP_MAX_Z) / 2;

  // North wall (z = MAP_MIN_Z)
  B.colorBox(MAP_WIDTH + BW * 2, BH, BW, MAP_CENTER_X, BH / 2, MAP_MIN_Z, PALETTE.concreteDark, 0.9, 0.03, true);
  // South wall (z = MAP_MAX_Z)
  B.colorBox(MAP_WIDTH + BW * 2, BH, BW, MAP_CENTER_X, BH / 2, MAP_MAX_Z, PALETTE.concreteDark, 0.9, 0.03, true);
  // West wall (x = MAP_MIN_X)
  B.colorBox(BW, BH, MAP_DEPTH + BW * 2, MAP_MIN_X, BH / 2, MAP_CENTER_Z, PALETTE.concreteDark, 0.9, 0.03, true);
  // East wall (x = MAP_MAX_X)
  B.colorBox(BW, BH, MAP_DEPTH + BW * 2, MAP_MAX_X, BH / 2, MAP_CENTER_Z, PALETTE.concreteDark, 0.9, 0.03, true);

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

  // Fence top colliders to prevent jumping over (all 4 sides)
  B.addCollider(MAP_MIN_X - 1, BH, MAP_MIN_Z - 1, MAP_MAX_X + 1, BH + fenceH + 1, MAP_MIN_Z + 0.5);
  B.addCollider(MAP_MIN_X - 1, BH, MAP_MAX_Z - 0.5, MAP_MAX_X + 1, BH + fenceH + 1, MAP_MAX_Z + 1);
  B.addCollider(MAP_MIN_X - 1, BH, MAP_MIN_Z - 1, MAP_MIN_X + 0.5, BH + fenceH + 1, MAP_MAX_Z + 1);
  B.addCollider(MAP_MAX_X - 0.5, BH, MAP_MIN_Z - 1, MAP_MAX_X + 1, BH + fenceH + 1, MAP_MAX_Z + 1);
}

// ========== ZONE 2: WAREHOUSE HALL ==========
function buildWarehouseHall(B: MapBoxHelper) {
  const W = 46, H = 8, D = 36;

  // Walls with door openings
  B.box(W, H, 0.35, 0, H / 2, -D / 2, "concrete");         // back
  B.box(14, H, 0.35, -16, H / 2, D / 2, "concrete");        // front-left
  B.box(14, H, 0.35, 16, H / 2, D / 2, "concrete");         // front-right
  B.box(18, 2.5, 0.35, 0, H - 1.25, D / 2, "concrete");     // front-top beam
  B.box(0.35, H, D, -W / 2, H / 2, 0, "concrete");          // left
  B.box(0.35, H, 12, W / 2, H / 2, -12, "concrete");        // right-top
  B.box(0.35, H, 8, W / 2, H / 2, 14, "concrete");          // right-bottom
  B.box(0.35, 2.5, 16, W / 2, H - 1.25, 2, "concrete");     // right beam

  // Hazard stripe on door frame (visual + full-height collider so no props crawl under)
  B.colorBox(18.1, 0.3, 0.36, 0, 1.5, D / 2, PALETTE.accentYellow, 0.7, 0.1, false);
  B.addCollider(-9, 0, D / 2 - 0.2, 9, 2.0, D / 2 + 0.2);

  // Roof panels (visual only - no individual collision to avoid gap issues)
  for (let i = 0; i < 5; i++) {
    const rz = -D / 2 + 4 + i * (D / 5);
    const shade = i % 2 === 0 ? 0x7a7570 : 0x888380;
    B.colorBox(W + 1, 0.15, D / 5 + 0.5, 0, H + 0.08, rz, shade, 0.55, 0.35, false);
  }
  // ONE solid roof collider covering the entire roof - reliable, no gaps
  // min.y=H=8 ensures feetY=8 when standing; thickness 0.4 prevents tunneling
  B.addCollider(-W / 2 - 0.5, H, -D / 2 - 0.5, W / 2 + 0.5, H + 0.4, D / 2 + 0.5);

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
  B.colorBox(0.06, 3.8, 0.06, x - 0.9, 1.9, z - 0.55, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(0.06, 3.8, 0.06, x + 0.9, 1.9, z - 0.55, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(0.06, 3.8, 0.06, x - 0.9, 1.9, z + 0.55, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(0.06, 3.8, 0.06, x + 0.9, 1.9, z + 0.55, PALETTE.steelDark, 0.5, 0.5, false);
  B.addCollider(x - 1.0, 0, z - 0.65, x + 1.0, 3.8, z + 0.65);
  B.box(2.0, 0.06, 1.2, x, 1.3, z, "wood", false);
  B.box(2.0, 0.06, 1.2, x, 2.6, z, "wood", false);
  B.colorBox(2.0, 0.04, 0.04, x, 0.5, z - 0.55, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(2.0, 0.04, 0.04, x, 0.5, z + 0.55, PALETTE.steelDark, 0.5, 0.5, false);
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
  B.addCollider(-15, 4.0, -17.5, 15, 5.0, -17.1);
  B.addCollider(-15, 4.0, -15.9, 15, 5.0, -15.5);
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
  const lampPositions = [[-25, 32], [0, 32], [25, 32], [52, 0], [-32, -15], [50, -20]];
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

  // Vertical support columns
  B.colorBox(0.15, ROOF_Y + 0.5, 0.15, stairX - 1.6, (ROOF_Y + 0.5) / 2, stairStartZ, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(0.15, ROOF_Y + 0.5, 0.15, stairX + 1.6, (ROOF_Y + 0.5) / 2, stairStartZ, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(0.15, ROOF_Y + 0.5, 0.15, stairX - 1.6, (ROOF_Y + 0.5) / 2, stairStartZ + numSteps * stepDZ, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(0.15, ROOF_Y + 0.5, 0.15, stairX + 1.6, (ROOF_Y + 0.5) / 2, stairStartZ + numSteps * stepDZ, PALETTE.steelDark, 0.5, 0.5, false);

  // Walkable step boxes — each step is a solid box whose TOP SURFACE is at (i+1)*stepH
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

  // Railing posts every 3 steps
  for (let i = 0; i < numSteps; i += 3) {
    const postY = (i + 1) * stepH + 0.6;
    const postZ = stairStartZ + i * stepDZ;
    B.colorBox(0.06, 1.2, 0.06, stairX - stairW / 2 - 0.1, postY, postZ, PALETTE.steelLight, 0.5, 0.5, false);
  }
  // Continuous railing bar
  B.colorBox(0.05, 0.06, numSteps * stepDZ, stairX - stairW / 2 - 0.1, ROOF_Y / 2 + 1, stairStartZ + (numSteps * stepDZ) / 2, PALETTE.steelLight, 0.5, 0.5, false);

  // Hazard stripe at bottom of staircase
  B.colorBox(stairW, 0.02, 0.2, stairX, stepH + 0.01, stairStartZ - 0.1, PALETTE.accentYellow, 0.7, 0.1, false);

  // ===== EAST SIDE FIRE-ESCAPE STAIRCASE (right wall, x=26) =====
  const stairX2 = 26;
  const stairStartZ2 = 15;
  const numSteps2 = 21;

  B.colorBox(0.15, ROOF_Y + 0.5, 0.15, stairX2 - 1.6, (ROOF_Y + 0.5) / 2, stairStartZ2, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(0.15, ROOF_Y + 0.5, 0.15, stairX2 + 1.6, (ROOF_Y + 0.5) / 2, stairStartZ2, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(0.15, ROOF_Y + 0.5, 0.15, stairX2 - 1.6, (ROOF_Y + 0.5) / 2, stairStartZ2 - numSteps2 * stepDZ, PALETTE.steelDark, 0.5, 0.5, false);
  B.colorBox(0.15, ROOF_Y + 0.5, 0.15, stairX2 + 1.6, (ROOF_Y + 0.5) / 2, stairStartZ2 - numSteps2 * stepDZ, PALETTE.steelDark, 0.5, 0.5, false);

  for (let i = 0; i < numSteps2; i++) {
    const boxH2 = stepH;
    const centerY2 = i * stepH + boxH2 / 2;
    const centerZ2 = stairStartZ2 - i * stepDZ - stepDZ / 2;
    B.colorBox(stairW, boxH2, stepDZ, stairX2, centerY2, centerZ2, PALETTE.steel, 0.5, 0.5, true);
  }

  const landingZ2 = stairStartZ2 - (numSteps2 - 1) * stepDZ - stepDZ / 2;
  B.colorBox(7, 0.2, stepDZ + 0.5, stairX2 - 2, ROOF_Y + 0.15, landingZ2, PALETTE.steel, 0.5, 0.5, true);

  for (let i = 0; i < numSteps2; i += 3) {
    const postY2 = (i + 1) * stepH + 0.6;
    const postZ2 = stairStartZ2 - i * stepDZ;
    B.colorBox(0.06, 1.2, 0.06, stairX2 + stairW / 2 + 0.1, postY2, postZ2, PALETTE.steelLight, 0.5, 0.5, false);
  }
  B.colorBox(0.05, 0.06, numSteps2 * stepDZ, stairX2 + stairW / 2 + 0.1, ROOF_Y / 2 + 1, stairStartZ2 - (numSteps2 * stepDZ) / 2, PALETTE.steelLight, 0.5, 0.5, false);
  B.colorBox(stairW, 0.02, 0.2, stairX2, stepH + 0.01, stairStartZ2 + 0.1, PALETTE.accentYellow, 0.7, 0.1, false);

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

  // ===== PIPE BRIDGE across warehouse exterior (walkable) =====
  B.colorBox(1.5, 0.12, 20, -24, 3.5, 22, PALETTE.steel, 0.5, 0.5, true);
  // Railing
  B.colorBox(0.05, 0.8, 20, -24.7, 4.0, 22, PALETTE.steelLight, 0.5, 0.5, false);
  B.colorBox(0.05, 0.8, 20, -23.3, 4.0, 22, PALETTE.steelLight, 0.5, 0.5, false);
  // Support pillars (with colliders)
  B.colorBox(0.2, 3.5, 0.2, -24, 1.75, 14, PALETTE.steelDark, 0.5, 0.5, true);
  B.colorBox(0.2, 3.5, 0.2, -24, 1.75, 22, PALETTE.steelDark, 0.5, 0.5, true);
  B.colorBox(0.2, 3.5, 0.2, -24, 1.75, 30, PALETTE.steelDark, 0.5, 0.5, true);

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
  // Roof panels
  B.colorBox(4.8, 0.08, 4.8, gzX, 3.1, gzZ, PALETTE.woodWarm, 0.85, 0.02, false);
  // Bench inside
  B.colorBox(3, 0.06, 0.4, gzX, 0.45, gzZ - 1.2, PALETTE.woodWarm, 0.85, 0.02, false);
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

// ========== FERRIS WHEEL ==========
function buildFerrisWheel(scene: THREE.Scene, colliders: THREE.Box3[]): THREE.Group {
  const group = new THREE.Group();
  const R = 5;
  const hubMat = getCustomMaterial(PALETTE.steelDark, 0.4, 0.6);
  const spokeMat = getCustomMaterial(PALETTE.steel, 0.5, 0.5);
  const cabinColors = [PALETTE.containerRed, PALETTE.containerBlue, PALETTE.containerYlow, PALETTE.containerGreen];

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 10), hubMat);
  hub.rotation.x = Math.PI / 2;
  group.add(hub);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 8, 32), spokeMat);
  group.add(rim);

  const numCabins = 8;
  for (let i = 0; i < numCabins; i++) {
    const angle = (i / numCabins) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, R * 2, 0.05), spokeMat);
    spoke.rotation.z = angle;
    group.add(spoke);

    const cabinG = new THREE.Group();
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.4),
      getCustomMaterial(cabinColors[i % cabinColors.length], 0.7, 0.2)
    );
    cabin.castShadow = true;
    cabinG.add(cabin);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 4), hubMat);
    bar.position.y = 0.42;
    cabinG.add(bar);
    cabinG.position.set(Math.cos(angle) * R, Math.sin(angle) * R, 0);
    group.add(cabinG);
  }

  // A-frame legs
  const legH = R + 1.5;
  const legMat = getCustomMaterial(PALETTE.steelDark, 0.5, 0.5);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, legH, 0.18), legMat);
  legL.position.set(0, -legH / 2 + R, -1.8);
  legL.rotation.x = 0.12;
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, legH, 0.18), legMat);
  legR.position.set(0, -legH / 2 + R, 1.8);
  legR.rotation.x = -0.12;
  group.add(legR);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 4), legMat);
  cross.position.set(0, R * 0.2, 0);
  group.add(cross);

  const fwX = -10, fwZ = 32;
  group.position.set(fwX, R + 1.5, fwZ);
  scene.add(group);

  // Base colliders for ferris wheel legs
  colliders.push(
    new THREE.Box3(new THREE.Vector3(fwX - 0.3, 0, fwZ - 2.2), new THREE.Vector3(fwX + 0.3, 3, fwZ - 1.4)),
    new THREE.Box3(new THREE.Vector3(fwX - 0.3, 0, fwZ + 1.4), new THREE.Vector3(fwX + 0.3, 3, fwZ + 2.2)),
  );

  return group;
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
