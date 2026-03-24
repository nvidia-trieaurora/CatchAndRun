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

function makeSignTextMesh(
  text: string, width: number, height: number,
  fontSize: number, textColor: string, bgColor: string | null,
  fontWeight = "bold", fontFamily = "sans-serif"
): THREE.Mesh {
  const res = 4;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * 100 * res);
  canvas.height = Math.round(height * 100 * res);
  const ctx = canvas.getContext("2d")!;

  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.fillStyle = textColor;
  ctx.font = `${fontWeight} ${fontSize * res}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: !bgColor });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.castShadow = false;
  return mesh;
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
  buildDocksideMiniMart(B, scene);
  buildDocksideCafeBar(B, scene);

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
  // Construction zone ground (expanded for redesigned zone)
  B.box(24, 0.1, 24, -35, 0.04, -22, "concreteDark", false);
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

// ========== ZONE 5: CONSTRUCTION ZONE (Stylized Fortnite) ==========
function buildConstructionZone(B: MapBoxHelper) {
  const cx = -35, cz = -22;
  const scene = (B as any).scene as THREE.Scene;

  const CZ = {
    yellow:   PALETTE.scaffoldYellow,
    steel:    PALETTE.steelDark,
    concrete: 0x9a9590,
    wood:     0xa08a60,
    woodDark: PALETTE.woodDark,
    orange:   PALETTE.accentOrange,
    tarp:     PALETTE.tarpBlue,
    tarpGrn:  PALETTE.tarpGreen,
    cement:   PALETTE.cementBag,
    hazard:   0xe8c820,
    barrel:   0x4a6a3a,
    dirt:     0x8a7a60,
    red:      0xcc3333,
    white:    0xeeeeee,
  };

  // ===== GROUND SLAB (concrete, with cracks/stains) =====
  B.colorBox(22, 0.15, 22, cx, 0.07, cz, CZ.concrete, 0.92, 0.03, false);
  B.addCollider(cx - 11, -0.1, cz - 11, cx + 11, 0.2, cz + 11);
  // Dirty patches on ground
  B.colorBox(4, 0.01, 3, cx - 3, 0.16, cz + 2, CZ.dirt, 0.98, 0, false);
  B.colorBox(3, 0.01, 2, cx + 4, 0.16, cz - 4, CZ.dirt, 0.98, 0, false);

  // ========================================================
  // 1) MAIN SCAFFOLD TOWER (3 stories, climbable)
  // ========================================================
  const tX = cx - 4, tZ = cz - 3;
  const tW = 4.0, tD = 3.0;
  const floorH = [0, 2.5, 5.0, 7.2];
  const uprightR = 0.06;

  // Vertical uprights (yellow tubes at 4 corners, full height)
  for (const dx of [-tW / 2, tW / 2]) {
    for (const dz of [-tD / 2, tD / 2]) {
      B.cyl(uprightR, uprightR, floorH[3], tX + dx, floorH[3] / 2, tZ + dz, "scaffold");
      B.addCollider(tX + dx - 0.12, 0, tZ + dz - 0.12, tX + dx + 0.12, floorH[3], tZ + dz + 0.12);
    }
  }

  // Platforms per floor (no cross braces blocking movement)
  for (let f = 1; f < floorH.length; f++) {
    const fy = floorH[f];
    // Platform (walkable) - with staircase opening on alternating sides
    const openSide = (f % 2 === 0) ? -1 : 1; // -1 = front open, 1 = back open
    B.colorBox(tW + 0.3, 0.12, tD + 0.3, tX, fy, tZ, CZ.wood, 0.85, 0.02, false);
    B.addCollider(tX - tW / 2 - 0.15, fy - 0.12, tZ - tD / 2 - 0.15, tX + tW / 2 + 0.15, fy + 0.05, tZ + tD / 2 + 0.15);
    // Guardrails only on 3 sides (leave stair side open for entry)
    if (openSide !== 1) {
    B.colorBox(tW + 0.3, 0.05, 0.05, tX, fy + 0.9, tZ - tD / 2, CZ.yellow, 0.6, 0.3, false);
    B.addCollider(tX - tW / 2, fy, tZ - tD / 2 - 0.1, tX + tW / 2, fy + 1.0, tZ - tD / 2 + 0.1);
    }
    if (openSide !== -1) {
    B.colorBox(tW + 0.3, 0.05, 0.05, tX, fy + 0.9, tZ + tD / 2, CZ.yellow, 0.6, 0.3, false);
    B.addCollider(tX - tW / 2, fy, tZ + tD / 2 - 0.1, tX + tW / 2, fy + 1.0, tZ + tD / 2 + 0.1);
    }
    // Side guardrails (always present)
    B.colorBox(0.05, 0.05, tD, tX - tW / 2, fy + 0.9, tZ, CZ.yellow, 0.6, 0.3, false);
    B.colorBox(0.05, 0.05, tD, tX + tW / 2, fy + 0.9, tZ, CZ.yellow, 0.6, 0.3, false);
  }

  // Wide staircase between floors (step-up friendly, stepH <= 0.4)
  const stairW = 1.2;
  for (let f = 0; f < 3; f++) {
    const startY = floorH[f];
    const endY = floorH[f + 1];
    const numSteps = 7;
    const stepRise = (endY - startY) / numSteps;
    const stairZ = (f % 2 === 0) ? tZ + tD / 2 + 0.6 : tZ - tD / 2 - 0.6;
    for (let s = 0; s < numSteps; s++) {
      const sy = startY + (s + 1) * stepRise;
      const sx = tX - tW / 2 + 0.3 + (s / (numSteps - 1)) * (tW - 0.6);
      const stepW = (tW - 0.6) / numSteps + 0.15;
      // Visible step
      B.colorBox(stepW, stepRise, stairW, sx, sy - stepRise / 2, stairZ, CZ.wood, 0.85, 0.02, false);
      // Thick collider so player can walk up
      B.addCollider(
        sx - stepW / 2, startY, stairZ - stairW / 2,
        sx + stepW / 2, sy, stairZ + stairW / 2
      );
    }
    // Stair handrail
    B.colorBox(tW, 0.04, 0.04, tX, (startY + endY) / 2 + 0.5, stairZ + (f % 2 === 0 ? stairW / 2 + 0.1 : -stairW / 2 - 0.1), CZ.yellow, 0.6, 0.3, false);
  }

  // ========================================================
  // 2) SECONDARY SCAFFOLD (lower, 2-story, connected bridge)
  // ========================================================
  const s2X = cx + 4, s2Z = cz - 4;
  const s2W = 3.5, s2D = 2.5;
  // Uprights
  for (const dx of [-s2W / 2, s2W / 2]) {
    for (const dz of [-s2D / 2, s2D / 2]) {
      B.cyl(uprightR, uprightR, 5.0, s2X + dx, 2.5, s2Z + dz, "scaffold");
      B.addCollider(s2X + dx - 0.12, 0, s2Z + dz - 0.12, s2X + dx + 0.12, 5.0, s2Z + dz + 0.12);
    }
  }
  // Floors
  B.colorBox(s2W + 0.3, 0.12, s2D + 0.3, s2X, 2.5, s2Z, CZ.wood, 0.85, 0.02, false);
  B.addCollider(s2X - s2W / 2 - 0.15, 2.38, s2Z - s2D / 2 - 0.15, s2X + s2W / 2 + 0.15, 2.55, s2Z + s2D / 2 + 0.15);
  B.colorBox(s2W + 0.3, 0.12, s2D + 0.3, s2X, 5.0, s2Z, CZ.wood, 0.85, 0.02, false);
  B.addCollider(s2X - s2W / 2 - 0.15, 4.88, s2Z - s2D / 2 - 0.15, s2X + s2W / 2 + 0.15, 5.05, s2Z + s2D / 2 + 0.15);
  // Guardrails
  B.colorBox(s2W + 0.3, 0.05, 0.05, s2X, 5.9, s2Z - s2D / 2, CZ.yellow, 0.6, 0.3, false);
  B.addCollider(s2X - s2W / 2, 5.0, s2Z - s2D / 2 - 0.1, s2X + s2W / 2, 6.0, s2Z - s2D / 2 + 0.1);
  B.colorBox(s2W + 0.3, 0.05, 0.05, s2X, 5.9, s2Z + s2D / 2, CZ.yellow, 0.6, 0.3, false);
  B.addCollider(s2X - s2W / 2, 5.0, s2Z + s2D / 2 - 0.1, s2X + s2W / 2, 6.0, s2Z + s2D / 2 + 0.1);

  // Bridge connecting two scaffolds at 5m
  const bridgeZ = (tZ + s2Z) / 2;
  B.colorBox(s2X - tX - tW / 2 - s2W / 2 + 2, 0.1, 1.2, (tX + s2X) / 2, 5.0, bridgeZ, CZ.wood, 0.85, 0.02, false);
  B.addCollider(tX + tW / 2, 4.9, bridgeZ - 0.6, s2X - s2W / 2, 5.1, bridgeZ + 0.6);
  // Bridge guardrails
  B.colorBox(s2X - tX, 0.05, 0.05, (tX + s2X) / 2, 5.9, bridgeZ - 0.6, CZ.yellow, 0.6, 0.3, false);
  B.colorBox(s2X - tX, 0.05, 0.05, (tX + s2X) / 2, 5.9, bridgeZ + 0.6, CZ.yellow, 0.6, 0.3, false);

  // Ladder on secondary scaffold (front face) — step-up climbable
  // Visual ladder rungs
  for (let i = 0; i < 12; i++) {
    const ladY = i * 0.42;
    B.colorBox(0.5, 0.04, 0.04, s2X, ladY + 0.2, s2Z + s2D / 2 + 0.15, CZ.yellow, 0.6, 0.3, false);
  }
  // Side rails (visual)
  B.cyl(0.03, 0.03, 5, s2X - 0.25, 2.5, s2Z + s2D / 2 + 0.15, "scaffold");
  B.cyl(0.03, 0.03, 5, s2X + 0.25, 2.5, s2Z + s2D / 2 + 0.15, "scaffold");
  // Invisible step-up colliders (each rung = thick step player walks up on)
  const ladderSteps = 13;
  const ladderStepH = 5.0 / ladderSteps;
  for (let i = 0; i < ladderSteps; i++) {
    const sy = (i + 1) * ladderStepH;
    B.addCollider(
      s2X - 0.35, 0, s2Z + s2D / 2 - 0.05,
      s2X + 0.35, sy, s2Z + s2D / 2 + 0.4
    );
  }

  // ========================================================
  // 3) BUILDING FRAME (unfinished structure, landmark)
  // ========================================================
  const bfX = cx - 2, bfZ = cz + 5;
  const bfW = 6, bfD = 5, bfH = 6;
  const beamT = 0.25;
  const beamColor = CZ.steel;

  // Steel column frame (4 corners + beams)
  for (const dx of [-bfW / 2, bfW / 2]) {
    for (const dz of [-bfD / 2, bfD / 2]) {
      B.colorBox(beamT, bfH, beamT, bfX + dx, bfH / 2, bfZ + dz, beamColor, 0.4, 0.6, true);
    }
  }
  // Top beams
  B.colorBox(bfW + beamT, beamT, beamT, bfX, bfH, bfZ - bfD / 2, beamColor, 0.4, 0.6, false);
  B.colorBox(bfW + beamT, beamT, beamT, bfX, bfH, bfZ + bfD / 2, beamColor, 0.4, 0.6, false);
  B.colorBox(beamT, beamT, bfD + beamT, bfX - bfW / 2, bfH, bfZ, beamColor, 0.4, 0.6, false);
  B.colorBox(beamT, beamT, bfD + beamT, bfX + bfW / 2, bfH, bfZ, beamColor, 0.4, 0.6, false);
  // Mid beams (at 3m)
  B.colorBox(bfW + beamT, beamT, beamT, bfX, 3, bfZ - bfD / 2, beamColor, 0.4, 0.6, false);
  B.colorBox(bfW + beamT, beamT, beamT, bfX, 3, bfZ + bfD / 2, beamColor, 0.4, 0.6, false);
  // 2F floor (plywood, walkable - full coverage with stair opening)
  // Left section (before stair opening)
  B.colorBox(bfW / 2 - 0.8, 0.1, bfD - 0.5, bfX - bfW / 4 - 0.15, 3.05, bfZ, CZ.wood, 0.88, 0.02, false);
  B.addCollider(bfX - bfW / 2 + 0.25, 2.95, bfZ - bfD / 2 + 0.25, bfX - 0.5, 3.15, bfZ + bfD / 2 - 0.25);
  // Right section (after stair opening)
  B.colorBox(bfW / 2 - 0.8, 0.1, bfD - 0.5, bfX + bfW / 4 + 0.15, 3.05, bfZ, CZ.wood, 0.88, 0.02, false);
  B.addCollider(bfX + 0.5, 2.95, bfZ - bfD / 2 + 0.25, bfX + bfW / 2 - 0.25, 3.15, bfZ + bfD / 2 - 0.25);

  // Staircase to 2F (along front wall, step-up friendly)
  const bfStairW = 1.0;
  const bfNumSteps = 8;
  const bfStepRise = 3.0 / bfNumSteps;
  for (let s = 0; s < bfNumSteps; s++) {
    const sy = (s + 1) * bfStepRise;
    const sz = bfZ + bfD / 2 - 0.5 - (s / (bfNumSteps - 1)) * (bfD - 1.0);
    B.colorBox(bfStairW, bfStepRise, 0.5, bfX, sy - bfStepRise / 2, sz, CZ.wood, 0.85, 0.02, false);
    B.addCollider(bfX - bfStairW / 2, 0, sz - 0.3, bfX + bfStairW / 2, sy, sz + 0.3);
  }
  // Stair handrail
  B.colorBox(0.04, 0.04, bfD - 0.5, bfX + bfStairW / 2 + 0.1, 1.5 + 0.9, bfZ, CZ.steel, 0.4, 0.6, false);

  // Rebar poking out of columns
  for (const dx of [-bfW / 2, bfW / 2]) {
    for (const dz of [-bfD / 2, bfD / 2]) {
      B.cyl(0.02, 0.02, 1.5, bfX + dx, bfH + 0.75, bfZ + dz, "steelDark");
    }
  }
  // Tarp roof (with collider so players can stand on it)
  B.colorBox(bfW * 0.6, 0.04, bfD + 0.3, bfX + bfW * 0.15, bfH + 0.1, bfZ, CZ.tarp, 0.92, 0, false);
  B.addCollider(bfX - bfW * 0.15, bfH, bfZ - bfD / 2 - 0.15, bfX + bfW * 0.45 + 0.15, bfH + 0.15, bfZ + bfD / 2 + 0.15);
  // Construction sign on front
  B.colorBox(1.5, 1.0, 0.06, bfX, 4.5, bfZ + bfD / 2 + 0.05, CZ.white, 0.8, 0.02, false);
  B.colorBox(1.6, 1.1, 0.04, bfX, 4.5, bfZ + bfD / 2 + 0.03, CZ.orange, 0.7, 0.1, false);

  // ========================================================
  // 4) CRANE (large landmark, background element)
  // ========================================================
  const crX = cx + 8, crZ = cz - 8;
  const crBaseH = 10, crArmLen = 12;
  // Crane mast (lattice tower)
  B.colorBox(0.6, crBaseH, 0.6, crX, crBaseH / 2, crZ, CZ.yellow, 0.6, 0.3, true);
  // Cross details on mast
  for (let h = 1; h < crBaseH; h += 2) {
    B.colorBox(0.8, 0.06, 0.06, crX, h, crZ, CZ.yellow, 0.6, 0.3, false);
    B.colorBox(0.06, 0.06, 0.8, crX, h + 1, crZ, CZ.yellow, 0.6, 0.3, false);
  }
  // Crane cabin
  B.colorBox(1.2, 1.0, 1.2, crX, crBaseH + 0.5, crZ, CZ.orange, 0.7, 0.1, false);
  // Crane arm (horizontal jib)
  B.colorBox(crArmLen, 0.3, 0.3, crX - crArmLen / 2 + 2, crBaseH + 1.2, crZ, CZ.yellow, 0.6, 0.3, false);
  // Counter-weight arm (shorter, opposite direction)
  B.colorBox(3, 0.25, 0.25, crX + 4, crBaseH + 1.2, crZ, CZ.yellow, 0.6, 0.3, false);
  // Counterweight block
  B.colorBox(1.0, 0.8, 0.8, crX + 5.5, crBaseH + 0.6, crZ, CZ.concrete, 0.9, 0.03, false);
  // Cable (vertical from arm tip to ground)
  B.cyl(0.02, 0.02, crBaseH + 1, crX - crArmLen / 2 + 2, (crBaseH + 1) / 2, crZ, "steelDark");
  // Hook at bottom of cable
  B.colorBox(0.15, 0.2, 0.15, crX - crArmLen / 2 + 2, 0.5, crZ, CZ.steel, 0.3, 0.7, false);

  // ========================================================
  // 5) MATERIAL STORAGE AREA
  // ========================================================
  // Cement bags (stacked pile)
  const bagX = cx + 5, bagZ = cz + 6;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4 - row; col++) {
      B.colorBox(0.7, 0.2, 0.4, bagX + col * 0.75, 0.1 + row * 0.2, bagZ, CZ.cement, 0.95, 0, false);
    }
  }
  B.addCollider(bagX - 0.35, 0, bagZ - 0.2, bagX + 2.6, 0.7, bagZ + 0.2);

  // Wooden pallets (stacked)
  const palX = cx - 8, palZ = cz + 7;
  B.colorBox(1.2, 0.12, 0.8, palX, 0.06, palZ, CZ.wood, 0.9, 0.02, true);
  B.colorBox(1.2, 0.12, 0.8, palX, 0.18, palZ, CZ.wood, 0.88, 0.02, false);
  B.colorBox(1.2, 0.12, 0.8, palX + 1.4, 0.06, palZ, CZ.wood, 0.88, 0.02, true);

  // Steel pipes (horizontal bundle)
  const pipeX = cx + 7, pipeZ = cz + 2;
  for (let i = 0; i < 4; i++) {
    B.cyl(0.08, 0.08, 3.5, pipeX, 0.1 + i * 0.17, pipeZ + (i % 2) * 0.1, "steelLight");
  }
  B.addCollider(pipeX - 1.75, 0, pipeZ - 0.15, pipeX + 1.75, 0.8, pipeZ + 0.25);

  // Oil/paint drums
  const drumX = cx - 8, drumZ = cz - 5;
  B.cyl(0.25, 0.25, 0.9, drumX, 0.45, drumZ, "steelDark", true);
  B.cyl(0.25, 0.25, 0.9, drumX + 0.6, 0.45, drumZ - 0.1, "steelDark", true);
  B.cyl(0.25, 0.25, 0.9, drumX + 0.3, 0.45, drumZ + 0.55, "steelDark", true);
  // Colored drum lids
  B.colorBox(0.35, 0.03, 0.35, drumX, 0.92, drumZ, CZ.red, 0.7, 0.2, false);
  B.colorBox(0.35, 0.03, 0.35, drumX + 0.6, 0.92, drumZ - 0.1, CZ.hazard, 0.7, 0.2, false);
  B.colorBox(0.35, 0.03, 0.35, drumX + 0.3, 0.92, drumZ + 0.55, 0x2266aa, 0.7, 0.2, false);

  // Large tarp-covered pile (hiding spot)
  B.colorBox(3.2, 1.0, 2.0, cx + 2, 0.5, cz + 8, CZ.tarpGrn, 0.92, 0, true);
  // Rope over tarp
  B.colorBox(0.03, 0.03, 2.2, cx + 2 - 0.8, 1.05, cz + 8, PALETTE.ropeBeige, 0.92, 0, false);
  B.colorBox(0.03, 0.03, 2.2, cx + 2 + 0.8, 1.05, cz + 8, PALETTE.ropeBeige, 0.92, 0, false);

  // ========================================================
  // 6) MACHINERY AREA
  // ========================================================
  // Concrete mixer (stylized)
  const mixX = cx - 7, mixZ = cz + 2;
  // Base frame
  B.colorBox(1.2, 0.4, 0.8, mixX, 0.35, mixZ, CZ.steel, 0.5, 0.5, true);
  // Drum (using a box approximation rotated)
  B.colorBox(1.0, 0.9, 0.9, mixX, 0.95, mixZ, CZ.concrete, 0.7, 0.3, true);
  // Drum opening
  B.colorBox(0.4, 0.4, 0.05, mixX + 0.5, 1.1, mixZ, 0x444444, 0.8, 0.3, false);
  // Wheels
  B.cyl(0.2, 0.2, 0.1, mixX - 0.5, 0.2, mixZ - 0.5, "steelDark");
  B.cyl(0.2, 0.2, 0.1, mixX - 0.5, 0.2, mixZ + 0.5, "steelDark");
  // Handle
  B.colorBox(0.04, 0.04, 1.5, mixX + 0.7, 0.9, mixZ, CZ.yellow, 0.6, 0.3, false);

  // Generator
  const genX = cx + 6, genZ = cz - 6;
  B.colorBox(1.0, 0.8, 0.7, genX, 0.55, genZ, CZ.orange, 0.7, 0.1, true);
  // Exhaust pipe
  B.cyl(0.04, 0.04, 0.5, genX - 0.3, 1.2, genZ, "steelDark");
  // Control panel
  B.colorBox(0.3, 0.3, 0.05, genX + 0.5, 0.75, genZ, 0x333333, 0.8, 0.3, false);

  // Small forklift
  const fkX = cx + 3, fkZ = cz - 7;
  // Body
  B.colorBox(1.2, 0.6, 0.8, fkX, 0.45, fkZ, CZ.yellow, 0.6, 0.3, true);
  // Roof
  B.colorBox(1.0, 0.06, 0.7, fkX, 1.5, fkZ, CZ.yellow, 0.6, 0.3, false);
  // Mast
  B.colorBox(0.08, 1.1, 0.08, fkX + 0.5, 0.9, fkZ - 0.3, CZ.steel, 0.4, 0.6, false);
  B.colorBox(0.08, 1.1, 0.08, fkX + 0.5, 0.9, fkZ + 0.3, CZ.steel, 0.4, 0.6, false);
  // Forks
  B.colorBox(0.8, 0.04, 0.06, fkX + 0.9, 0.2, fkZ - 0.2, CZ.steel, 0.4, 0.6, false);
  B.colorBox(0.8, 0.04, 0.06, fkX + 0.9, 0.2, fkZ + 0.2, CZ.steel, 0.4, 0.6, false);
  // Wheels
  B.cyl(0.15, 0.15, 0.12, fkX - 0.4, 0.15, fkZ - 0.45, "steelDark");
  B.cyl(0.15, 0.15, 0.12, fkX - 0.4, 0.15, fkZ + 0.45, "steelDark");
  B.cyl(0.12, 0.12, 0.1, fkX + 0.4, 0.12, fkZ - 0.4, "steelDark");
  B.cyl(0.12, 0.12, 0.1, fkX + 0.4, 0.12, fkZ + 0.4, "steelDark");
  // Seat
  B.colorBox(0.3, 0.25, 0.3, fkX - 0.2, 0.85, fkZ, 0x222222, 0.9, 0.02, false);

  // ========================================================
  // 7) CLUTTER & DETAILS
  // ========================================================
  // Safety cones
  const conePositions = [
    [cx - 9, cz - 8], [cx - 7, cz - 9], [cx + 9, cz + 3],
    [cx + 7, cz - 2], [cx - 3, cz - 9], [cx + 1, cz + 9],
  ];
  for (const [cpx, cpz] of conePositions) {
    B.cyl(0.02, 0.14, 0.55, cpx, 0.28, cpz, "accentOrange");
    B.colorBox(0.3, 0.03, 0.3, cpx, 0.02, cpz, CZ.orange, 0.8, 0.05, false);
  }

  // Hard hats (scattered)
  const hatMat = getCustomMaterial(CZ.hazard, 0.7, 0.1);
  for (const [hx, hz] of [[cx - 6, cz + 8], [cx + 8, cz - 3], [cx - 2, cz + 4]] as [number, number][]) {
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), hatMat);
    hat.position.set(hx, 0.15, hz);
    hat.scale.set(1, 0.5, 1);
    hat.castShadow = true;
    scene.add(hat);
  }

  // Rebar bundles (stacked on ground)
  for (let i = 0; i < 8; i++) {
    B.cyl(0.015, 0.015, 4, cx - 9, 0.08 + i * 0.04, cz + 0.5 + (i % 3) * 0.04, "steelDark");
  }
  B.addCollider(cx - 11, 0, cz + 0.3, cx - 7, 0.4, cz + 0.7);

  // Wooden planks leaning against wall
  const plankMat = getCustomMaterial(CZ.wood, 0.9, 0.02);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.0, 0.04), plankMat);
  plank.position.set(cx - 10.5, 1.2, cz - 3);
  plank.rotation.z = 0.2;
  plank.castShadow = true;
  scene.add(plank);
  const plank2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.8, 0.04), plankMat);
  plank2.position.set(cx - 10.3, 1.1, cz - 2.7);
  plank2.rotation.z = 0.25;
  plank2.castShadow = true;
  scene.add(plank2);

  // Warning signs
  B.colorBox(0.6, 0.5, 0.04, cx - 4, 1.8, cz - 10.5, CZ.hazard, 0.7, 0.1, false);
  B.colorBox(0.5, 0.4, 0.02, cx - 4, 1.8, cz - 10.48, CZ.white, 0.8, 0.02, false);
  B.cyl(0.03, 0.03, 1.8, cx - 4, 0.9, cz - 10.5, "steelDark");

  B.colorBox(0.6, 0.5, 0.04, cx + 8, 1.8, cz + 9.5, CZ.hazard, 0.7, 0.1, false);
  B.colorBox(0.5, 0.4, 0.02, cx + 8, 1.8, cz + 9.52, CZ.white, 0.8, 0.02, false);
  B.cyl(0.03, 0.03, 1.8, cx + 8, 0.9, cz + 9.5, "steelDark");

  // Hazard tape barriers
  for (const [tx, tz1, tz2] of [[cx - 10, cz - 8, cz - 2], [cx + 10, cz - 5, cz + 5]] as [number, number, number][]) {
    B.cyl(0.03, 0.03, 0.9, tx, 0.45, tz1, "steelDark");
    B.cyl(0.03, 0.03, 0.9, tx, 0.45, tz2, "steelDark");
    B.colorBox(0.03, 0.06, Math.abs(tz2 - tz1), tx, 0.75, (tz1 + tz2) / 2, CZ.hazard, 0.7, 0.1, false);
    B.colorBox(0.03, 0.06, Math.abs(tz2 - tz1), tx, 0.55, (tz1 + tz2) / 2, CZ.hazard, 0.7, 0.1, false);
  }

  // Tire stack
  B.cyl(0.35, 0.35, 0.15, cx + 8, 0.08, cz + 7, "steelDark", true);
  B.cyl(0.35, 0.35, 0.15, cx + 8, 0.23, cz + 7, "steelDark", false);
  B.cyl(0.35, 0.35, 0.15, cx + 8.1, 0.38, cz + 7, "steelDark", false);

  // Wheelbarrow
  const wbX = cx + 1, wbZ = cz - 3;
  B.colorBox(0.7, 0.3, 0.5, wbX, 0.4, wbZ, CZ.steel, 0.6, 0.4, true);
  B.cyl(0.15, 0.15, 0.08, wbX + 0.5, 0.15, wbZ, "steelDark");
  B.colorBox(0.04, 0.04, 1.0, wbX - 0.35, 0.35, wbZ - 0.3, CZ.wood, 0.9, 0.02, false);
  B.colorBox(0.04, 0.04, 1.0, wbX - 0.35, 0.35, wbZ + 0.3, CZ.wood, 0.9, 0.02, false);

  // Toolbox on ground
  B.colorBox(0.5, 0.25, 0.25, cx - 5, 0.22, cz + 3, CZ.red, 0.7, 0.2, true);
  // Open lid
  B.colorBox(0.5, 0.02, 0.2, cx - 5, 0.46, cz + 3.1, CZ.red, 0.7, 0.2, false);

  // Bucket (loose)
  B.cyl(0.12, 0.15, 0.3, cx + 0.5, 0.15, cz + 5, "accentOrange");

  // Puddle (flat reflective plane)
  const puddleMat = getCustomMaterial(0x5588aa, 0.1, 0.6);
  const puddle = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.5), puddleMat);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(cx + 2, 0.17, cz - 1);
  puddle.receiveShadow = true;
  scene.add(puddle);

  // ========================================================
  // 8) CONSTRUCTION SITE LIGHTS
  // ========================================================
  const lightMat = getEmissiveMaterial(0xffffdd, 0xffeeaa, 0.6);
  for (const [lx, lz] of [[cx - 9, cz - 6], [cx + 9, cz - 6], [cx - 9, cz + 8], [cx + 9, cz + 8]] as [number, number][]) {
    // Tripod legs
    B.cyl(0.025, 0.04, 2.0, lx, 1.0, lz, "steelDark");
    B.cyl(0.02, 0.02, 1.3, lx - 0.15, 0.5, lz - 0.15, "steelDark");
    B.cyl(0.02, 0.02, 1.3, lx + 0.15, 0.5, lz + 0.15, "steelDark");
    // Light head
    B.colorBox(0.4, 0.25, 0.15, lx, 2.1, lz, 0x333333, 0.5, 0.5, false);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.04), lightMat);
    bulb.position.set(lx, 2.1, lz + 0.1);
    scene.add(bulb);
  }
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
  const harborText = makeSignTextMesh("OLD HARBOR", 7.0, 0.7, 42, "#1a1a2e", null);
  harborText.position.set(0, 7.0, 18.47);
  scene.add(harborText);
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

  // (Extra containers removed to clear area near Mini Mart)

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

  // (Shipping containers removed to clear area near Mini Mart)

  // ===== BRICK ARCHWAY (decorative entrance to construction zone) =====
  const archX = -28, archZ = -15;
  // Left pillar (thicker visual + generous collider)
  B.colorBox(0.8, 4, 1.2, archX - 2, 2, archZ, 0x8a4030, 0.85, 0.02, false);
  B.addCollider(archX - 2 - 0.6, 0, archZ - 0.8, archX - 2 + 0.6, 4.0, archZ + 0.8);
  // Right pillar
  B.colorBox(0.8, 4, 1.2, archX + 2, 2, archZ, 0x8a4030, 0.85, 0.02, false);
  B.addCollider(archX + 2 - 0.6, 0, archZ - 0.8, archX + 2 + 0.6, 4.0, archZ + 0.8);
  // Top crossbar (thick collider so jumping doesn't clip through)
  B.colorBox(4.8, 0.8, 1.2, archX, 4.2, archZ, 0x8a4030, 0.85, 0.02, false);
  B.addCollider(archX - 2.4, 3.8, archZ - 0.8, archX + 2.4, 5.0, archZ + 0.8);
  // Keystone accent
  B.colorBox(0.5, 0.8, 1.22, archX, 4.65, archZ, PALETTE.concreteDark, 0.9, 0.03, false);

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

  // ===== TIRE STACK (inside container yard) =====
  const tireMat = getCustomMaterial(0x1a1a1a, 0.92, 0);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 12), tireMat);
      t.position.set(42 + col * 0.7, 0.35 + row * 0.65, -10);
      t.rotation.x = Math.PI / 2;
      t.castShadow = true;
      scene.add(t);
    }
  }
  B.addCollider(41.5, 0, -10.5, 44.2, 1.6, -9.5);

  // ===== OUTDOOR CLUTTER (cardboard boxes + trash bins near Mini Mart area) =====
  // Cardboard boxes scattered
  B.colorBox(0.6, 0.5, 0.5, 38, 0.45, -32, 0xc4953d, 0.9, 0, true);
  B.colorBox(0.5, 0.4, 0.4, 38.8, 0.4, -32.3, 0xb8883a, 0.9, 0, true);
  B.colorBox(0.7, 0.55, 0.5, 40, 0.47, -31.5, 0xc4953d, 0.9, 0, true);
  B.colorBox(0.5, 0.4, 0.5, 38.3, 0.9, -32, 0xb8883a, 0.9, 0, false);
  // Trash bins
  B.cyl(0.25, 0.25, 0.8, 42, 0.4, -32, "steelDark", true);
  B.colorBox(0.4, 0.03, 0.4, 42, 0.82, -32, 0x444444, 0.8, 0.3, false);
  B.cyl(0.25, 0.25, 0.8, 50, 0.4, -34, "steelDark", true);
  B.colorBox(0.4, 0.03, 0.4, 50, 0.82, -34, 0x444444, 0.8, 0.3, false);
  // Loose crate near fence
  B.colorBox(1.0, 0.8, 0.8, 55, 0.6, -36, PALETTE.woodWarm, 0.85, 0.02, true);
  // Pallet on ground
  B.colorBox(1.2, 0.12, 0.8, 48, 0.06, -30, PALETTE.woodDark, 0.88, 0.02, true);
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

  // Left wall 1F - open window (colliders pushed outward to not block staircase)
  // Below window (visual covers full HD, but collider is thin on the exterior side only)
  B.colorBox(W, winSill1, HD, hx - HW / 2, baseY1 + winSill1 / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY1, hz - HD / 2, hx - HW / 2 - 0.05, baseY1 + winSill1, hz + HD / 2);
  // Above window
  B.colorBox(W, F - winSill1 - winH1, HD, hx - HW / 2, baseY1 + winSill1 + winH1 + (F - winSill1 - winH1) / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY1 + winSill1 + winH1, hz - HD / 2, hx - HW / 2 - 0.05, baseY1 + F, hz + HD / 2);
  // Side pillars around window (colliders only on exterior face)
  B.colorBox(W, winH1, 1.5, hx - HW / 2, baseY1 + winSill1 + winH1 / 2, hz - HD / 2 + 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY1 + winSill1, hz - HD / 2, hx - HW / 2 - 0.05, baseY1 + winSill1 + winH1, hz - HD / 2 + 1.5);
  B.colorBox(W, winH1, 1.5, hx - HW / 2, baseY1 + winSill1 + winH1 / 2, hz + HD / 2 - 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W / 2, baseY1 + winSill1, hz + HD / 2 - 1.5, hx - HW / 2 - 0.05, baseY1 + winSill1 + winH1, hz + HD / 2);
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
  const _stairOpenZ2 = hz + 0.5;
  const stairOpenX1 = hx - HW / 2;
  const stairOpenX2 = hx - HW / 2 + stairOpenW;
  const chHoleR = 0.7;
  // Visual floor panels (split around stair opening AND chimney hole)
  const fhL = chX - chHoleR, fhR = chX + chHoleR, fhB = chZ - chHoleR, fhF = chZ + chHoleR;
  const floorLeft = stairOpenX2, floorRight = hx + HW / 2;
  const floorBack = hz - HD / 2, floorFront = hz + HD / 2;
  // Left of chimney hole
  B.colorBox(fhL - floorLeft, 0.2, HD, (floorLeft + fhL) / 2, F + 0.45, hz, PALETTE.woodWarm, 0.82, 0.02, false);
  // Right of chimney hole
  B.colorBox(floorRight - fhR, 0.2, HD, (fhR + floorRight) / 2, F + 0.45, hz, PALETTE.woodWarm, 0.82, 0.02, false);
  // Back of chimney hole (strip between left and right)
  B.colorBox(fhR - fhL, 0.2, fhB - floorBack, (fhL + fhR) / 2, F + 0.45, (floorBack + fhB) / 2, PALETTE.woodWarm, 0.82, 0.02, false);
  // Front of chimney hole
  B.colorBox(fhR - fhL, 0.2, floorFront - fhF, (fhL + fhR) / 2, F + 0.45, (fhF + floorFront) / 2, PALETTE.woodWarm, 0.82, 0.02, false);
  // Stair landing (front part of left strip)
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
  // Stair exit landing (extended back to overlap with top steps for smooth transition)
  B.addCollider(stairOpenX1, F + 0.35, hz - HD / 2 + 0.8 + 15 * 0.3 - 0.3, stairOpenX2, F + 0.55, hz + HD / 2);

  // === 2F WALLS (thicker colliders to prevent jump-through) ===
  const baseY2 = F + 0.35;
  const W2 = 0.8;
  // Back wall 2F - solid
  B.colorBox(HW + W, F, W, hx, baseY2 + F / 2, hz - HD / 2, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W2 / 2, baseY2, hz - HD / 2 - W2 / 2, hx + HW / 2 + W2 / 2, baseY2 + F, hz - HD / 2 + W2 / 2);
  // Left wall 2F - open window (same pattern as 1F)
  B.colorBox(W, winSill1, HD, hx - HW / 2, baseY2 + winSill1 / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W2 / 2, baseY2, hz - HD / 2, hx - HW / 2 + W2 / 2, baseY2 + winSill1, hz + HD / 2);
  B.colorBox(W, F - winSill1 - winH1, HD, hx - HW / 2, baseY2 + winSill1 + winH1 + (F - winSill1 - winH1) / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W2 / 2, baseY2 + winSill1 + winH1, hz - HD / 2, hx - HW / 2 + W2 / 2, baseY2 + F, hz + HD / 2);
  B.colorBox(W, winH1, 1.5, hx - HW / 2, baseY2 + winSill1 + winH1 / 2, hz - HD / 2 + 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W2 / 2, baseY2 + winSill1, hz - HD / 2, hx - HW / 2 + W2 / 2, baseY2 + winSill1 + winH1, hz - HD / 2 + 1.5);
  B.colorBox(W, winH1, 1.5, hx - HW / 2, baseY2 + winSill1 + winH1 / 2, hz + HD / 2 - 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - HW / 2 - W2 / 2, baseY2 + winSill1, hz + HD / 2 - 1.5, hx - HW / 2 + W2 / 2, baseY2 + winSill1 + winH1, hz + HD / 2);
  B.colorBox(0.08, winH1 + 0.1, 0.08, hx - HW / 2, baseY2 + winSill1 + winH1 / 2, hz - HD / 2 + 1.5, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, winH1 + 0.1, 0.08, hx - HW / 2, baseY2 + winSill1 + winH1 / 2, hz + HD / 2 - 1.5, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, 0.08, HD - 3, hx - HW / 2, baseY2 + winSill1, hz, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, 0.08, HD - 3, hx - HW / 2, baseY2 + winSill1 + winH1, hz, trimColor, 0.85, 0.02, false);
  // Right wall 2F - open window
  B.colorBox(W, winSill1, HD, hx + HW / 2, baseY2 + winSill1 / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + HW / 2 - W2 / 2, baseY2, hz - HD / 2, hx + HW / 2 + W2 / 2, baseY2 + winSill1, hz + HD / 2);
  B.colorBox(W, F - winSill1 - winH1, HD, hx + HW / 2, baseY2 + winSill1 + winH1 + (F - winSill1 - winH1) / 2, hz, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + HW / 2 - W2 / 2, baseY2 + winSill1 + winH1, hz - HD / 2, hx + HW / 2 + W2 / 2, baseY2 + F, hz + HD / 2);
  B.colorBox(W, winH1, 1.5, hx + HW / 2, baseY2 + winSill1 + winH1 / 2, hz - HD / 2 + 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + HW / 2 - W2 / 2, baseY2 + winSill1, hz - HD / 2, hx + HW / 2 + W2 / 2, baseY2 + winSill1 + winH1, hz - HD / 2 + 1.5);
  B.colorBox(W, winH1, 1.5, hx + HW / 2, baseY2 + winSill1 + winH1 / 2, hz + HD / 2 - 0.75, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + HW / 2 - W2 / 2, baseY2 + winSill1, hz + HD / 2 - 1.5, hx + HW / 2 + W2 / 2, baseY2 + winSill1 + winH1, hz + HD / 2);
  B.colorBox(0.08, winH1 + 0.1, 0.08, hx + HW / 2, baseY2 + winSill1 + winH1 / 2, hz - HD / 2 + 1.5, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, winH1 + 0.1, 0.08, hx + HW / 2, baseY2 + winSill1 + winH1 / 2, hz + HD / 2 - 1.5, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, 0.08, HD - 3, hx + HW / 2, baseY2 + winSill1, hz, trimColor, 0.85, 0.02, false);
  B.colorBox(0.08, 0.08, HD - 3, hx + HW / 2, baseY2 + winSill1 + winH1, hz, trimColor, 0.85, 0.02, false);
  // Front wall 2F - with balcony door
  B.colorBox(2.5, F, W, hx - 3.75, baseY2 + F / 2, hz + HD / 2, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - 5, baseY2, hz + HD / 2 - W2 / 2, hx - 2.5, baseY2 + F, hz + HD / 2 + W2 / 2);
  B.colorBox(2.5, F, W, hx + 3.75, baseY2 + F / 2, hz + HD / 2, wallColor, 0.85, 0.02, false);
  B.addCollider(hx + 2.5, baseY2, hz + HD / 2 - W2 / 2, hx + 5, baseY2 + F, hz + HD / 2 + W2 / 2);
  B.colorBox(5, 0.6, W, hx, F * 2 + 0.05, hz + HD / 2, wallColor, 0.85, 0.02, false);
  B.addCollider(hx - 2.5, F * 2 - 0.3, hz + HD / 2 - W2 / 2, hx + 2.5, F * 2 + 0.35, hz + HD / 2 + W2 / 2);

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
  B.addCollider(hx - 2.6, F + 0.35, hz + HD / 2, hx - 2.4, F + 1.4, hz + HD / 2 + balD);
  B.colorBox(0.08, 0.9, balD, hx + 2.5, F + 0.88, hz + HD / 2 + balD / 2, trimColor, 0.85, 0.02, false);
  B.addCollider(hx + 2.4, F + 0.35, hz + HD / 2, hx + 2.6, F + 1.4, hz + HD / 2 + balD);

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
    B.addCollider(stairX - stairW / 2 - 0.1, sy - stepRise, sz - stepRun / 2 - 0.05, stairX + stairW / 2 + 0.1, sy + 0.05, sz + stepRun / 2 + 0.05);
  }
  // Transition ramp from last step to 2F floor (fills the height gap smoothly)
  const lastStepY = 0.35 + numSteps * stepRise;
  const lastStepZ = stairStartZ + (numSteps - 1) * stepRun;
  const landingY = F + 0.35;
  B.colorBox(stairW + 0.2, 0.15, stepRun * 2, stairX, (lastStepY + landingY) / 2, lastStepZ + stepRun, PALETTE.woodWarm, 0.82, 0.02, false);
  B.addCollider(stairX - stairW / 2 - 0.15, lastStepY - 0.1, lastStepZ + stepRun / 2, stairX + stairW / 2 + 0.15, landingY + 0.1, lastStepZ + stepRun * 2.5);
  // === INTERIOR DETAILS 1F ===

  // --- LIVING ROOM ---
  // Sofa against back wall (facing front/toward door)
  const sofaX = hx - 1.5, sofaZ = hz - HD / 2 + 1.5;
  B.colorBox(2.5, 0.45, 0.9, sofaX, 0.58, sofaZ, 0x3355aa, 0.85, 0.02, true);
  B.colorBox(2.5, 0.6, 0.12, sofaX, 0.95, sofaZ - 0.42, 0x2244aa, 0.85, 0.02, true);
  B.colorBox(0.12, 0.4, 0.9, sofaX - 1.25, 0.75, sofaZ, 0x2244aa, 0.85, 0.02, true);
  B.colorBox(0.12, 0.4, 0.9, sofaX + 1.25, 0.75, sofaZ, 0x2244aa, 0.85, 0.02, true);
  // Throw pillows
  B.colorBox(0.3, 0.25, 0.25, sofaX - 0.8, 0.92, sofaZ + 0.15, 0xcc8844, 0.9, 0, false);
  B.colorBox(0.3, 0.25, 0.25, sofaX + 0.8, 0.92, sofaZ + 0.15, 0x44aa88, 0.9, 0, false);
  // Coffee table in front of sofa
  B.colorBox(1.0, 0.06, 0.5, sofaX, 0.58, sofaZ + 1.2, PALETTE.woodWarm, 0.82, 0.02, true);
  B.colorBox(0.06, 0.2, 0.06, sofaX - 0.4, 0.45, sofaZ + 1.0, trimColor, 0.85, 0.02, false);
  B.colorBox(0.06, 0.2, 0.06, sofaX + 0.4, 0.45, sofaZ + 1.0, trimColor, 0.85, 0.02, false);
  B.colorBox(0.06, 0.2, 0.06, sofaX - 0.4, 0.45, sofaZ + 1.4, trimColor, 0.85, 0.02, false);
  B.colorBox(0.06, 0.2, 0.06, sofaX + 0.4, 0.45, sofaZ + 1.4, trimColor, 0.85, 0.02, false);
  // Rug under seating area
  B.colorBox(3.0, 0.02, 3.0, sofaX, 0.37, sofaZ + 0.8, 0x885544, 0.95, 0, false);
  // TV stand + TV (facing sofa, on opposite side of coffee table)
  const tvStandZ = sofaZ + 2.8;
  B.colorBox(1.5, 0.5, 0.4, sofaX, 0.6, tvStandZ, trimColor, 0.85, 0.02, true);
  B.colorBox(1.4, 0.8, 0.06, sofaX, 1.55, tvStandZ - 0.1, 0x111111, 0.9, 0.5, true);
  B.colorBox(0.15, 0.2, 0.1, sofaX, 1.1, tvStandZ - 0.05, 0x222222, 0.5, 0.5, false);
  // Bookshelf against right wall (moved away from staircase)
  B.colorBox(1.2, 1.8, 0.4, hx + HW / 2 - 0.7, 1.25, hz - HD / 2 + 1.0, trimColor, 0.85, 0.02, true);
  B.colorBox(0.3, 0.25, 0.18, hx + HW / 2 - 0.9, 1.0, hz - HD / 2 + 0.95, 0xaa2222, 0.9, 0, false);
  B.colorBox(0.25, 0.3, 0.18, hx + HW / 2 - 0.5, 1.02, hz - HD / 2 + 0.95, 0x2255aa, 0.9, 0, false);
  B.colorBox(0.35, 0.25, 0.18, hx + HW / 2 - 0.7, 1.6, hz - HD / 2 + 0.95, 0x885500, 0.9, 0, false);
  // Floor lamp (corner near sofa)
  B.cyl(0.04, 0.06, 1.6, sofaX + 1.6, 1.15, sofaZ - 0.2, "steelDark");
  B.colorBox(0.35, 0.25, 0.35, sofaX + 1.6, 2.0, sofaZ - 0.2, 0xffeecc, 0.8, 0, false);

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
  B.colorBox(0.4, 0.06, 0.4, dtX - 0.4, 0.8, dtZ - 0.7, trimColor, 0.85, 0.02, true);
  B.colorBox(0.4, 0.8, 0.06, dtX - 0.4, 1.1, dtZ - 0.9, trimColor, 0.85, 0.02, false);
  B.colorBox(0.4, 0.06, 0.4, dtX + 0.4, 0.8, dtZ - 0.7, trimColor, 0.85, 0.02, true);
  B.colorBox(0.4, 0.8, 0.06, dtX + 0.4, 1.1, dtZ - 0.9, trimColor, 0.85, 0.02, false);
  B.colorBox(0.4, 0.06, 0.4, dtX - 0.4, 0.8, dtZ + 0.7, trimColor, 0.85, 0.02, true);
  B.colorBox(0.4, 0.06, 0.4, dtX + 0.4, 0.8, dtZ + 0.7, trimColor, 0.85, 0.02, true);
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
  B.colorBox(0.8, 0.3, 0.3, hx + 1.0, 0.5, hz + HD / 2 - 0.5, trimColor, 0.85, 0.02, true);
  // Welcome mat
  B.colorBox(1.2, 0.02, 0.6, hx, 0.37, hz + HD / 2 - 0.1, 0x665533, 0.95, 0, false);
  // Wall clock (on right wall near door)
  B.cyl(0.2, 0.2, 0.04, hx + HW / 2 - 0.03, 2.8, hz + 2.0, "woodDark");
  B.cyl(0.17, 0.17, 0.02, hx + HW / 2 - 0.01, 2.8, hz + 2.0, "offWhite");

  // --- INTERIOR DECORATIONS 1F ---
  // AC unit on right wall (high up)
  B.colorBox(1.0, 0.35, 0.25, hx + HW / 2 - 0.15, 3.8, hz - 1.0, 0xeeeeee, 0.3, 0.3, false);
  B.colorBox(0.9, 0.04, 0.2, hx + HW / 2 - 0.15, 3.6, hz - 1.0, 0xdddddd, 0.4, 0.2, false);
  // Potted plant by left window (1F, replacing stair corner clutter)
  B.colorBox(0.3, 0.3, 0.3, hx - HW / 2 + 0.5, 0.5, hz + 1.0, 0x774433, 0.9, 0.02, true);
  B.cyl(0.18, 0.12, 0.5, hx - HW / 2 + 0.5, 0.9, hz + 1.0, "woodDark");
  // Small potted cactus on kitchen counter
  B.colorBox(0.1, 0.1, 0.1, kitX + 0.5, 1.35, kitZ + 1.5, 0x774433, 0.9, 0.02, false);
  B.cyl(0.04, 0.04, 0.15, kitX + 0.5, 1.47, kitZ + 1.5, "woodDark");

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
  B.colorBox(2.2, 0.4, 0.1, bedX, f2y + 0.2, hz - 0.1, trimColor, 0.85, 0.02, true);

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

  // Chimney exterior walls (full height, sized exactly to not block interior)
  // Back wall
  B.colorBox(chW + chT, chFullH, chT, chX, chCenterY, chZ - chW / 2, brickColor, 0.85, 0.02, false);
  B.addCollider(chX - chW / 2 - chT, chBottom, chZ - chW / 2 - chT / 2, chX + chW / 2 + chT, chTop, chZ - chW / 2 + chT / 2);
  // Left side
  B.colorBox(chT, chFullH, chW + chT, chX - chW / 2, chCenterY, chZ, brickColor, 0.85, 0.02, false);
  B.addCollider(chX - chW / 2 - chT / 2, chBottom, chZ - chW / 2, chX - chW / 2 + chT / 2, chTop, chZ + chW / 2);
  // Right side
  B.colorBox(chT, chFullH, chW + chT, chX + chW / 2, chCenterY, chZ, brickColor, 0.85, 0.02, false);
  B.addCollider(chX + chW / 2 - chT / 2, chBottom, chZ - chW / 2, chX + chW / 2 + chT / 2, chTop, chZ + chW / 2);
  // Front wall (above fireplace opening, from mantel height to top)
  const mantelY = chBottom + 2.0;
  B.colorBox(chW + chT, chTop - mantelY, chT, chX, (mantelY + chTop) / 2, chZ + chW / 2, brickColor, 0.85, 0.02, false);
  B.addCollider(chX - chW / 2 - chT, mantelY, chZ + chW / 2 - chT / 2, chX + chW / 2 + chT, chTop, chZ + chW / 2 + chT / 2);

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

  // === A-FRAME SUPPORTS (with colliders) ===
  const legSpread = 4.0;
  const legThick = 0.4;
  for (const zOff of [-2.2, 2.2]) {
    for (const side of [-1, 1]) {
      const legX = fwX + side * legSpread * 0.5;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(legThick, hubY + 2, legThick), supportMat);
      leg.position.set(legX, hubY / 2, fwZ + zOff);
      leg.rotation.z = side * -0.17;
      leg.castShadow = true;
      scene.add(leg);
      // Use the rotated mesh bounds so the collider matches the slanted visual support.
      // Expand slightly to avoid tiny slip-through gaps for small props.
      const legBox = new THREE.Box3().setFromObject(leg);
      legBox.expandByScalar(0.06);
      colliders.push(legBox);
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

  // Dynamic cabin colliders (5 per cabin: floor, roof, back, left, right)
  for (let i = 0; i < numCabins; i++) {
    const a = (i / numCabins) * Math.PI * 2;
    const cx = fwX + Math.cos(a) * MOUNT_R;
    const cy = hubY + Math.sin(a) * MOUNT_R;
    // Floor (thick to prevent sinking)
    colliders.push(new THREE.Box3(new THREE.Vector3(cx - cabW / 2, cy - cabH / 2 - 0.2, fwZ - cabD / 2), new THREE.Vector3(cx + cabW / 2, cy - cabH / 2 + 0.15, fwZ + cabD / 2)));
    // Roof
    colliders.push(new THREE.Box3(new THREE.Vector3(cx - cabW / 2 - 0.1, cy + cabH / 2 - 0.1, fwZ - cabD / 2 - 0.1), new THREE.Vector3(cx + cabW / 2 + 0.1, cy + cabH / 2 + 0.1, fwZ + cabD / 2 + 0.1)));
    // Back wall
    colliders.push(new THREE.Box3(new THREE.Vector3(cx - cabW / 2, cy - cabH / 2, fwZ - cabD / 2 - 0.15), new THREE.Vector3(cx + cabW / 2, cy + cabH / 2, fwZ - cabD / 2 + 0.15)));
    // Left wall
    colliders.push(new THREE.Box3(new THREE.Vector3(cx - cabW / 2 - 0.15, cy - cabH / 2, fwZ - cabD / 2), new THREE.Vector3(cx - cabW / 2 + 0.15, cy + cabH / 2, fwZ + cabD / 2)));
    // Right wall
    colliders.push(new THREE.Box3(new THREE.Vector3(cx + cabW / 2 - 0.15, cy - cabH / 2, fwZ - cabD / 2), new THREE.Vector3(cx + cabW / 2 + 0.15, cy + cabH / 2, fwZ + cabD / 2)));
  }

  // Ground shadow
  const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(platW + 2, platD + 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 }));
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(fwX, 0.02, fwZ);
  scene.add(shadowMesh);

  return wheelPivot;
}

// ========== DOCKSIDE CAFE & BAR ==========
function buildDocksideCafeBar(B: MapBoxHelper, scene: THREE.Scene) {
  const bx = 0, bz = -35;
  const BW = 18, BD = 12, BH = 7;
  const wt = 0.4;
  const navy = 0x0f1c2e;
  const warmWhite = 0xf5f5f5;
  const woodBrown = 0x8b5a2b;
  const orange = 0xff8c32;

  // === FOUNDATION + FLOOR ===
  B.colorBox(BW + 2, 0.2, BD + 2, bx, 0.1, bz, PALETTE.concreteDark, 0.9, 0.03, false);
  B.addCollider(bx - BW / 2 - 1, 0, bz - BD / 2 - 1, bx + BW / 2 + 1, 0.25, bz + BD / 2 + 1);
  B.colorBox(BW - wt * 2, 0.08, BD - wt * 2, bx, 0.24, bz, woodBrown, 0.85, 0.02, false);

  // === WALLS ===
  // Back wall (solid) — extended thick to fill gap to map boundary (z = -43)
  const backGap = 2.0;
  B.colorBox(BW, BH, wt + backGap, bx, BH / 2, bz - BD / 2 - backGap / 2, warmWhite, 0.85, 0.02, false);
  B.addCollider(bx - BW / 2, 0, bz - BD / 2 - backGap, bx + BW / 2, BH, bz - BD / 2 + wt / 2);

  // Left wall (with back door opening)
  B.colorBox(wt, BH, 4, bx - BW / 2, BH / 2, bz - BD / 2 + 2, warmWhite, 0.85, 0.02, false);
  B.addCollider(bx - BW / 2 - wt / 2, 0, bz - BD / 2, bx - BW / 2 + wt / 2, BH, bz - BD / 2 + 4);
  B.colorBox(wt, BH, 5, bx - BW / 2, BH / 2, bz + BD / 2 - 2.5, warmWhite, 0.85, 0.02, false);
  B.addCollider(bx - BW / 2 - wt / 2, 0, bz, bx - BW / 2 + wt / 2, BH, bz + BD / 2);
  // Above back door
  B.colorBox(wt, 3.5, 3, bx - BW / 2, BH - 1.75, bz - 1.5, warmWhite, 0.85, 0.02, false);
  B.addCollider(bx - BW / 2 - wt / 2, 3.5, bz - BD / 2 + 4, bx - BW / 2 + wt / 2, BH, bz);

  // Right wall (solid, extended back to fill gap to boundary)
  B.colorBox(wt, BH, BD + backGap, bx + BW / 2, BH / 2, bz - backGap / 2, warmWhite, 0.85, 0.02, false);
  B.addCollider(bx + BW / 2 - wt / 2, 0, bz - BD / 2 - backGap, bx + BW / 2 + wt / 2, BH, bz + BD / 2);

  // Front wall (glass with 2 door openings)
  // Left glass
  B.colorBox(4, BH, 0.1, bx - 7, BH / 2, bz + BD / 2, 0x88aacc, 0.1, 0.5, false);
  B.addCollider(bx - BW / 2, 0, bz + BD / 2 - 0.15, bx - 5, BH, bz + BD / 2 + 0.15);
  // Center glass
  B.colorBox(4, BH, 0.1, bx, BH / 2, bz + BD / 2, 0x88aacc, 0.1, 0.5, false);
  B.addCollider(bx - 2, 0, bz + BD / 2 - 0.15, bx + 2, BH, bz + BD / 2 + 0.15);
  // Right glass
  B.colorBox(4, BH, 0.1, bx + 7, BH / 2, bz + BD / 2, 0x88aacc, 0.1, 0.5, false);
  B.addCollider(bx + 5, 0, bz + BD / 2 - 0.15, bx + BW / 2, BH, bz + BD / 2 + 0.15);
  // Above doors
  B.colorBox(3, 2, 0.1, bx - 3.5, BH - 1, bz + BD / 2, 0x88aacc, 0.1, 0.5, false);
  B.addCollider(bx - 5, BH - 2, bz + BD / 2 - 0.15, bx - 2, BH, bz + BD / 2 + 0.15);
  B.colorBox(3, 2, 0.1, bx + 3.5, BH - 1, bz + BD / 2, 0x88aacc, 0.1, 0.5, false);
  B.addCollider(bx + 2, BH - 2, bz + BD / 2 - 0.15, bx + 5, BH, bz + BD / 2 + 0.15);

  // (Roof is built later, after spiral staircase, with a hole for rooftop access)

  // === L-SHAPED BAR COUNTER ===
  const barX = bx + 4, barZ = bz - 2;
  // Long side (along z)
  B.colorBox(1.0, 1.1, 5, barX, 0.75, barZ, woodBrown, 0.85, 0.02, false);
  B.addCollider(barX - 0.55, 0.2, barZ - 2.55, barX + 0.55, 1.3, barZ + 2.55);
  // Short side (along x)
  B.colorBox(3, 1.1, 1.0, barX - 2, 0.75, barZ + 2.5, woodBrown, 0.85, 0.02, false);
  B.addCollider(barX - 3.55, 0.2, barZ + 2, barX - 0.45, 1.3, barZ + 3.05);
  // Counter tops
  B.colorBox(1.2, 0.06, 5.2, barX, 1.33, barZ, 0x333333, 0.3, 0.5, false);
  B.colorBox(3.2, 0.06, 1.2, barX - 2, 1.33, barZ + 2.5, 0x333333, 0.3, 0.5, false);
  // Bar stools (3 along the long side)
  for (let i = 0; i < 3; i++) {
    const sz = barZ - 1.5 + i * 1.5;
    B.cyl(0.04, 0.06, 0.6, barX - 1.2, 0.3, sz, "steelDark");
    B.colorBox(0.3, 0.06, 0.3, barX - 1.2, 0.63, sz, 0x333333, 0.9, 0.02, false);
  }

  // === BOTTLE SHELF (behind bar, against back wall) ===
  B.colorBox(4, 2.0, 0.35, barX + 2, 1.4, bz - BD / 2 + 0.5, woodBrown, 0.85, 0.02, false);
  B.addCollider(barX + 0, 0.2, bz - BD / 2 + 0.25, barX + 4, 2.5, bz - BD / 2 + 0.75);
  // Shelf planks
  for (let s = 0; s < 3; s++) {
    B.colorBox(3.8, 0.04, 0.3, barX + 2, 0.7 + s * 0.65, bz - BD / 2 + 0.5, PALETTE.woodWarm, 0.82, 0.02, false);
  }
  // Bottles (decorative)
  for (let s = 0; s < 3; s++) {
    for (let b = 0; b < 6; b++) {
      const bc = [0x33aa33, 0xaa2222, 0x2255aa, 0xccaa22, 0x884422, 0xcc6600][b];
      B.cyl(0.03, 0.03, 0.2, barX + 0.5 + b * 0.6, 0.82 + s * 0.65, bz - BD / 2 + 0.5, "steelDark");
      B.colorBox(0.05, 0.15, 0.05, barX + 0.5 + b * 0.6, 0.78 + s * 0.65, bz - BD / 2 + 0.5, bc, 0.5, 0.3, false);
    }
  }

  // === TABLES + CHAIRS (2 rows) ===
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const tx = bx - 4 + col * 4;
      const tz = bz - 2.5 + row * 4;
      // Table
      B.colorBox(1.2, 0.06, 0.8, tx, 0.95, tz, woodBrown, 0.82, 0.02, false);
      B.addCollider(tx - 0.65, 0.2, tz - 0.45, tx + 0.65, 1.0, tz + 0.45);
      // Table leg
      B.cyl(0.05, 0.06, 0.6, tx, 0.6, tz, "steelDark");
      // 2 chairs per table (with legs touching floor at Y=0.28)
      const cSeatY = 0.58;
      // Left chair: leg + seat + backrest
      B.cyl(0.02, 0.02, 0.3, tx - 0.8, 0.43, tz, "steelDark");
      B.colorBox(0.35, 0.06, 0.35, tx - 0.8, cSeatY, tz, navy, 0.9, 0.02, true);
      B.colorBox(0.35, 0.45, 0.06, tx - 0.8, cSeatY + 0.25, tz - 0.15, navy, 0.9, 0.02, false);
      // Right chair: leg + seat + backrest
      B.cyl(0.02, 0.02, 0.3, tx + 0.8, 0.43, tz, "steelDark");
      B.colorBox(0.35, 0.06, 0.35, tx + 0.8, cSeatY, tz, navy, 0.9, 0.02, true);
      B.colorBox(0.35, 0.45, 0.06, tx + 0.8, cSeatY + 0.25, tz - 0.15, navy, 0.9, 0.02, false);
    }
  }

  // === STEP 1: BAR COUNTER PROPS ===
  // Coffee machine (center of long counter, on top surface Y=1.36)
  const counterTopY = 1.36;
  B.colorBox(0.35, 0.4, 0.3, barX, counterTopY + 0.2, barZ - 0.5, 0x222222, 0.7, 0.4, false);
  B.colorBox(0.15, 0.25, 0.15, barX + 0.05, counterTopY + 0.53, barZ - 0.5, 0x888888, 0.3, 0.6, false);
  // Coffee cups stack (next to machine)
  B.cyl(0.05, 0.04, 0.08, barX - 0.3, counterTopY + 0.04, barZ - 0.5, "steelLight");
  B.cyl(0.05, 0.04, 0.08, barX - 0.3, counterTopY + 0.12, barZ - 0.5, "steelLight");
  B.cyl(0.05, 0.04, 0.08, barX - 0.3, counterTopY + 0.04, barZ - 0.35, "steelLight");
  // Tip jar (glass cylinder)
  B.cyl(0.06, 0.06, 0.12, barX, counterTopY + 0.06, barZ + 0.3, "steelLight");
  // Cash register
  B.colorBox(0.3, 0.2, 0.25, barX, counterTopY + 0.1, barZ + 1.2, 0x333333, 0.8, 0.3, false);
  B.colorBox(0.25, 0.15, 0.02, barX, counterTopY + 0.28, barZ + 1.08, 0x115511, 0.5, 0.3, false);
  // Cutting board + knife (short counter side)
  B.colorBox(0.35, 0.03, 0.25, barX - 2, counterTopY + 0.015, barZ + 2.5, 0xc4a672, 0.9, 0.02, false);
  B.colorBox(0.02, 0.02, 0.2, barX - 1.75, counterTopY + 0.05, barZ + 2.5, 0xcccccc, 0.3, 0.7, false);
  // Napkin holder on short counter
  B.colorBox(0.12, 0.15, 0.06, barX - 2.5, counterTopY + 0.075, barZ + 2.5, 0x666666, 0.7, 0.3, false);

  // === STEP 2: TABLE DECORATION ===
  const tableTopY = 0.98;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const tx = bx - 4 + col * 4;
      const tz = bz - 2.5 + row * 4;
      // Small plant pot (center)
      B.cyl(0.06, 0.05, 0.1, tx, tableTopY + 0.05, tz, "steelDark");
      B.colorBox(0.04, 0.12, 0.04, tx, tableTopY + 0.16, tz, 0x228833, 0.85, 0.02, false);
      // Salt & pepper
      B.cyl(0.02, 0.02, 0.08, tx + 0.25, tableTopY + 0.04, tz + 0.15, "steelLight");
      B.cyl(0.02, 0.02, 0.08, tx + 0.3, tableTopY + 0.04, tz + 0.15, "steelDark");
      // Napkin holder
      B.colorBox(0.1, 0.1, 0.04, tx - 0.3, tableTopY + 0.05, tz + 0.2, 0x666666, 0.7, 0.3, false);
    }
  }

  // === STEP 3: FLOOR PROPS (good Prop Hunt hiding spots) ===
  // Wooden crate near back-left wall
  B.colorBox(0.7, 0.7, 0.7, bx - 7.5, 0.59, bz - BD / 2 + 1.0, 0x926e3a, 0.85, 0.02, true);
  // Smaller crate stacked
  B.colorBox(0.5, 0.5, 0.5, bx - 7.5, 1.19, bz - BD / 2 + 1.0, 0xa0784a, 0.85, 0.02, true);
  // Coffee bean sack beside crates
  B.colorBox(0.5, 0.4, 0.35, bx - 7.5, 0.44, bz - BD / 2 + 2.0, 0x8b7355, 0.95, 0.02, true);
  // Trash bin near bar counter corner
  B.cyl(0.2, 0.18, 0.45, barX - 0.5, 0.47, barZ + 3.5, "steelDark", true);
  // Mop and bucket near back wall (right side, away from staircase)
  B.cyl(0.15, 0.12, 0.25, barX + 2.5, 0.37, bz - BD / 2 + 1.2, "steelLight", true);
  B.cyl(0.02, 0.02, 1.2, barX + 2.5, 0.85, bz - BD / 2 + 1.2, "steelDark");
  // Umbrella stand near front entrance
  B.cyl(0.12, 0.1, 0.4, bx - 4.5, 0.44, bz + BD / 2 - 0.6, "steelDark", true);
  B.cyl(0.015, 0.015, 0.7, bx - 4.5, 0.64, bz + BD / 2 - 0.6, "steelDark");
  // Wine barrel (decorative, near DJ area)
  B.cyl(0.35, 0.3, 0.55, bx - 4.5, 0.52, bz - BD / 2 + 1.5, "steelDark");
  B.colorBox(0.02, 0.55, 0.65, bx - 4.5, 0.52, bz - BD / 2 + 1.5, 0x665533, 0.85, 0.02, false);

  // === STEP 4: WALL DECOR ===
  // Menu chalkboard on back wall above bar shelf
  B.colorBox(1.8, 1.0, 0.06, barX + 2, 3.2, bz - BD / 2 + 0.25, 0x1a1a1a, 0.95, 0.02, false);
  B.colorBox(1.9, 1.1, 0.04, barX + 2, 3.2, bz - BD / 2 + 0.22, 0x8b5a2b, 0.85, 0.02, false);
  // Wall lamps (warm orange glow) on back wall
  const lampMat = getEmissiveMaterial(0xffaa44, 0xffaa44, 0.6);
  const lamp1 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), lampMat);
  lamp1.position.set(barX + 0.5, 2.8, bz - BD / 2 + 0.3);
  scene.add(lamp1);
  const lamp2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), lampMat);
  lamp2.position.set(barX + 3.5, 2.8, bz - BD / 2 + 0.3);
  scene.add(lamp2);
  // Lamp brackets
  B.colorBox(0.04, 0.15, 0.1, barX + 0.5, 2.85, bz - BD / 2 + 0.25, 0x333333, 0.5, 0.5, false);
  B.colorBox(0.04, 0.15, 0.1, barX + 3.5, 2.85, bz - BD / 2 + 0.25, 0x333333, 0.5, 0.5, false);
  // Framed picture on back wall (inside, above bottle shelf)
  const frameW = 0.8, frameH = 1.0;
  B.colorBox(frameW + 0.1, frameH + 0.1, 0.06, bx - 3, 3.5, bz - BD / 2 + 0.25, 0x3a3a3a, 0.85, 0.02, false);
  const picTexture = new THREE.TextureLoader().load("assets/photos/bad-girl.jpeg");
  const picMat = new THREE.MeshBasicMaterial({ map: picTexture });
  const picMesh = new THREE.Mesh(new THREE.PlaneGeometry(frameW, frameH), picMat);
  picMesh.position.set(bx - 3, 3.5, bz - BD / 2 + 0.29);
  scene.add(picMesh);

  // === STEP 5: ATMOSPHERE PROPS ===
  // Stack of books on table (0, -33.5)
  B.colorBox(0.2, 0.06, 0.15, bx, tableTopY + 0.03, bz + 1.5, 0xaa2222, 0.9, 0.02, false);
  B.colorBox(0.2, 0.06, 0.15, bx, tableTopY + 0.09, bz + 1.5, 0x2255aa, 0.9, 0.02, false);
  B.colorBox(0.18, 0.06, 0.14, bx, tableTopY + 0.15, bz + 1.5, 0x885500, 0.9, 0.02, false);
  // Bottle and glass on table (-4, -33.5)
  B.cyl(0.03, 0.03, 0.22, bx - 4 + 0.2, tableTopY + 0.11, bz + 1.5 - 0.15, "steelDark");
  B.colorBox(0.05, 0.18, 0.05, bx - 4 + 0.2, tableTopY + 0.09, bz + 1.5 - 0.15, 0x33aa33, 0.3, 0.5, false);
  B.cyl(0.035, 0.03, 0.1, bx - 4 - 0.1, tableTopY + 0.05, bz + 1.5 - 0.1, "steelLight");
  // Small stool near counter (extra hiding spot)
  B.cyl(0.15, 0.15, 0.03, barX - 1.2, 0.42, barZ + 1.8, "steelDark");
  B.cyl(0.04, 0.04, 0.4, barX - 1.2, 0.22, barZ + 1.8, "steelDark");
  // Potted plant on floor near front entrance (right side)
  B.cyl(0.15, 0.12, 0.2, bx + 4.5, 0.34, bz + BD / 2 - 0.8, "steelDark");
  B.colorBox(0.06, 0.5, 0.06, bx + 4.5, 0.69, bz + BD / 2 - 0.8, 0x556633, 0.85, 0.02, false);
  B.colorBox(0.35, 0.35, 0.35, bx + 4.5, 0.92, bz + BD / 2 - 0.8, 0x228833, 0.85, 0.02, false);
  // Hanging light fixtures (3 pendant lamps over tables)
  for (let li = 0; li < 3; li++) {
    const lx = bx - 4 + li * 4;
    B.cyl(0.005, 0.005, 1.5, lx, BH - 0.75, bz - 0.5, "steelDark");
    const pendantMat = getEmissiveMaterial(0xffddaa, 0xffddaa, 0.3);
    const pendant = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.25, 8), pendantMat);
    pendant.position.set(lx, BH - 1.65, bz - 0.5);
    pendant.rotation.x = Math.PI;
    scene.add(pendant);
  }

  // === DJ CORNER (back-left) ===
  const djX = bx - 6, djZ = bz - 3;
  // DJ booth
  B.colorBox(2.0, 1.0, 0.8, djX, 0.7, djZ, navy, 0.85, 0.02, false);
  B.addCollider(djX - 1.05, 0.2, djZ - 0.45, djX + 1.05, 1.2, djZ + 0.45);
  // DJ equipment on top
  B.colorBox(0.8, 0.1, 0.5, djX - 0.3, 1.25, djZ, 0x222222, 0.8, 0.3, false);
  B.colorBox(0.4, 0.15, 0.3, djX + 0.5, 1.28, djZ, 0x333333, 0.7, 0.4, false);
  // Speakers (2)
  B.colorBox(0.5, 0.8, 0.4, djX - 1.5, 0.6, djZ, 0x222222, 0.9, 0.05, true);
  B.colorBox(0.5, 0.8, 0.4, djX + 1.5, 0.6, djZ, 0x222222, 0.9, 0.05, true);
  // Speaker cones
  B.cyl(0.15, 0.15, 0.04, djX - 1.5, 0.7, djZ + 0.22, "steelDark");
  B.cyl(0.15, 0.15, 0.04, djX + 1.5, 0.7, djZ + 0.22, "steelDark");
  // Light beam on stage (emissive)
  const beamMat = getEmissiveMaterial(orange, orange, 0.4);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.5, 4, 8), beamMat);
  beam.position.set(djX, BH - 2, djZ);
  beam.material.transparent = true;
  beam.material.opacity = 0.15;
  scene.add(beam);

  // === INTERIOR SPIRAL STAIRCASE (back-right corner, leads to rooftop) ===
  const spiralX = bx + 6, spiralZ = bz - 3;
  const spiralR = 1.8;
  const spiralSteps = 18;
  const spiralTotalAngle = Math.PI * 2.2;
  const stepRise = BH / spiralSteps;
  const _steelMat = PALETTE.steelLight;
  const stepColor = 0x333333;

  // Central pole
  B.cyl(0.1, 0.1, BH + 0.5, spiralX, BH / 2 + 0.1, spiralZ, "steelDark", false);

  // Spiral steps
  for (let i = 0; i < spiralSteps; i++) {
    const angle = (i / spiralSteps) * spiralTotalAngle - Math.PI / 2;
    const sy = 0.3 + (i + 1) * stepRise;
    const sx = spiralX + Math.cos(angle) * spiralR * 0.5;
    const sz = spiralZ + Math.sin(angle) * spiralR * 0.5;

    // Wedge-shaped step (approximated with box, rotated)
    const stepMesh = new THREE.Mesh(
      new THREE.BoxGeometry(spiralR, 0.08, 0.7),
      getCustomMaterial(stepColor, 0.5, 0.5)
    );
    stepMesh.position.set(sx, sy, sz);
    stepMesh.rotation.y = -angle;
    stepMesh.castShadow = true;
    stepMesh.receiveShadow = true;
    scene.add(stepMesh);

    // Step collider (AABB around step position)
    const cr = spiralR * 0.55;
    B.addCollider(
      spiralX + Math.cos(angle) * cr - 0.7, sy - stepRise * 0.6,
      spiralZ + Math.sin(angle) * cr - 0.7,
      spiralX + Math.cos(angle) * cr + 0.7, sy + 0.08,
      spiralZ + Math.sin(angle) * cr + 0.7
    );

    // Handrail post (outer edge) - only below roof level to avoid clipping through ceiling
    const postX = spiralX + Math.cos(angle) * (spiralR + 0.1);
    const postZ = spiralZ + Math.sin(angle) * (spiralR + 0.1);
    const postTopY = sy + 0.9;
    if (postTopY <= BH + 0.1) {
      const postHeight = Math.min(0.9, BH - sy + 0.05);
      if (postHeight > 0.1) {
        B.cyl(0.025, 0.025, postHeight, postX, sy + postHeight / 2, postZ, "steelDark", false);
        // Railing collider to prevent props from clipping through
        B.addCollider(
          postX - 0.15, sy, postZ - 0.15,
          postX + 0.15, sy + postHeight, postZ + 0.15
        );
      }
    }
  }

  // Handrail (outer ring, approximated with thin curved segments)
  // Only render segments that stay below roof level
  for (let i = 0; i < spiralSteps - 1; i++) {
    const a1 = (i / spiralSteps) * spiralTotalAngle - Math.PI / 2;
    const a2 = ((i + 1) / spiralSteps) * spiralTotalAngle - Math.PI / 2;
    const y1 = 0.3 + (i + 1) * stepRise + 0.9;
    const y2 = 0.3 + (i + 2) * stepRise + 0.9;
    if (y1 > BH + 0.1 || y2 > BH + 0.1) continue;
    const hx1 = spiralX + Math.cos(a1) * (spiralR + 0.1);
    const hz1 = spiralZ + Math.sin(a1) * (spiralR + 0.1);
    const hx2 = spiralX + Math.cos(a2) * (spiralR + 0.1);
    const hz2 = spiralZ + Math.sin(a2) * (spiralR + 0.1);
    const railLen = Math.sqrt((hx2 - hx1) ** 2 + (y2 - y1) ** 2 + (hz2 - hz1) ** 2);
    const railMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, railLen, 6),
      getMaterial("steelDark")
    );
    railMesh.position.set((hx1 + hx2) / 2, (y1 + y2) / 2, (hz1 + hz2) / 2);
    railMesh.lookAt(hx2, y2, hz2);
    railMesh.rotateX(Math.PI / 2);
    scene.add(railMesh);
  }

  // Roof opening above spiral staircase (hole in ceiling)
  // The main roof is rebuilt as panels around this opening
  const holeR = spiralR + 0.5;

  // Roof railing around staircase opening (6 posts + top rail, clean look)
  const holeSegments = 6;
  for (let i = 0; i < holeSegments; i++) {
    const a = (i / holeSegments) * Math.PI * 2;
    const rx = spiralX + Math.cos(a) * (holeR + 0.15);
    const rz = spiralZ + Math.sin(a) * (holeR + 0.15);
    B.cyl(0.035, 0.035, 1.0, rx, BH + 0.5, rz, "steelDark", false);
  }
  // Top rail ring (6 segments)
  for (let i = 0; i < holeSegments; i++) {
    const a1 = (i / holeSegments) * Math.PI * 2;
    const a2 = ((i + 1) / holeSegments) * Math.PI * 2;
    const rx1 = spiralX + Math.cos(a1) * (holeR + 0.15);
    const rz1 = spiralZ + Math.sin(a1) * (holeR + 0.15);
    const rx2 = spiralX + Math.cos(a2) * (holeR + 0.15);
    const rz2 = spiralZ + Math.sin(a2) * (holeR + 0.15);
    const segLen = Math.sqrt((rx2 - rx1) ** 2 + (rz2 - rz1) ** 2);
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, segLen, 4),
      getMaterial("steelDark")
    );
    seg.position.set((rx1 + rx2) / 2, BH + 1.0, (rz1 + rz2) / 2);
    seg.rotation.z = Math.PI / 2;
    seg.rotation.y = Math.atan2(rz2 - rz1, rx2 - rx1);
    scene.add(seg);
  }
  // Collider around the staircase opening to prevent props from clipping through
  for (let i = 0; i < holeSegments; i++) {
    const a = (i / holeSegments) * Math.PI * 2;
    const a2 = ((i + 1) / holeSegments) * Math.PI * 2;
    const cx1 = spiralX + Math.cos(a) * (holeR + 0.1);
    const cz1 = spiralZ + Math.sin(a) * (holeR + 0.1);
    const cx2 = spiralX + Math.cos(a2) * (holeR + 0.1);
    const cz2 = spiralZ + Math.sin(a2) * (holeR + 0.1);
    B.addCollider(
      Math.min(cx1, cx2) - 0.1, BH, Math.min(cz1, cz2) - 0.1,
      Math.max(cx1, cx2) + 0.1, BH + 1.1, Math.max(cz1, cz2) + 0.1
    );
  }

  // === ROOF (rebuilt with hole for spiral staircase) ===
  // Left section (from left edge to spiral hole)
  const roofLeftW = (spiralX - holeR) - (bx - BW / 2 - 0.5);
  if (roofLeftW > 0) {
    const rlx = (bx - BW / 2 - 0.5 + spiralX - holeR) / 2;
    B.colorBox(roofLeftW, 0.25, BD + 1, rlx, BH + 0.12, bz, navy, 0.9, 0.03, false);
    B.addCollider(bx - BW / 2 - 0.5, BH, bz - BD / 2 - 0.5, spiralX - holeR, BH + 0.3, bz + BD / 2 + 0.5);
  }
  // Right section (from spiral hole to right edge)
  const roofRightW = (bx + BW / 2 + 0.5) - (spiralX + holeR);
  if (roofRightW > 0) {
    const rrx = (spiralX + holeR + bx + BW / 2 + 0.5) / 2;
    B.colorBox(roofRightW, 0.25, BD + 1, rrx, BH + 0.12, bz, navy, 0.9, 0.03, false);
    B.addCollider(spiralX + holeR, BH, bz - BD / 2 - 0.5, bx + BW / 2 + 0.5, BH + 0.3, bz + BD / 2 + 0.5);
  }
  // Front strip (in front of hole)
  const roofFrontD = (spiralZ - holeR) - (bz - BD / 2 - 0.5);
  if (roofFrontD > 0) {
    const rfz = (bz - BD / 2 - 0.5 + spiralZ - holeR) / 2;
    B.colorBox(holeR * 2, 0.25, roofFrontD, spiralX, BH + 0.12, rfz, navy, 0.9, 0.03, false);
    B.addCollider(spiralX - holeR, BH, bz - BD / 2 - 0.5, spiralX + holeR, BH + 0.3, spiralZ - holeR);
  }
  // Back strip (behind hole)
  const roofBackD = (bz + BD / 2 + 0.5) - (spiralZ + holeR);
  if (roofBackD > 0) {
    const rbz = (spiralZ + holeR + bz + BD / 2 + 0.5) / 2;
    B.colorBox(holeR * 2, 0.25, roofBackD, spiralX, BH + 0.12, rbz, navy, 0.9, 0.03, false);
    B.addCollider(spiralX - holeR, BH, spiralZ + holeR, spiralX + holeR, BH + 0.3, bz + BD / 2 + 0.5);
  }

  // === ROOFTOP ===
  // Railings (3 sides — back side has NO railing so players can fall off)
  // Front railing
  B.colorBox(BW, 0.06, 0.06, bx, BH + 1, bz + BD / 2, navy, 0.85, 0.02, false);
  B.addCollider(bx - BW / 2, BH, bz + BD / 2 - 0.15, bx + BW / 2, BH + 1.1, bz + BD / 2 + 0.15);
  // Left railing
  B.colorBox(0.06, 0.06, BD, bx - BW / 2, BH + 1, bz, navy, 0.85, 0.02, false);
  B.addCollider(bx - BW / 2 - 0.15, BH, bz - BD / 2, bx - BW / 2 + 0.15, BH + 1.1, bz + BD / 2);
  // Right railing
  B.colorBox(0.06, 0.06, BD, bx + BW / 2, BH + 1, bz, navy, 0.85, 0.02, false);
  B.addCollider(bx + BW / 2 - 0.15, BH, bz - BD / 2, bx + BW / 2 + 0.15, BH + 1.1, bz + BD / 2);
  // Railing posts (front, left, right only)
  for (let i = 0; i < 8; i++) {
    const px = bx - BW / 2 + 1 + i * (BW / 7);
    B.colorBox(0.05, 0.9, 0.05, px, BH + 0.55, bz + BD / 2, navy, 0.85, 0.02, false);
  }
  for (let i = 0; i < 5; i++) {
    const pz = bz - BD / 2 + 1 + i * (BD / 4);
    B.colorBox(0.05, 0.9, 0.05, bx - BW / 2, BH + 0.55, pz, navy, 0.85, 0.02, false);
    B.colorBox(0.05, 0.9, 0.05, bx + BW / 2, BH + 0.55, pz, navy, 0.85, 0.02, false);
  }
  // ======================================================================
  //  LUXURY ROOFTOP BAR LOUNGE
  // ======================================================================
  const RY = BH + 0.25; // roof floor surface Y
  const rLeft = bx - BW / 2 + 0.8;  // -8.2
  const rRight = bx + BW / 2 - 0.8; //  8.2
  const rFront = bz + BD / 2 - 0.8; // -29.8
  const rBack = bz - BD / 2 + 0.8;  // -40.2
  const stairHoleX = 6, stairHoleZ = -38, stairClear = 2.8;
  const luxWood = 0x7a5230;
  const luxDark = 0x1a1a2e;
  const luxGold = 0xc9a84c;
  const luxCushion = 0x2c3e50;

  // === ZONE A: LOUNGE AREA (left side) ===
  const loungeX = rLeft + 2.5, loungeZ = bz + 1;
  // Decorative rug (flat on floor)
  B.colorBox(5.0, 0.02, 4.0, loungeX, RY + 0.01, loungeZ, 0x8b3a3a, 0.95, 0.02, false);
  // L-shaped sofa — long section (along z)
  B.colorBox(3.5, 0.35, 0.8, loungeX - 0.5, RY + 0.175, loungeZ - 1.2, luxCushion, 0.9, 0.05, true);
  B.colorBox(3.5, 0.35, 0.15, loungeX - 0.5, RY + 0.35, loungeZ - 1.6, luxDark, 0.85, 0.1, false);
  // L-shaped sofa — short section (along x)
  B.colorBox(0.8, 0.35, 2.2, loungeX - 2.5, RY + 0.175, loungeZ, luxCushion, 0.9, 0.05, true);
  B.colorBox(0.15, 0.35, 2.2, loungeX - 2.9, RY + 0.35, loungeZ, luxDark, 0.85, 0.1, false);
  // Sofa armrests
  B.colorBox(0.15, 0.45, 0.8, loungeX + 1.3, RY + 0.225, loungeZ - 1.2, luxDark, 0.85, 0.1, false);
  B.colorBox(0.8, 0.45, 0.15, loungeX - 2.5, RY + 0.225, loungeZ + 1.15, luxDark, 0.85, 0.1, false);
  // Coffee table (low, in front of sofa)
  B.colorBox(1.2, 0.06, 0.6, loungeX, RY + 0.38, loungeZ, luxWood, 0.82, 0.02, false);
  B.cyl(0.04, 0.04, 0.35, loungeX - 0.4, RY + 0.175, loungeZ, "steelDark");
  B.cyl(0.04, 0.04, 0.35, loungeX + 0.4, RY + 0.175, loungeZ, "steelDark");
  // Fire pit table (center of lounge, emissive glow)
  B.cyl(0.4, 0.35, 0.3, loungeX, RY + 0.15, loungeZ + 1.5, "steelDark", true);
  const fireMat = getEmissiveMaterial(0xff6622, 0xff4400, 0.7);
  const fireGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 12), fireMat);
  fireGlow.position.set(loungeX, RY + 0.32, loungeZ + 1.5);
  scene.add(fireGlow);
  // Two lounge chairs (opposite sofa)
  for (const off of [-0.8, 0.8]) {
    B.colorBox(0.7, 0.3, 0.7, loungeX + off, RY + 0.15, loungeZ + 2.5, luxCushion, 0.9, 0.05, true);
    B.colorBox(0.7, 0.4, 0.1, loungeX + off, RY + 0.35, loungeZ + 2.85, luxDark, 0.85, 0.1, false);
  }

  // === ZONE B: ROOFTOP BAR COUNTER (right-front, away from staircase) ===
  const rBarX = bx + 2, rBarZ = rFront + 0.8;
  // Counter (long, along x)
  B.colorBox(5.0, 1.1, 0.8, rBarX, RY + 0.55, rBarZ, luxDark, 0.85, 0.05, false);
  B.addCollider(rBarX - 2.55, RY, rBarZ - 0.45, rBarX + 2.55, RY + 1.15, rBarZ + 0.45);
  // Counter top (marble effect)
  B.colorBox(5.2, 0.06, 0.9, rBarX, RY + 1.13, rBarZ, 0xdddddd, 0.15, 0.7, false);
  // 4 bar stools
  for (let s = 0; s < 4; s++) {
    const sx = rBarX - 1.8 + s * 1.2;
    B.cyl(0.04, 0.04, 0.55, sx, RY + 0.275, rBarZ + 0.8, "steelDark");
    B.cyl(0.14, 0.14, 0.06, sx, RY + 0.58, rBarZ + 0.8, "steelDark");
    B.colorBox(0.28, 0.06, 0.28, sx, RY + 0.61, rBarZ + 0.8, luxCushion, 0.9, 0.02, false);
  }
  // Bar counter props (on counter top, Y = RY + 1.16)
  const rBarTopY = RY + 1.16;
  // Cocktail shaker
  B.cyl(0.04, 0.03, 0.2, rBarX - 1.5, rBarTopY + 0.1, rBarZ, "steelLight");
  // Bottle rack (3 bottles)
  for (let b = 0; b < 3; b++) {
    const bc = [0x33aa33, 0xaa2222, 0xccaa22][b];
    B.cyl(0.03, 0.02, 0.22, rBarX - 0.3 + b * 0.3, rBarTopY + 0.11, rBarZ - 0.15, "steelDark");
    B.colorBox(0.05, 0.18, 0.05, rBarX - 0.3 + b * 0.3, rBarTopY + 0.09, rBarZ - 0.15, bc, 0.3, 0.5, false);
  }
  // Glasses tray
  B.colorBox(0.5, 0.03, 0.25, rBarX + 1.2, rBarTopY + 0.015, rBarZ, 0x888888, 0.3, 0.6, false);
  B.cyl(0.03, 0.025, 0.08, rBarX + 1.0, rBarTopY + 0.07, rBarZ, "steelLight");
  B.cyl(0.03, 0.025, 0.08, rBarX + 1.2, rBarTopY + 0.07, rBarZ, "steelLight");
  B.cyl(0.03, 0.025, 0.08, rBarX + 1.4, rBarTopY + 0.07, rBarZ, "steelLight");

  // === ZONE C: DINING TABLES (center-right, 2 tables avoiding staircase) ===
  const diningPositions = [
    { x: bx - 2, z: bz - 2 },
    { x: bx + 1, z: bz + 2 },
  ];
  for (const dp of diningPositions) {
    const dtH = 0.75;
    const dtTopY = RY + dtH;
    // Round table (approximated)
    B.cyl(0.5, 0.5, 0.06, dp.x, dtTopY, dp.z, "steelDark");
    B.colorBox(1.0, 0.04, 1.0, dp.x, dtTopY + 0.02, dp.z, luxWood, 0.82, 0.02, false);
    B.cyl(0.06, 0.08, dtH - 0.1, dp.x, RY + (dtH - 0.1) / 2, dp.z, "steelDark");
    B.addCollider(dp.x - 0.55, RY, dp.z - 0.55, dp.x + 0.55, dtTopY + 0.04, dp.z + 0.55);
    // 4 chairs
    for (let ci = 0; ci < 4; ci++) {
      const ca = (ci / 4) * Math.PI * 2;
      const ccx = dp.x + Math.cos(ca) * 0.85;
      const ccz = dp.z + Math.sin(ca) * 0.85;
      B.cyl(0.03, 0.03, 0.4, ccx, RY + 0.2, ccz, "steelDark");
      B.colorBox(0.3, 0.05, 0.3, ccx, RY + 0.425, ccz, luxCushion, 0.9, 0.02, false);
    }
    // Candle (on table)
    B.cyl(0.03, 0.03, 0.1, dp.x + 0.15, dtTopY + 0.07, dp.z, "steelLight");
    const candleMat = getEmissiveMaterial(0xffcc66, 0xffaa33, 0.5);
    const candle = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), candleMat);
    candle.position.set(dp.x + 0.15, dtTopY + 0.14, dp.z);
    scene.add(candle);
    // Small plant centerpiece
    B.cyl(0.05, 0.04, 0.08, dp.x - 0.15, dtTopY + 0.06, dp.z + 0.1, "steelDark");
    B.colorBox(0.06, 0.1, 0.06, dp.x - 0.15, dtTopY + 0.13, dp.z + 0.1, 0x228833, 0.85, 0.02, false);
  }

  // === ZONE D: DECORATIVE PERIMETER ===
  // Large potted plants along railings (every ~2.5m, skip staircase area)
  const plantPositions = [
    { x: rLeft + 0.5, z: rFront },
    { x: rLeft + 0.5, z: bz - 2 },
    { x: rLeft + 0.5, z: rBack + 1 },
    { x: rRight - 0.5, z: rFront },
    { x: rRight - 0.5, z: bz },
    { x: bx - 3, z: rFront },
  ];
  for (const pp of plantPositions) {
    // Skip if too close to staircase hole
    const dx = pp.x - stairHoleX, dz = pp.z - stairHoleZ;
    if (Math.sqrt(dx * dx + dz * dz) < stairClear + 0.5) continue;
    B.cyl(0.2, 0.16, 0.35, pp.x, RY + 0.175, pp.z, "steelDark");
    B.cyl(0.03, 0.03, 0.6, pp.x, RY + 0.65, pp.z, "steelDark");
    B.colorBox(0.5, 0.5, 0.5, pp.x, RY + 1.2, pp.z, 0x1a6b2a, 0.85, 0.02, false);
  }

  // === LIGHTING ===
  // String lights between railing posts (front)
  const roofLightMat = getEmissiveMaterial(0xffeeaa, 0xffddaa, 0.6);
  for (let i = 0; i < 7; i++) {
    const lx = bx - BW / 2 + 1.5 + i * (BW / 7);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), roofLightMat);
    bulb.position.set(lx, BH + 0.85, bz + BD / 2);
    scene.add(bulb);
  }
  // Standing floor lamps (4, near seating areas)
  const lampPositions = [
    { x: loungeX + 2, z: loungeZ - 1 },
    { x: loungeX - 2.8, z: loungeZ + 1.5 },
    { x: rBarX - 2.8, z: rBarZ + 0.5 },
    { x: rBarX + 2.8, z: rBarZ + 0.5 },
  ];
  for (const lp of lampPositions) {
    const dx2 = lp.x - stairHoleX, dz2 = lp.z - stairHoleZ;
    if (Math.sqrt(dx2 * dx2 + dz2 * dz2) < stairClear) continue;
    B.cyl(0.12, 0.12, 0.03, lp.x, RY + 0.015, lp.z, "steelDark");
    B.cyl(0.025, 0.025, 1.6, lp.x, RY + 0.83, lp.z, "steelDark");
    const floorLampMat = getEmissiveMaterial(0xffeecc, 0xffddaa, 0.4);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 0.25, 8), floorLampMat);
    shade.position.set(lp.x, RY + 1.75, lp.z);
    scene.add(shade);
  }

  // === PROP HUNT HIDING OBJECTS ===
  // Small bucket near bar
  B.cyl(0.15, 0.12, 0.25, rBarX + 2.2, RY + 0.125, rBarZ + 0.3, "steelLight", true);
  // Bottle on floor near lounge
  B.cyl(0.03, 0.03, 0.2, loungeX + 2.2, RY + 0.1, loungeZ + 0.5, "steelDark");
  B.colorBox(0.05, 0.16, 0.05, loungeX + 2.2, RY + 0.08, loungeZ + 0.5, 0x33aa33, 0.3, 0.5, false);
  // Small crate near back edge
  B.colorBox(0.5, 0.5, 0.5, rLeft + 0.5, RY + 0.25, rBack + 3, 0x926e3a, 0.85, 0.02, true);
  // Flower pot near railing
  B.cyl(0.1, 0.08, 0.15, bx - 1, RY + 0.075, rFront, "steelDark");
  B.colorBox(0.05, 0.12, 0.05, bx - 1, RY + 0.21, rFront, 0x228833, 0.85, 0.02, false);
  // Small trash bin
  B.cyl(0.12, 0.1, 0.3, rRight - 0.5, RY + 0.15, bz + 1, "steelDark", true);
  // Stool near bar
  B.cyl(0.15, 0.15, 0.04, rBarX - 2.8, RY + 0.38, rBarZ + 1.2, "steelDark");
  B.cyl(0.04, 0.04, 0.35, rBarX - 2.8, RY + 0.175, rBarZ + 1.2, "steelDark");

  // === NEON SIGN "DOCKSIDE BAR" (mounted on front wall, below rooftop railing) ===
  const signMat = getEmissiveMaterial(orange, orange, 0.9);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 0.1), signMat);
  sign.position.set(bx, BH - 1.5, bz + BD / 2 + 0.2);
  scene.add(sign);
  B.colorBox(6.4, 1.0, 0.15, bx, BH - 1.5, bz + BD / 2 + 0.15, navy, 0.85, 0.02, false);
  const cafeText = makeSignTextMesh("DOCKSIDE BAR", 5.6, 0.7, 38, "#ffffff", null);
  cafeText.position.set(bx, BH - 1.5, bz + BD / 2 + 0.27);
  scene.add(cafeText);

  // === TERRACE (outdoor area, front) ===
  const tZ = bz + BD / 2 + 3;
  // Terrace floor
  B.colorBox(BW, 0.1, 4, bx, 0.15, tZ, PALETTE.woodWarm, 0.85, 0.02, false);
  B.addCollider(bx - BW / 2, 0, tZ - 2, bx + BW / 2, 0.22, tZ + 2);
  // Outdoor tables with umbrellas (3, wider spacing to prevent overlap)
  for (let i = 0; i < 3; i++) {
    const otx = bx - 5.5 + i * 5.5;
    // Table (round feel with square geometry)
    B.colorBox(0.9, 0.06, 0.9, otx, 0.85, tZ, PALETTE.woodWarm, 0.82, 0.02, false);
    B.addCollider(otx - 0.5, 0.2, tZ - 0.5, otx + 0.5, 0.9, tZ + 0.5);
    B.cyl(0.04, 0.05, 0.55, otx, 0.55, tZ, "steelDark");
    // Umbrella pole + canopy (raised higher to clear string lights)
    B.cyl(0.03, 0.03, 2.0, otx, 1.7, tZ, "steelDark");
    const umbColor = [0xff4444, 0x4488ff, 0xffaa22][i];
    B.colorBox(1.8, 0.05, 1.8, otx, 2.75, tZ, umbColor, 0.8, 0.05, false);
    // 4 chairs per table (front, back, left, right) with legs
    const floorY = 0.22;
    const seatH = 0.5;
    const seatY = floorY + seatH;
    // Chair left: seat + legs + backrest
    B.colorBox(0.35, 0.06, 0.35, otx - 0.8, seatY, tZ, navy, 0.9, 0.02, true);
    B.cyl(0.02, 0.02, seatH - 0.03, otx - 0.8, floorY + seatH / 2, tZ, "steelDark");
    B.colorBox(0.35, 0.4, 0.06, otx - 0.8, seatY + 0.23, tZ - 0.15, navy, 0.9, 0.02, false);
    // Chair right: seat + legs + backrest
    B.colorBox(0.35, 0.06, 0.35, otx + 0.8, seatY, tZ, navy, 0.9, 0.02, true);
    B.cyl(0.02, 0.02, seatH - 0.03, otx + 0.8, floorY + seatH / 2, tZ, "steelDark");
    B.colorBox(0.35, 0.4, 0.06, otx + 0.8, seatY + 0.23, tZ - 0.15, navy, 0.9, 0.02, false);
    // Chair back
    B.colorBox(0.35, 0.06, 0.35, otx, seatY, tZ - 0.8, navy, 0.9, 0.02, true);
    B.cyl(0.02, 0.02, seatH - 0.03, otx, floorY + seatH / 2, tZ - 0.8, "steelDark");
    // Chair front
    B.colorBox(0.35, 0.06, 0.35, otx, seatY, tZ + 0.8, navy, 0.9, 0.02, true);
    B.cyl(0.02, 0.02, seatH - 0.03, otx, floorY + seatH / 2, tZ + 0.8, "steelDark");
    // Drinks on table (table top at Y=0.88)
    const tableY = 0.88;
    // Glass (left)
    B.cyl(0.035, 0.03, 0.1, otx - 0.2, tableY + 0.05, tZ + 0.15, "steelLight");
    // Glass (right)
    B.cyl(0.035, 0.03, 0.1, otx + 0.2, tableY + 0.05, tZ - 0.15, "steelLight");
    // Bottle (center-back)
    B.cyl(0.03, 0.02, 0.2, otx + 0.1, tableY + 0.1, tZ + 0.25, "steelDark");
    B.colorBox(0.05, 0.16, 0.05, otx + 0.1, tableY + 0.08, tZ + 0.25, 0x33aa33, 0.3, 0.5, false);
    // Napkin holder
    B.colorBox(0.08, 0.08, 0.04, otx - 0.25, tableY + 0.04, tZ - 0.25, 0x666666, 0.7, 0.3, false);
  }

  // String lights over terrace
  const lightMat2 = getEmissiveMaterial(0xffeeaa, 0xffeeaa, 0.5);
  for (let i = 0; i < 10; i++) {
    const lx = bx - BW / 2 + 1 + i * (BW / 9);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), lightMat2);
    bulb.position.set(lx, 2.8, tZ);
    scene.add(bulb);
  }
  B.colorBox(BW - 1, 0.02, 0.02, bx, 2.82, tZ, navy, 0.9, 0.05, false);

  // Planters (decorative)
  B.colorBox(0.5, 0.5, 0.5, bx - BW / 2 + 0.5, 0.35, tZ + 1.5, 0x774433, 0.9, 0.02, true);
  B.cyl(0.2, 0.15, 0.6, bx - BW / 2 + 0.5, 0.9, tZ + 1.5, "woodDark");
  B.colorBox(0.5, 0.5, 0.5, bx + BW / 2 - 0.5, 0.35, tZ + 1.5, 0x774433, 0.9, 0.02, true);
  B.cyl(0.2, 0.15, 0.6, bx + BW / 2 - 0.5, 0.9, tZ + 1.5, "woodDark");

  // Trash bin
  B.cyl(0.2, 0.2, 0.6, bx + 3, 0.3, tZ + 1.8, "steelDark", true);

  // === INTERIOR DETAILS ===
  // Ceiling lights
  const ceilMat = getEmissiveMaterial(0xffffdd, 0xffeeaa, 0.4);
  for (const [clx, clz] of [[bx - 4, bz - 2], [bx + 2, bz - 2], [bx - 4, bz + 2], [bx + 2, bz + 2]] as [number, number][]) {
    const cl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.3), ceilMat);
    cl.position.set(clx, BH - 0.1, clz);
    scene.add(cl);
  }

  // Coffee machine on bar
  B.colorBox(0.3, 0.4, 0.25, barX, 1.5, barZ - 0.5, 0x333333, 0.7, 0.4, false);
  // Beer tap
  B.cyl(0.04, 0.04, 0.3, barX, 1.5, barZ + 0.5, "steelDark");
  B.colorBox(0.1, 0.06, 0.08, barX, 1.65, barZ + 0.55, 0xccaa22, 0.5, 0.5, false);
}

// ========== DOCKSIDE MINI MART (24h convenience store) ==========
function buildDocksideMiniMart(B: MapBoxHelper, scene: THREE.Scene) {
  const mx = 45, mz = -38;
  const MW = 14, MD = 10, MH = 5.5;
  const wallT = 0.4;
  const wallColor = 0xf5f5f5;
  const navyTrim = 0x0f1c2e;
  const accentOrange = 0xff8c32;

  // === FOUNDATION + FLOOR ===
  B.colorBox(MW + 1, 0.2, MD + 1, mx, 0.1, mz, PALETTE.concreteDark, 0.9, 0.03, false);
  B.addCollider(mx - MW / 2 - 0.5, 0, mz - MD / 2 - 0.5, mx + MW / 2 + 0.5, 0.25, mz + MD / 2 + 0.5);
  // Interior floor (tiled look)
  B.colorBox(MW - wallT * 2, 0.08, MD - wallT * 2, mx, 0.24, mz, 0xddddcc, 0.85, 0.03, false);

  // === WALLS ===
  // Back wall (solid)
  B.colorBox(MW, MH, wallT, mx, MH / 2, mz - MD / 2, wallColor, 0.85, 0.02, false);
  B.addCollider(mx - MW / 2, 0, mz - MD / 2 - wallT / 2, mx + MW / 2, MH, mz - MD / 2 + wallT / 2);
  // Left wall (solid)
  B.colorBox(wallT, MH, MD, mx - MW / 2, MH / 2, mz, wallColor, 0.85, 0.02, false);
  B.addCollider(mx - MW / 2 - wallT / 2, 0, mz - MD / 2, mx - MW / 2 + wallT / 2, MH, mz + MD / 2);
  // Right wall (solid)
  B.colorBox(wallT, MH, MD, mx + MW / 2, MH / 2, mz, wallColor, 0.85, 0.02, false);
  B.addCollider(mx + MW / 2 - wallT / 2, 0, mz - MD / 2, mx + MW / 2 + wallT / 2, MH, mz + MD / 2);

  // Front wall (glass with door opening in center)
  // Left glass panel
  B.colorBox(4, MH, 0.1, mx - 5, MH / 2, mz + MD / 2, 0x88aacc, 0.1, 0.5, false);
  B.addCollider(mx - MW / 2, 0, mz + MD / 2 - 0.15, mx - 3, MH, mz + MD / 2 + 0.15);
  // Right glass panel
  B.colorBox(4, MH, 0.1, mx + 5, MH / 2, mz + MD / 2, 0x88aacc, 0.1, 0.5, false);
  B.addCollider(mx + 3, 0, mz + MD / 2 - 0.15, mx + MW / 2, MH, mz + MD / 2 + 0.15);
  // Above door
  B.colorBox(6, 1.5, 0.1, mx, MH - 0.75, mz + MD / 2, 0x88aacc, 0.1, 0.5, false);
  B.addCollider(mx - 3, MH - 1.5, mz + MD / 2 - 0.15, mx + 3, MH, mz + MD / 2 + 0.15);
  // Door frame
  B.colorBox(0.12, MH - 1.5, 0.15, mx - 3, (MH - 1.5) / 2, mz + MD / 2, navyTrim, 0.85, 0.02, false);
  B.colorBox(0.12, MH - 1.5, 0.15, mx + 3, (MH - 1.5) / 2, mz + MD / 2, navyTrim, 0.85, 0.02, false);

  // === ROOF ===
  B.colorBox(MW + 2, 0.25, MD + 2, mx, MH + 0.12, mz, PALETTE.concreteDark, 0.9, 0.03, false);
  B.addCollider(mx - MW / 2 - 1, MH, mz - MD / 2 - 1, mx + MW / 2 + 1, MH + 0.3, mz + MD / 2 + 1);
  // Roof overhang front (canopy)
  B.colorBox(MW + 2, 0.15, 2, mx, MH + 0.05, mz + MD / 2 + 1, navyTrim, 0.85, 0.02, false);
  B.addCollider(mx - MW / 2 - 1, MH - 0.1, mz + MD / 2, mx + MW / 2 + 1, MH + 0.15, mz + MD / 2 + 2);
  // Navy trim band around top
  B.colorBox(MW + 2, 0.4, 0.08, mx, MH - 0.2, mz - MD / 2 - 1, navyTrim, 0.85, 0.02, false);
  B.colorBox(MW + 2, 0.4, 0.08, mx, MH - 0.2, mz + MD / 2 + 2, navyTrim, 0.85, 0.02, false);
  B.colorBox(0.08, 0.4, MD + 4, mx - MW / 2 - 1, MH - 0.2, mz + 0.5, navyTrim, 0.85, 0.02, false);
  B.colorBox(0.08, 0.4, MD + 4, mx + MW / 2 + 1, MH - 0.2, mz + 0.5, navyTrim, 0.85, 0.02, false);

  // === SIGNAGE "NEON MART" (emissive) ===
  const signMat = getEmissiveMaterial(accentOrange, accentOrange, 0.8);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 0.1), signMat);
  sign.position.set(mx, MH + 0.6, mz + MD / 2 + 2.05);
  sign.castShadow = false;
  scene.add(sign);
  // Sign backing
  B.colorBox(5.4, 1.0, 0.15, mx, MH + 0.6, mz + MD / 2 + 2, navyTrim, 0.85, 0.02, false);
  const martText = makeSignTextMesh("NEON MART 24h", 4.6, 0.7, 38, "#ffffff", null);
  martText.position.set(mx, MH + 0.6, mz + MD / 2 + 2.12);
  scene.add(martText);

  // === INTERIOR: 2 SHELF AISLES ===
  for (let aisle = 0; aisle < 2; aisle++) {
    const ax = mx - 3.5 + aisle * 5;
    const az = mz - 1;
    // Shelf unit (double-sided, with collider)
    B.colorBox(0.3, 1.6, 4.5, ax, 1.0, az, PALETTE.steelLight, 0.5, 0.5, false);
    B.addCollider(ax - 0.2, 0.2, az - 2.3, ax + 0.2, 1.8, az + 2.3);
    // Shelf planks (3 levels)
    for (let s = 0; s < 3; s++) {
      B.colorBox(0.6, 0.04, 4.5, ax - 0.15, 0.5 + s * 0.55, az, PALETTE.woodWarm, 0.82, 0.02, false);
      B.colorBox(0.6, 0.04, 4.5, ax + 0.15, 0.5 + s * 0.55, az, PALETTE.woodWarm, 0.82, 0.02, false);
    }
    // Products on shelves (colorful boxes)
    const colors = [0xff3333, 0x33aa33, 0x3366ff, 0xffcc00, 0xff6600, 0xaa33cc];
    for (let s = 0; s < 3; s++) {
      for (let p = 0; p < 6; p++) {
        const py = 0.55 + s * 0.55;
        const pz = az - 2 + p * 0.7;
        const side = p % 2 === 0 ? -1 : 1;
        B.colorBox(0.15, 0.2, 0.12, ax + side * 0.3, py, pz, colors[(s + p) % colors.length], 0.8, 0.02, false);
      }
    }
  }

  // === CHECKOUT COUNTER (front-left) ===
  const ccX = mx + 4, ccZ = mz + 3;
  B.colorBox(2.5, 1.0, 0.8, ccX, 0.7, ccZ, navyTrim, 0.85, 0.02, false);
  B.addCollider(ccX - 1.3, 0.2, ccZ - 0.45, ccX + 1.3, 1.2, ccZ + 0.45);
  // Counter top
  B.colorBox(2.6, 0.06, 0.85, ccX, 1.23, ccZ, PALETTE.woodWarm, 0.82, 0.02, false);
  // Cash register
  B.colorBox(0.3, 0.25, 0.25, ccX - 0.5, 1.38, ccZ, 0x333333, 0.8, 0.3, false);
  // Monitor
  B.colorBox(0.4, 0.3, 0.04, ccX + 0.3, 1.5, ccZ - 0.15, 0x111111, 0.9, 0.5, false);
  // Stool behind counter
  B.colorBox(0.35, 0.06, 0.35, ccX + 0.5, 0.7, ccZ - 0.8, 0x333333, 0.9, 0.02, false);
  B.cyl(0.03, 0.04, 0.35, ccX + 0.5, 0.5, ccZ - 0.8, "steelDark");

  // === GLASS FRIDGE (back-right wall) ===
  const frX = mx + 5, frZ = mz - 4;
  B.colorBox(2.5, 2.2, 0.7, frX, 1.3, frZ, 0xdddddd, 0.3, 0.4, false);
  B.addCollider(frX - 1.3, 0.2, frZ - 0.4, frX + 1.3, 2.4, frZ + 0.4);
  // Glass door
  B.colorBox(2.3, 2.0, 0.05, frX, 1.2, frZ + 0.35, 0x88ccdd, 0.05, 0.6, false);
  // Interior shelves with drinks
  for (let s = 0; s < 3; s++) {
    B.colorBox(2.3, 0.03, 0.5, frX, 0.5 + s * 0.7, frZ, 0xcccccc, 0.3, 0.5, false);
  }
  // Drink bottles (colorful)
  for (let s = 0; s < 3; s++) {
    for (let d = 0; d < 5; d++) {
      const dc = [0x33cc33, 0xff3333, 0x3366ff, 0xffaa00, 0xcc33cc][d];
      B.cyl(0.04, 0.04, 0.2, frX - 0.8 + d * 0.4, 0.63 + s * 0.7, frZ, "steelDark");
      B.colorBox(0.06, 0.15, 0.06, frX - 0.8 + d * 0.4, 0.6 + s * 0.7, frZ, dc, 0.7, 0.1, false);
    }
  }

  // === ARCADE CORNER (back-left) ===
  const arcX = mx - 5, arcZ = mz - 3.5;
  // Arcade cabinet
  B.colorBox(0.8, 1.8, 0.7, arcX, 1.1, arcZ, navyTrim, 0.85, 0.02, false);
  B.addCollider(arcX - 0.45, 0.2, arcZ - 0.4, arcX + 0.45, 2.0, arcZ + 0.4);
  // Screen
  B.colorBox(0.6, 0.5, 0.04, arcX, 1.5, arcZ + 0.36, 0x222222, 0.9, 0.5, false);
  const screenGlow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.02), getEmissiveMaterial(0x44ff88, 0x44ff88, 0.4));
  screenGlow.position.set(arcX, 1.5, arcZ + 0.38);
  scene.add(screenGlow);
  // Joystick panel
  B.colorBox(0.6, 0.04, 0.25, arcX, 1.1, arcZ + 0.35, 0x444444, 0.8, 0.3, false);
  // Second arcade cabinet
  B.colorBox(0.8, 1.8, 0.7, arcX + 1.2, 1.1, arcZ, 0x2244aa, 0.85, 0.02, false);
  B.addCollider(arcX + 1.2 - 0.45, 0.2, arcZ - 0.4, arcX + 1.2 + 0.45, 2.0, arcZ + 0.4);
  const screenGlow2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.02), getEmissiveMaterial(0xff4488, 0xff4488, 0.4));
  screenGlow2.position.set(arcX + 1.2, 1.5, arcZ + 0.38);
  scene.add(screenGlow2);

  // === EXTERIOR: VENDING MACHINES ===
  const vmX = mx + MW / 2 + 0.8, vmZ = mz + 2;
  // Soda vending machine
  B.colorBox(0.8, 1.8, 0.7, vmX, 1.1, vmZ, 0xcc2222, 0.7, 0.2, false);
  B.addCollider(vmX - 0.45, 0, vmZ - 0.4, vmX + 0.45, 2.0, vmZ + 0.4);
  const vmScreen = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.04), getEmissiveMaterial(0xffffff, 0xffeecc, 0.3));
  vmScreen.position.set(vmX - 0.38, 1.2, vmZ);
  vmScreen.rotation.y = Math.PI / 2;
  scene.add(vmScreen);
  // Snack vending machine
  B.colorBox(0.8, 1.8, 0.7, vmX, 1.1, vmZ - 1.2, 0x2255aa, 0.7, 0.2, false);
  B.addCollider(vmX - 0.45, 0, vmZ - 1.6, vmX + 0.45, 2.0, vmZ - 0.8);

  // === EXTERIOR: CRATES ===
  B.colorBox(1.0, 0.8, 0.8, mx - MW / 2 - 1, 0.4, mz - 3, PALETTE.woodWarm, 0.85, 0.02, true);
  B.colorBox(0.8, 0.6, 0.8, mx - MW / 2 - 1, 1.1, mz - 3, PALETTE.woodDark, 0.85, 0.02, true);
  B.colorBox(1.0, 0.8, 0.8, mx - MW / 2 - 1, 0.4, mz - 1.5, PALETTE.woodWarm, 0.85, 0.02, true);

  // === ROOF ACCESS (ramp from crates on back side) ===
  // Stacked crates forming steps up to roof
  B.colorBox(1.5, 1.2, 1.2, mx - MW / 2 - 1.5, 0.6, mz - MD / 2 + 1, PALETTE.woodWarm, 0.85, 0.02, true);
  B.colorBox(1.5, 1.0, 1.2, mx - MW / 2 - 1.5, 1.7, mz - MD / 2 + 1, PALETTE.woodDark, 0.85, 0.02, true);
  B.colorBox(1.5, 0.8, 1.2, mx - MW / 2 - 1.5, 2.6, mz - MD / 2 + 1, PALETTE.woodWarm, 0.85, 0.02, true);
  // Ramp from crate top to roof edge
  const rampSteps = 6;
  const rampStartY = 3.0;
  const rampEndY = MH;
  for (let r = 0; r < rampSteps; r++) {
    const ry = rampStartY + (r + 0.5) * (rampEndY - rampStartY) / rampSteps;
    const rz = mz - MD / 2 + 1 + 0.6 + r * 0.4;
    B.colorBox(1.5, 0.1, 0.4, mx - MW / 2 - 0.5, ry, rz, PALETTE.steelLight, 0.5, 0.5, false);
    B.addCollider(mx - MW / 2 - 1.3, ry - 0.15, rz - 0.25, mx - MW / 2 + 0.3, ry + 0.1, rz + 0.25);
  }

  // === AC UNIT ON ROOF ===
  B.colorBox(1.5, 0.8, 1.0, mx + 3, MH + 0.7, mz - 2, 0xdddddd, 0.4, 0.4, false);
  B.addCollider(mx + 3 - 0.8, MH + 0.25, mz - 2 - 0.55, mx + 3 + 0.8, MH + 1.1, mz - 2 + 0.55);
  // AC fan
  B.cyl(0.3, 0.3, 0.06, mx + 3, MH + 1.15, mz - 2, "steelDark");

  // === INTERIOR LIGHTING (ceiling lights) ===
  const lightMat = getEmissiveMaterial(0xffffdd, 0xffeeaa, 0.5);
  for (const [lx, lz] of [[mx - 3, mz - 1], [mx + 3, mz - 1], [mx, mz + 2]] as [number, number][]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.3), lightMat);
    light.position.set(lx, MH - 0.1, lz);
    scene.add(light);
  }

  // === TRASH BIN (outside near door) ===
  B.cyl(0.2, 0.2, 0.6, mx + 2.5, 0.3, mz + MD / 2 + 1, "steelDark", true);
  B.cyl(0.22, 0.22, 0.04, mx + 2.5, 0.62, mz + MD / 2 + 1, "steelDark");

  // === WELCOME MAT ===
  B.colorBox(1.5, 0.02, 0.8, mx, 0.26, mz + MD / 2 + 0.3, 0x665533, 0.95, 0, false);

  // === INTERIOR: FLOOR MAT ===
  B.colorBox(5, 0.02, 1, mx, 0.26, mz + MD / 2 - 0.8, 0x445566, 0.9, 0.02, false);
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
