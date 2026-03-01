import * as THREE from "three";
import type { MapData } from "@catch-and-run/shared";

const P = {
  concrete:    0xb5ad9e,
  concreteLt:  0xc5bdb0,
  concreteDk:  0x8a8278,
  asphalt:     0x4a4a4a,
  asphaltLt:   0x5a5a5a,
  wallBeige:   0xc9b99a,
  wallBeigeLt: 0xd8cab5,
  wallInner:   0xddd5c8,
  roofDark:    0x6e6458,
  roofMetal:   0x8a8580,
  woodWarm:    0xba7d3a,
  woodDark:    0x7a5228,
  woodOld:     0x9a7a52,
  woodPallet:  0xa88a4a,
  metalFrame:  0x505558,
  metalDark:   0x3a3d40,
  metalRust:   0x8a4a2a,
  metalClean:  0x889090,
  containerRd: 0xb82828,
  containerBl: 0x2855aa,
  containerGr: 0x2a8838,
  containerYl: 0xccaa22,
  coneOrg:     0xf08000,
  coneStripe:  0xf8f8f8,
  fencePost:   0x707070,
  officeFloor: 0xc8b898,
  officeWall:  0xe0d8cc,
  deskBrown:   0x5a3818,
  chairDark:   0x282828,
  cabinetMtl:  0x687080,
  grass:       0x6a8a3e,
  grassDark:   0x5a7a32,
  dock:        0x8a7a60,
  water:       0x4a7a9a,
  gateIron:    0x8a4a22,
  bollardYl:   0xdda820,
  poleGray:    0x606060,
  oilStain:    0x333830,
  marking:     0xe8e0a0,
  tarpBlue:    0x2a4a8a,
  tarpGreen:   0x3a5a2a,
  pipeSilver:  0xa8b0b8,
  pipeRust:    0x7a4020,
  dumpsterGn:  0x3a5a3a,
  brickRed:    0x8a4030,
  brickDark:   0x6a3020,
  corrugated:  0x7a7a78,
  neonGreen:   0x00ff44,
  neonRed:     0xff2200,
  chainGray:   0x6a6a6a,
  cobwebWhite: 0xddddcc,
  cardboard:   0xc4953d,
  plasticWhite:0xe8e8e0,
  vinylGray:   0x8a8a88,
  cementPatch: 0xa09888,
};

function mat(color: number, rough = 0.85, metal = 0.05): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function matFlat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
}

export class MapBuilder {
  private scene: THREE.Scene;
  private colliders: THREE.Box3[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  build(_mapData: MapData): THREE.Box3[] {
    this.colliders = [];
    this.buildGround();
    this.buildWarehouse();
    this.buildOffice();
    this.buildContainerYard();
    this.buildHunterSpawn();
    this.buildDockArea();
    this.buildClutter();
    this.buildVehiclesAndEquipment();
    this.buildVegetation();
    this.buildSignsAndPoles();
    this.buildBackgroundDepth();
    this.buildDecals();
    return this.colliders;
  }

  private add(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, collide = true): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collide) {
      this.colliders.push(new THREE.Box3().setFromObject(mesh));
    }
    return mesh;
  }

  private box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, collide = true, rough = 0.85, metal = 0.05): THREE.Mesh {
    return this.add(new THREE.BoxGeometry(w, h, d), mat(color, rough, metal), x, y, z, collide);
  }

  private cyl(rT: number, rB: number, h: number, x: number, y: number, z: number, color: number, collide = true): THREE.Mesh {
    return this.add(new THREE.CylinderGeometry(rT, rB, h, 16), mat(color, 0.7, 0.15), x, y, z, collide);
  }

  // ===================== GROUND =====================
  private buildGround() {
    // Large ground plane -- grass
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(200, 160), matFlat(P.grass));
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.y = -0.02;
    gnd.receiveShadow = true;
    this.scene.add(gnd);

    // Warehouse floor -- polished concrete
    this.box(44, 0.12, 34, 0, 0.06, 0, P.concrete, false);

    // Yard asphalt
    this.box(30, 0.1, 28, 38, 0.04, -12, P.asphalt, false);

    // Dock planks
    this.box(60, 0.15, 8, 20, 0.07, 35, P.dock, false);

    // Road marking lines on asphalt
    this.box(0.15, 0.02, 20, 30, 0.11, -12, P.marking, false);
    this.box(0.15, 0.02, 20, 46, 0.11, -12, P.marking, false);
  }

  // ===================== WAREHOUSE =====================
  private buildWarehouse() {
    const wh = 7.5, ww = 44, wd = 34;

    // Back wall (solid)
    this.box(ww, wh, 0.35, 0, wh / 2, -wd / 2, P.wallBeige);
    // Front wall with large opening (2 segments + beam above)
    this.box(14, wh, 0.35, -15, wh / 2, wd / 2, P.wallBeige);
    this.box(14, wh, 0.35, 15, wh / 2, wd / 2, P.wallBeigeLt);
    this.box(16, 2, 0.35, 0, wh - 1, wd / 2, P.wallBeige); // beam above door
    // Left wall (solid)
    this.box(0.35, wh, wd, -ww / 2, wh / 2, 0, P.wallBeige);
    // Right wall with door opening (2 segments)
    this.box(0.35, wh, 10, ww / 2, wh / 2, -12, P.wallBeigeLt);
    this.box(0.35, wh, 8, ww / 2, wh / 2, 13, P.wallBeigeLt);
    this.box(0.35, 2.5, 16, ww / 2, wh - 1.25, 2, P.wallBeige); // beam above side door

    // Inner accent strip along walls (baseboard)
    this.box(ww - 1, 0.4, 0.08, 0, 0.2, -wd / 2 + 0.25, P.concreteDk, false);
    this.box(ww - 1, 0.4, 0.08, 0, 0.2, wd / 2 - 0.25, P.concreteDk, false);

    // Roof -- corrugated metal look (slightly angled segments)
    for (let i = 0; i < 6; i++) {
      const rz = -wd / 2 + 3 + i * (wd / 6);
      this.box(ww + 1, 0.15, wd / 6 + 0.5, 0, wh + 0.08, rz, i % 2 === 0 ? P.roofMetal : P.roofDark, false, 0.6, 0.3);
    }

    // Roof support beams (steel I-beam look)
    for (let i = 0; i < 4; i++) {
      const bz = -12 + i * 8;
      this.box(ww - 2, 0.2, 0.4, 0, wh - 0.3, bz, P.metalFrame, false, 0.5, 0.5);
      // Vertical supports
      this.box(0.15, wh, 0.15, -ww / 2 + 1.5, wh / 2, bz, P.metalFrame, false, 0.5, 0.5);
      this.box(0.15, wh, 0.15, ww / 2 - 1.5, wh / 2, bz, P.metalFrame, false, 0.5, 0.5);
    }

    // Shelving racks -- industrial
    for (let row = 0; row < 2; row++) {
      const rz = -8 + row * 12;
      for (let col = 0; col < 3; col++) {
        const rx = -12 + col * 8;
        this.buildShelfRack(rx, rz);
      }
    }

    // Wooden crate stacks
    this.box(1.2, 1.2, 1.2, -18, 0.6, -14, P.woodWarm);
    this.box(1.2, 1.2, 1.2, -16.7, 0.6, -14, P.woodDark);
    this.box(1.0, 1.0, 1.0, -17.3, 1.8, -14, P.woodOld);
    this.box(0.8, 0.8, 0.8, 18, 0.4, 8, P.woodWarm);
    this.box(1.2, 1.2, 1.2, -18, 0.6, 10, P.woodDark);
    this.box(0.6, 0.6, 0.6, -17.2, 0.3, 10.5, P.woodOld);

    // Pallets
    this.box(1.2, 0.12, 1.0, -5, 0.06, -14, P.woodPallet);
    this.box(1.2, 0.12, 1.0, 12, 0.06, 10, P.woodPallet);
    this.box(1.2, 0.12, 1.0, 4, 0.06, -2, P.woodPallet);

    // Barrels inside warehouse
    this.cyl(0.33, 0.35, 0.95, -20, 0.48, 4, P.metalRust);
    this.cyl(0.33, 0.35, 0.95, -19, 0.48, 4, P.metalClean);
    this.cyl(0.33, 0.35, 0.95, -19.5, 1.43, 4, P.metalRust);
    this.cyl(0.33, 0.35, 0.95, 10, 0.48, 15, P.metalClean);
    this.cyl(0.33, 0.35, 0.95, 11, 0.48, 15, P.metalRust);

    // === EXTRA HIDING SPOTS: L-shaped crate clusters ===
    // Back-right corner cluster
    this.box(1.2, 1.2, 1.2, 18, 0.6, -14, P.woodWarm);
    this.box(1.2, 1.2, 1.2, 19.2, 0.6, -14, P.woodDark);
    this.box(1.2, 1.2, 1.2, 18, 0.6, -12.8, P.woodOld);
    this.box(1.0, 1.0, 1.0, 18.6, 1.7, -14, P.woodWarm);

    // Mid-warehouse barrel cluster (creates blind spot)
    this.cyl(0.33, 0.35, 0.95, 5, 0.48, 2, P.metalRust);
    this.cyl(0.33, 0.35, 0.95, 5.7, 0.48, 2, P.metalClean);
    this.cyl(0.33, 0.35, 0.95, 5, 0.48, 2.7, P.metalClean);
    this.cyl(0.33, 0.35, 0.95, 5.35, 1.43, 2.35, P.metalRust);

    // Front-left corner hiding spot
    this.box(1.5, 1.8, 1.5, -18, 0.9, 14, P.cardboard);
    this.box(0.8, 0.8, 0.8, -16.8, 0.4, 14.5, P.cardboard);
    this.box(1.0, 0.6, 0.8, -18.5, 0.3, 15, P.woodPallet);

    // Additional small items on shelves (visual density)
    this.box(0.2, 0.3, 0.2, -4, 1.4, 4, P.containerBl, false);
    this.box(0.35, 0.2, 0.25, 4.3, 1.4, -8, P.containerRd, false);
    this.cyl(0.07, 0.07, 0.25, 4.8, 1.42, -8, P.metalClean, false);
    this.box(0.4, 0.3, 0.3, -12, 2.7, -8, 0xddcc44, false);
    this.box(0.25, 0.4, 0.2, -4.2, 2.72, 4, P.containerGr, false);
    this.cyl(0.08, 0.08, 0.3, 4.5, 2.72, 4, P.metalRust, false);

    // Cardboard box wall (great hiding behind it)
    this.box(0.7, 0.5, 0.5, 8, 0.25, -14, P.cardboard);
    this.box(0.7, 0.5, 0.5, 8.8, 0.25, -14, P.cardboard);
    this.box(0.6, 0.5, 0.5, 8.4, 0.75, -14, P.cardboard);

    // Tarp-covered pile (mysterious shape to hide near)
    const tarpGroup = new THREE.Group();
    const tarpGeo = new THREE.BoxGeometry(2.5, 1.2, 1.8);
    const tarpMesh = new THREE.Mesh(tarpGeo, mat(P.tarpBlue, 0.92, 0));
    tarpMesh.position.y = 0.6;
    tarpMesh.castShadow = true;
    tarpMesh.receiveShadow = true;
    tarpGroup.add(tarpMesh);
    tarpGroup.position.set(-8, 0, -14);
    this.scene.add(tarpGroup);
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(-9.25, 0, -14.9),
      new THREE.Vector3(-6.75, 1.2, -13.1)
    ));

    // 3rd row of shelving (more density)
    for (let col = 0; col < 2; col++) {
      const rx = -10 + col * 10;
      this.buildShelfRack(rx, 10);
    }
  }

  private buildShelfRack(x: number, z: number) {
    const fm = mat(P.metalFrame, 0.5, 0.5);
    const sm = mat(P.woodWarm);
    // Visual uprights (thin)
    const upGeo = new THREE.BoxGeometry(0.06, 3.8, 0.06);
    this.add(upGeo, fm, x - 0.9, 1.9, z - 0.55, false);
    this.add(upGeo, fm, x + 0.9, 1.9, z - 0.55, false);
    this.add(upGeo, fm, x - 0.9, 1.9, z + 0.55, false);
    this.add(upGeo, fm, x + 0.9, 1.9, z + 0.55, false);
    // Single wide collider for the whole rack (prevents walking through)
    const rackCollider = new THREE.Box3(
      new THREE.Vector3(x - 1.0, 0, z - 0.65),
      new THREE.Vector3(x + 1.0, 3.8, z + 0.65)
    );
    this.colliders.push(rackCollider);
    // Shelf platforms
    const shelfGeo = new THREE.BoxGeometry(2.0, 0.06, 1.2);
    this.add(shelfGeo, sm, x, 1.3, z, false);
    this.add(shelfGeo, sm, x, 2.6, z, false);
    // Cross braces
    const crossGeo = new THREE.BoxGeometry(2.0, 0.04, 0.04);
    this.add(crossGeo, fm, x, 0.5, z - 0.55, false);
    this.add(crossGeo, fm, x, 0.5, z + 0.55, false);
  }

  // ===================== OFFICE =====================
  private buildOffice() {
    const ox = 26, oz = 6, oy = 3.2;

    // Floor -- WITH collider so player can stand on it
    this.box(9, 0.25, 7, ox, oy, oz, P.officeFloor, true);

    // Walls
    this.box(9, 3.5, 0.18, ox, oy + 1.75, oz - 3.5, P.officeWall);
    this.box(9, 3.5, 0.18, ox, oy + 1.75, oz + 3.5, P.officeWall);
    this.box(0.18, 3.5, 7, ox + 4.5, oy + 1.75, oz, P.officeWall);

    // Window in side wall
    this.box(0.05, 1.2, 2.5, ox + 4.52, oy + 2.2, oz, 0x88bbdd, false, 0.1, 0.3);

    // Door frame in front wall (leave gap for door opening)
    this.box(3.5, 1.5, 0.18, ox - 2.75, oy + 3, oz - 3.5, P.officeWall, false);
    this.box(3.5, 1.5, 0.18, ox + 2.75, oy + 3, oz - 3.5, P.officeWall, false);

    // Balcony railing (no collider -- decorative)
    this.box(8, 0.06, 0.06, ox, oy + 0.9, oz - 3.7, P.metalFrame, false, 0.5, 0.5);
    for (let i = 0; i < 6; i++) {
      this.box(0.04, 0.9, 0.04, ox - 4 + i * 1.6, oy + 0.45, oz - 3.7, P.metalFrame, false, 0.5, 0.5);
    }

    // ===== WIDE WOODEN DECK STAIRCASE =====
    const stairW = 4.0;
    const stairZ = oz - 5.5;
    const numSteps = 10;
    const stepRise = oy / numSteps;
    const stepRun = 0.75;
    const stairStartX = ox - 9;
    const stairLen = numSteps * stepRun;
    const leftZ = stairZ - stairW / 2;
    const rightZ = stairZ + stairW / 2;

    // Wooden step planks -- each step is a thin platform collider
    for (let i = 0; i < numSteps; i++) {
      const sx = stairStartX + i * stepRun + stepRun / 2;
      const sy = stepRise * (i + 1);
      // Visual plank
      this.box(stairW - 0.3, 0.08, stepRun - 0.06, sx, sy, stairZ, P.woodWarm, false);
      // Thin collider just for this step surface (ground detection only)
      this.colliders.push(new THREE.Box3(
        new THREE.Vector3(sx - stairW / 2, sy - 0.08, stairZ - stairW / 2),
        new THREE.Vector3(sx + stairW / 2, sy, stairZ + stairW / 2)
      ));
    }

    // Side stringers (thick wooden beams on each side)
    const stairAngle = Math.atan2(oy, stairLen);
    const stringerLen = Math.sqrt(oy * oy + stairLen * stairLen);
    const midX = stairStartX + stairLen / 2;
    const midY = oy / 2;

    const lStr = this.box(stringerLen + 0.3, 0.2, 0.12, midX, midY, leftZ, P.woodDark, false);
    lStr.rotation.z = -stairAngle;
    const rStr = this.box(stringerLen + 0.3, 0.2, 0.12, midX, midY, rightZ, P.woodDark, false);
    rStr.rotation.z = -stairAngle;

    // Handrail posts
    for (let i = 0; i <= numSteps; i += 2) {
      const px = stairStartX + i * stepRun;
      const py = stepRise * i;
      this.box(0.07, 1.0, 0.07, px, py + 0.5, leftZ - 0.15, P.woodDark, false);
      this.box(0.07, 1.0, 0.07, px, py + 0.5, rightZ + 0.15, P.woodDark, false);
    }

    // Top rail beams (angled)
    const railOffset = 1.0;
    const tRailL = this.box(stringerLen + 0.3, 0.06, 0.06, midX, midY + railOffset, leftZ - 0.15, P.woodDark, false);
    tRailL.rotation.z = -stairAngle;
    const tRailR = this.box(stringerLen + 0.3, 0.06, 0.06, midX, midY + railOffset, rightZ + 0.15, P.woodDark, false);
    tRailR.rotation.z = -stairAngle;

    // Support posts underneath
    const supports = [0.25, 0.5, 0.75];
    for (const frac of supports) {
      const spx = stairStartX + stairLen * frac;
      const h = stepRise * numSteps * frac;
      if (h > 0.5) {
        this.box(0.12, h, 0.12, spx, h / 2, leftZ, P.woodDark, false);
        this.box(0.12, h, 0.12, spx, h / 2, rightZ, P.woodDark, false);
      }
    }

    // Landing platform connecting stairs to office door
    const landX = stairStartX + stairLen + 0.8;
    this.box(2.5, 0.15, stairW + 1.5, landX, oy - 0.08, stairZ + 0.5, P.woodWarm, true);

    // Desk
    this.box(1.6, 0.05, 0.85, ox + 1, oy + 0.72, oz, P.deskBrown);
    this.box(0.04, 0.7, 0.85, ox + 1.78, oy + 0.35, oz, P.deskBrown, false);
    this.box(0.04, 0.7, 0.85, ox + 0.22, oy + 0.35, oz, P.deskBrown, false);
    this.box(0.5, 0.5, 0.7, ox + 1.5, oy + 0.4, oz, P.woodDark, false);

    // Chair
    this.box(0.45, 0.05, 0.45, ox - 0.5, oy + 0.42, oz, P.chairDark);
    this.box(0.45, 0.4, 0.05, ox - 0.5, oy + 0.65, oz - 0.2, P.chairDark, false);

    // Filing cabinets
    this.box(0.45, 1.4, 0.55, ox + 3.8, oy + 0.7, oz + 2.5, P.cabinetMtl, true, 0.5, 0.4);
    this.box(0.45, 1.4, 0.55, ox + 3.8, oy + 0.7, oz + 1.8, P.cabinetMtl, true, 0.5, 0.4);

    // Whiteboard
    this.box(2.0, 1.2, 0.04, ox + 4.4, oy + 2.2, oz - 1, 0xf0f0f0, false);
    this.box(2.1, 0.08, 0.06, ox + 4.4, oy + 1.6, oz - 1, P.metalFrame, false, 0.5, 0.5);
  }

  // ===================== CONTAINER YARD =====================
  private buildContainerYard() {
    const cx = 38, cz = -12;

    // Containers with corrugation detail
    this.buildContainer(cx - 2, 0, cz - 3, P.containerRd, 0);
    this.buildContainer(cx - 2, 0, cz - 6.5, P.containerBl, 0);
    this.buildContainer(cx, 2.6, cz - 3, P.containerGr, 0);
    this.buildContainer(cx + 8, 0, cz + 2, P.containerYl, Math.PI / 2);

    // Extra containers creating narrow passages
    this.buildContainer(cx + 2, 0, cz + 5, P.containerRd, Math.PI / 2);
    this.buildContainer(cx - 8, 0, cz - 9, P.containerGr, 0);
    // Open container (players can enter!)
    this.buildContainer(cx + 12, 0, cz - 5, P.containerBl, 0);
    // Remove back wall of open container by adding dark interior
    this.box(5.8, 2.3, 2.2, cx + 12, 1.2, cz - 5, P.metalDark, false, 0.9, 0.1);

    // Concrete barriers between containers
    this.box(2.5, 0.9, 0.4, cx + 4, 0.45, cz - 1, P.concreteDk);
    this.box(2.5, 0.9, 0.4, cx - 4, 0.45, cz + 2, P.concreteDk);

    // Cones (more scattered)
    const conePositions = [
      [cx - 8, cz + 6], [cx - 6, cz + 6], [cx - 10, cz + 8], [cx + 4, cz + 8],
      [cx + 10, cz + 6], [cx - 3, cz - 1], [cx + 14, cz - 8],
    ];
    for (const [px, pz] of conePositions) {
      this.buildCone(px, pz);
    }

    // Pallet stacks in yard
    this.box(1.2, 0.12, 1.0, cx - 5, 0.06, cz - 6, P.woodPallet);
    this.box(1.2, 0.12, 1.0, cx - 5, 0.18, cz - 6, P.woodPallet, false);
    this.box(1.2, 0.12, 1.0, cx - 5, 0.30, cz - 6, P.woodPallet, false);
    this.box(0.8, 0.5, 0.5, cx + 6, 0.25, cz - 10, 0x4a5a2a);

    // Tire stack in yard
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 12), mat(0x1a1a1a, 0.92, 0));
      t.position.set(cx - 12, 0.32 + i * 0.25, cz + 3);
      t.rotation.x = Math.PI / 2;
      t.castShadow = true;
      this.scene.add(t);
    }

    // Fence -- visual posts + single strip collider
    for (let i = 0; i < 12; i++) {
      this.box(0.06, 2.2, 0.06, cx - 14 + i * 2.8, 1.1, cz + 12, P.fencePost, false, 0.5, 0.5);
    }
    this.box(34, 0.05, 0.05, cx, 2.0, cz + 12, P.fencePost, false, 0.5, 0.5);
    this.box(34, 0.05, 0.05, cx, 1.1, cz + 12, P.fencePost, false, 0.5, 0.5);
    this.box(34, 0.05, 0.05, cx, 0.3, cz + 12, P.fencePost, false, 0.5, 0.5);
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - 14, 0, cz + 11.7),
      new THREE.Vector3(cx + 20, 2.2, cz + 12.3)
    ));

    // Chain-link fence gate (visual gap)
    this.box(0.08, 2.2, 0.08, cx - 2, 1.1, cz + 12, P.metalDark, false, 0.4, 0.6);
    this.box(0.08, 2.2, 0.08, cx + 2, 1.1, cz + 12, P.metalDark, false, 0.4, 0.6);
  }

  private buildContainer(x: number, y: number, z: number, color: number, rotY: number) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.5, 2.4), mat(color, 0.7, 0.2));
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    body.position.y = 1.25;

    // Corrugation lines
    for (let i = 0; i < 8; i++) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 2.3, 2.42),
        mat(color === P.containerRd ? 0x992020 : color === P.containerBl ? 0x1e448a : color === P.containerGr ? 0x1e6628 : 0xaa8818, 0.6, 0.3)
      );
      line.position.set(-2.7 + i * 0.77, 1.25, 0);
      g.add(line);
    }

    // Top frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.08, 2.5), mat(P.metalDark, 0.5, 0.5));
    frame.position.y = 2.52;
    frame.castShadow = true;
    g.add(frame);

    // Bottom frame
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.08, 2.5), mat(P.metalDark, 0.5, 0.5));
    bottom.position.y = 0.04;
    g.add(bottom);

    g.position.set(x, y, z);
    g.rotation.y = rotY;
    this.scene.add(g);

    const colliderMesh = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.5, 2.4));
    colliderMesh.position.set(x, y + 1.25, z);
    colliderMesh.rotation.y = rotY;
    colliderMesh.updateMatrixWorld();
    this.colliders.push(new THREE.Box3().setFromObject(colliderMesh));
  }

  private buildCone(x: number, z: number) {
    this.box(0.38, 0.03, 0.38, x, 0.015, z, P.metalDark, false);
    this.cyl(0.03, 0.16, 0.6, x, 0.33, z, P.coneOrg, false);
    this.cyl(0.08, 0.12, 0.07, x, 0.42, z, P.coneStripe, false);
    this.cyl(0.12, 0.15, 0.07, x, 0.22, z, P.coneStripe, false);
  }

  // ===================== HUNTER SPAWN =====================
  private buildHunterSpawn() {
    // Open-air spawn cage with chain-link style walls (no solid walls blocking exit during active)
    this.box(14, 0.1, 14, -40, 0.05, 0, P.concrete, false);

    // Three walls (open front toward warehouse)
    this.box(14, 3.5, 0.25, -40, 1.75, -7, P.concreteDk);
    this.box(14, 3.5, 0.25, -40, 1.75, 7, P.concreteDk);
    this.box(0.25, 3.5, 14, -47, 1.75, 0, P.concreteDk);

    // Gate -- roll-up style (no collider so players can walk through during active phase)
    this.box(0.12, 3.5, 14, -33, 1.75, 0, P.gateIron, false);
    // Gate frame
    this.box(0.3, 0.3, 14.5, -33, 3.65, 0, P.metalFrame, false, 0.5, 0.5);

    // Interior: ammo crates, bench
    this.box(0.8, 0.5, 0.5, -43, 0.25, -4, 0x4a5a2a);
    this.box(0.8, 0.5, 0.5, -43, 0.25, 4, 0x4a5a2a);
    this.box(2.0, 0.35, 0.5, -44, 0.175, 0, P.woodOld);
  }

  // ===================== DOCK AREA =====================
  private buildDockArea() {
    // Bollards
    for (let i = 0; i < 7; i++) {
      this.cyl(0.12, 0.16, 0.7, -15 + i * 8, 0.35, 36, P.bollardYl);
    }

    // Dock edge concrete lip
    this.box(60, 0.5, 0.4, 20, 0.25, 39, P.concreteDk);

    // Water plane
    const waterGeo = new THREE.PlaneGeometry(80, 30);
    const waterMat = new THREE.MeshStandardMaterial({
      color: P.water, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(20, -0.3, 55);
    water.receiveShadow = true;
    this.scene.add(water);

    // Rope coils on dock
    this.cyl(0.25, 0.25, 0.15, 5, 0.15, 36, P.woodOld, false);
    this.cyl(0.25, 0.25, 0.15, 30, 0.15, 36, P.woodOld, false);
    this.cyl(0.3, 0.3, 0.12, 18, 0.12, 36.5, P.woodOld, false);

    // Small rowboat on dock (great hiding spot)
    const boatGroup = new THREE.Group();
    const hullGeo = new THREE.BoxGeometry(1.8, 0.4, 3.5);
    const hull = new THREE.Mesh(hullGeo, mat(0x5a3a1a, 0.85, 0.05));
    hull.position.y = 0.3;
    hull.castShadow = true;
    hull.receiveShadow = true;
    boatGroup.add(hull);
    // Inner hull (darker)
    const inner = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 3.1), mat(0x4a2a10));
    inner.position.y = 0.45;
    boatGroup.add(inner);
    // Seats
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.3), mat(P.woodOld));
    seat.position.set(0, 0.5, -0.6); seat.castShadow = true;
    boatGroup.add(seat);
    const seat2 = seat.clone(); seat2.position.z = 0.6;
    boatGroup.add(seat2);
    boatGroup.position.set(25, 0, 37);
    boatGroup.rotation.y = 0.15;
    this.scene.add(boatGroup);
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(24, 0, 35.2), new THREE.Vector3(26, 0.6, 38.8)
    ));

    // Fishing crates on dock
    this.box(0.7, 0.4, 0.5, 10, 0.2, 36, P.woodOld);
    this.box(0.7, 0.4, 0.5, 10.8, 0.2, 36, P.woodWarm);
    this.box(0.6, 0.35, 0.45, 10.4, 0.6, 36, P.woodDark);

    // Fishing net pile
    const netGeo = new THREE.SphereGeometry(0.5, 6, 4);
    const netMat = new THREE.MeshStandardMaterial({ color: 0x5a7a5a, roughness: 0.95, wireframe: false });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(35, 0.3, 36.5);
    net.scale.set(1, 0.4, 1.2);
    net.castShadow = true;
    this.scene.add(net);

    // Life ring on wall hook
    const lifeRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 16), mat(0xff4422));
    lifeRing.position.set(0, 1.5, 38.8);
    lifeRing.castShadow = true;
    this.scene.add(lifeRing);
    // White stripes on life ring
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.065, 8, 4, Math.PI / 2), mat(0xffffff));
    stripe.position.copy(lifeRing.position);
    this.scene.add(stripe);

    // Dock cleats
    for (let i = 0; i < 5; i++) {
      this.box(0.15, 0.12, 0.3, -5 + i * 10, 0.2, 38, P.metalDark, false, 0.4, 0.6);
    }
  }

  // ===================== CLUTTER =====================
  private buildClutter() {
    // Trash bags
    const trashMat = mat(0x1a1a1a, 0.95, 0);
    this.add(new THREE.SphereGeometry(0.35, 8, 6), trashMat, -8, 0.3, 14, false);
    this.add(new THREE.SphereGeometry(0.28, 8, 6), trashMat, -7.5, 0.25, 14.4, false);
    this.add(new THREE.SphereGeometry(0.4, 8, 6), trashMat, 42, 0.35, -5, false);

    // Broken pallet
    this.box(1.2, 0.08, 0.25, 5, 0.04, 14, P.woodOld, false);
    this.box(0.3, 0.08, 0.9, 4.6, 0.04, 14, P.woodPallet, false);
    const brokenPlank = this.box(1.0, 0.06, 0.15, 5.2, 0.12, 14.3, P.woodOld, false);
    brokenPlank.rotation.z = 0.2;
    brokenPlank.rotation.y = 0.3;

    // Loose cables
    for (let i = 0; i < 3; i++) {
      const cable = new THREE.Mesh(
        new THREE.TorusGeometry(0.4 + i * 0.1, 0.015, 6, 20, Math.PI * 1.5),
        mat(0x222222)
      );
      cable.position.set(-15 + i * 0.3, 0.02, -5);
      cable.rotation.x = -Math.PI / 2;
      cable.rotation.z = i * 0.4;
      this.scene.add(cable);
    }

    // Fire extinguisher on wall bracket
    this.cyl(0.08, 0.09, 0.45, -20.5, 1.0, -14, 0xcc1111, false);
    this.box(0.15, 0.2, 0.08, -20.7, 1.0, -14, P.metalFrame, false);

    // Tire stacks near yard
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 8, 12), mat(0x1a1a1a, 0.92, 0));
      t.position.set(28, 0.3 + i * 0.22, -6);
      t.rotation.x = Math.PI / 2;
      t.castShadow = true;
      this.scene.add(t);
    }

    // Random small props on shelves (boxes, cans)
    this.box(0.3, 0.2, 0.2, -12.5, 1.4, -8, P.containerRd, false);
    this.box(0.25, 0.25, 0.25, -12, 1.42, -8, 0xddcc44, false);
    this.box(0.15, 0.3, 0.15, -5.5, 1.45, -8, 0x3366aa, false);
    this.cyl(0.06, 0.06, 0.2, -4.8, 1.4, 4, P.metalClean, false);
    this.cyl(0.06, 0.06, 0.2, -4.6, 1.4, 4, P.containerRd, false);

    // Light fixtures hanging from ceiling (more of them)
    const fixtureMat = mat(P.metalFrame, 0.4, 0.6);
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffdd, emissive: 0xffeeaa, emissiveIntensity: 0.8 });
    const positions = [
      [-8, 6.8, -5], [5, 6.8, -5], [-8, 6.8, 7], [5, 6.8, 7],
      [-15, 6.8, 0], [12, 6.8, 0], [0, 6.8, -12], [0, 6.8, 12],
    ];
    for (const [fx, fy, fz] of positions) {
      this.add(new THREE.BoxGeometry(1.2, 0.08, 0.3), fixtureMat, fx, fy, fz, false);
      this.add(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 4), fixtureMat, fx, fy + 0.4, fz, false);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), bulbMat);
      bulb.position.set(fx, fy - 0.06, fz);
      this.scene.add(bulb);
    }

    // Dumpster near warehouse entrance
    this.box(1.8, 1.2, 1.0, -6, 0.6, 19, P.dumpsterGn, true, 0.7, 0.2);
    this.box(1.85, 0.06, 1.05, -6, 1.22, 19, P.metalDark, false, 0.5, 0.4);
    // Dumpster lid (slightly open)
    const lid = this.box(1.85, 0.04, 0.5, -6, 1.3, 18.6, P.dumpsterGn, false, 0.7, 0.2);
    lid.rotation.x = -0.3;

    // Second dumpster
    this.box(1.8, 1.2, 1.0, 8, 0.6, 19, P.dumpsterGn, true, 0.7, 0.2);
    this.box(1.85, 0.06, 1.05, 8, 1.22, 19, P.metalDark, false, 0.5, 0.4);

    // Workbench in warehouse corner
    this.box(2.0, 0.06, 0.7, 18, 0.85, -16, P.woodDark);
    this.box(0.06, 0.85, 0.7, 17, 0.42, -16, P.metalFrame, false, 0.5, 0.5);
    this.box(0.06, 0.85, 0.7, 19, 0.42, -16, P.metalFrame, false, 0.5, 0.5);
    // Items on workbench
    this.box(0.15, 0.1, 0.08, 17.5, 0.93, -16, P.metalClean, false);
    this.cyl(0.04, 0.04, 0.18, 18.3, 0.97, -16.1, P.containerRd, false);
    this.box(0.3, 0.08, 0.15, 18.7, 0.92, -15.8, P.metalDark, false);

    // Paint cans scattered
    this.cyl(0.07, 0.08, 0.2, -14, 0.1, 12, 0x2255cc, false);
    this.cyl(0.07, 0.08, 0.2, -13.7, 0.1, 12.2, 0xcc2222, false);
    this.cyl(0.07, 0.08, 0.2, -13.5, 0.1, 11.8, 0x22cc22, false);

    // Electrical panel on warehouse wall
    this.box(0.6, 0.8, 0.08, 10, 1.6, -16.7, P.metalDark, false, 0.4, 0.5);
    this.box(0.55, 0.75, 0.02, 10, 1.6, -16.65, P.cabinetMtl, false, 0.5, 0.4);

    // Fire alarm
    this.box(0.15, 0.15, 0.08, -21.5, 1.8, -10, P.containerRd, false);

    // Emergency exit sign (emissive)
    const exitSignMat = new THREE.MeshStandardMaterial({
      color: 0x004400, emissive: P.neonGreen, emissiveIntensity: 0.6, roughness: 0.3,
    });
    const exitSign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.04), exitSignMat);
    exitSign.position.set(0, 6.5, 16.9);
    this.scene.add(exitSign);
    // Second exit sign
    const exitSign2 = exitSign.clone();
    exitSign2.position.set(21.8, 6.5, 2);
    exitSign2.rotation.y = Math.PI / 2;
    this.scene.add(exitSign2);

    // Mop and bucket in corner
    this.cyl(0.015, 0.015, 1.4, 20, 0.7, -16, P.woodOld, false);
    this.cyl(0.14, 0.11, 0.3, 20.3, 0.15, -16, 0x3366aa, false);

    // Stack of tires near forklift
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 8, 12), mat(0x1a1a1a, 0.92, 0));
      t.position.set(14, 0.3 + i * 0.22, 20);
      t.rotation.x = Math.PI / 2;
      t.castShadow = true;
      this.scene.add(t);
    }
  }

  // ===================== BACKGROUND DEPTH =====================
  private buildBackgroundDepth() {
    // Distant crane silhouette
    const craneMat = mat(P.metalDark, 0.6, 0.4);
    this.add(new THREE.BoxGeometry(0.8, 25, 0.8), craneMat, 70, 12.5, -30, false);
    this.add(new THREE.BoxGeometry(20, 0.6, 0.8), craneMat, 70, 24, -30, false);
    this.add(new THREE.BoxGeometry(0.5, 5, 0.5), craneMat, 58, 22, -30, false);
    this.add(new THREE.BoxGeometry(0.3, 8, 0.3), craneMat, 78, 20, -30, false);

    // Distant containers (background)
    this.box(6.5, 2.6, 2.5, 65, 1.3, 10, 0x884422, false);
    this.box(6.5, 2.6, 2.5, 65, 1.3, 14, 0x226688, false);
    this.box(6.5, 2.6, 2.5, 66, 3.9, 12, 0x448822, false);

    // Distant building
    this.box(15, 8, 10, -55, 4, -35, 0x999088, false, 0.9, 0.05);
    this.box(10, 12, 8, -65, 6, -30, 0x8a8278, false, 0.9, 0.05);
  }

  // ===================== VEHICLES & EQUIPMENT =====================
  private buildVehiclesAndEquipment() {
    // Forklift near warehouse entrance
    const _fkBody = mat(0xddaa22, 0.7, 0.2);
    const _fkMetal = mat(P.metalDark, 0.5, 0.5);
    this.box(1.2, 0.8, 2.0, 12, 0.4, 18, 0xddaa22, true);
    this.box(1.0, 1.2, 0.6, 12, 1.2, 17.3, 0xddaa22, true);
    this.box(0.08, 1.5, 0.08, 11.5, 0.75, 19.2, P.metalDark, false, 0.5, 0.5);
    this.box(0.08, 1.5, 0.08, 12.5, 0.75, 19.2, P.metalDark, false, 0.5, 0.5);
    this.box(1.2, 0.06, 0.5, 12, 1.5, 19.2, P.metalDark, false, 0.5, 0.5);
    // Wheels
    this.cyl(0.25, 0.25, 0.15, 11.4, 0.25, 17.5, 0x1a1a1a, false);
    this.cyl(0.25, 0.25, 0.15, 12.6, 0.25, 17.5, 0x1a1a1a, false);
    this.cyl(0.2, 0.2, 0.12, 11.5, 0.2, 19, 0x1a1a1a, false);
    this.cyl(0.2, 0.2, 0.12, 12.5, 0.2, 19, 0x1a1a1a, false);

    // Parked van/truck outside warehouse
    this.box(3.0, 2.0, 2.2, -28, 1.0, -20, 0xeeeeee, true);
    this.box(1.5, 1.6, 2.2, -25, 0.8, -20, 0x2255aa, true);
    this.cyl(0.35, 0.35, 0.18, -29, 0.35, -21, 0x1a1a1a, false);
    this.cyl(0.35, 0.35, 0.18, -29, 0.35, -19, 0x1a1a1a, false);
    this.cyl(0.35, 0.35, 0.18, -25, 0.35, -21, 0x1a1a1a, false);
    this.cyl(0.35, 0.35, 0.18, -25, 0.35, -19, 0x1a1a1a, false);

    // Anchor on dock
    this.box(0.6, 0.8, 0.15, 15, 0.4, 36.5, P.metalDark, false, 0.5, 0.5);
    this.cyl(0.08, 0.08, 0.6, 15, 0.9, 36.5, P.metalDark, false);
  }

  // ===================== VEGETATION =====================
  private buildVegetation() {
    const _trunkMat = mat(0x5a3a1a, 0.9, 0);
    const leafMat = mat(0x3a7a2a, 0.85, 0);
    const leafLt = mat(0x4a8a3a, 0.85, 0);

    const treePositions = [
      [-30, 15], [-25, 20], [-35, -25], [50, 20], [55, 15],
      [-50, 15], [-45, 25], [48, -28], [-55, -10], [55, -5],
    ];

    for (const [tx, tz] of treePositions) {
      const h = 3 + Math.random() * 3;
      this.cyl(0.15, 0.2, h, tx, h / 2, tz, 0x5a3a1a, false);

      const crownSize = 1.5 + Math.random() * 1.5;
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(crownSize, 8, 6),
        Math.random() > 0.5 ? leafMat : leafLt
      );
      crown.position.set(tx, h + crownSize * 0.4, tz);
      crown.scale.y = 0.7 + Math.random() * 0.3;
      crown.castShadow = true;
      this.scene.add(crown);
    }

    // Bushes
    const bushMat = mat(0x3a6a2a, 0.9, 0);
    const bushPositions = [
      [-22, 17], [22, 18], [-15, 20], [0, 20], [45, 5],
      [-40, 10], [-40, -10], [30, 25], [-20, -22],
    ];
    for (const [bx, bz] of bushPositions) {
      const s = 0.5 + Math.random() * 0.8;
      const bush = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), bushMat);
      bush.position.set(bx, s * 0.5, bz);
      bush.scale.y = 0.6;
      bush.castShadow = true;
      this.scene.add(bush);
    }

    // More bushes near building edges (hiding spots!)
    const bushHideMat = mat(0x2a5a1a, 0.9, 0);
    const hideBushPositions = [
      [-22, 5], [-22, -5], [-22, 12], [22, -8], [22, 15],
      [-10, 17.5], [10, 17.5], [-30, -5], [45, -20],
    ];
    for (const [bx, bz] of hideBushPositions) {
      const s = 0.7 + Math.random() * 0.5;
      const bush = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), bushHideMat);
      bush.position.set(bx, s * 0.4, bz);
      bush.scale.y = 0.55;
      bush.castShadow = true;
      this.scene.add(bush);
    }

    // Grass tufts near buildings (more dense)
    const grassMat = mat(0x5a8a32, 0.95, 0);
    for (let i = 0; i < 60; i++) {
      const gx = (Math.random() - 0.5) * 120;
      const gz = (Math.random() - 0.5) * 90;
      const dist = Math.sqrt(gx * gx + gz * gz);
      if (dist < 25) continue;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.12 + Math.random() * 0.1, 0.25 + Math.random() * 0.15, 4), grassMat);
      tuft.position.set(gx, 0.15, gz);
      tuft.rotation.y = Math.random() * Math.PI;
      this.scene.add(tuft);
    }

    // Flower patches
    const flowerColors = [0xff6688, 0xffaa33, 0xffff55, 0xaa66ff];
    for (let i = 0; i < 15; i++) {
      const fx = -40 + Math.random() * 80;
      const fz = 20 + Math.random() * 8;
      if (Math.abs(fx) < 25 && Math.abs(fz) < 20) continue;
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 4, 4),
        mat(flowerColors[Math.floor(Math.random() * flowerColors.length)])
      );
      flower.position.set(fx, 0.15 + Math.random() * 0.1, fz);
      this.scene.add(flower);
    }
  }

  // ===================== SIGNS & POLES =====================
  private buildSignsAndPoles() {
    // Warehouse sign above front door
    this.box(6, 1.0, 0.1, 0, 6.5, 17.2, P.metalDark, false, 0.5, 0.5);
    this.box(5.6, 0.7, 0.05, 0, 6.5, 17.3, 0xddddaa, false);

    // Street lamps with warm glow
    const lampPositions = [
      [-25, 30], [0, 30], [25, 30], [50, 0], [-30, -15],
    ];
    for (const [lx, lz] of lampPositions) {
      this.cyl(0.08, 0.1, 5, lx, 2.5, lz, P.poleGray, false);
      // Arm
      this.box(1.2, 0.06, 0.06, lx + 0.6, 5, lz, P.poleGray, false, 0.5, 0.5);
      // Lamp head
      const lampGeo = new THREE.BoxGeometry(0.6, 0.15, 0.3);
      const lampMesh = new THREE.Mesh(lampGeo, new THREE.MeshStandardMaterial({
        color: 0xffffdd, emissive: 0xffeeaa, emissiveIntensity: 0.5, roughness: 0.3,
      }));
      lampMesh.position.set(lx + 1.2, 4.9, lz);
      lampMesh.castShadow = false;
      this.scene.add(lampMesh);
    }

    // Warning signs
    this.box(0.6, 0.6, 0.04, 21, 2.5, 17.2, 0xffcc00, false);
    this.box(0.5, 0.5, 0.03, 21, 2.5, 17.24, 0x333333, false);

    // No entry sign at yard
    this.cyl(0.04, 0.04, 2.0, 24, 1.0, 0, P.poleGray, false);
    const signGeo = new THREE.CircleGeometry(0.3, 16);
    const signMesh = new THREE.Mesh(signGeo, mat(0xcc2222));
    signMesh.position.set(24, 2.1, 0.05);
    this.scene.add(signMesh);
  }

  // ===================== DECALS =====================
  private buildDecals() {
    const stainMat = new THREE.MeshStandardMaterial({ color: P.oilStain, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.35 });
    const stainPositions = [[0, 5], [-10, -3], [8, -10], [15, 2], [-5, 12], [12, 18], [-3, 0]];
    for (const [sx, sz] of stainPositions) {
      const stain = new THREE.Mesh(new THREE.CircleGeometry(0.6 + Math.random() * 0.8, 12), stainMat);
      stain.rotation.x = -Math.PI / 2;
      stain.position.set(sx, 0.13, sz);
      this.scene.add(stain);
    }

    const wornMat = new THREE.MeshStandardMaterial({ color: P.asphaltLt, roughness: 0.9, transparent: true, opacity: 0.4 });
    const wornPositions = [[35, -8], [40, -18], [32, -14], [38, -3]];
    for (const [wx, wz] of wornPositions) {
      const worn = new THREE.Mesh(new THREE.CircleGeometry(1.5 + Math.random(), 10), wornMat);
      worn.rotation.x = -Math.PI / 2;
      worn.position.set(wx, 0.12, wz);
      this.scene.add(worn);
    }

    // Puddles (more, varied sizes)
    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x556688, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.5,
    });
    const puddlePositions = [[-8, 8], [5, -12], [35, -20], [-3, 16], [15, -3], [40, -5], [-18, 5], [28, 0]];
    for (const [px, pz] of puddlePositions) {
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.5 + Math.random() * 0.8, 12), puddleMat);
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(px, 0.14, pz);
      this.scene.add(puddle);
    }

    // Tire tracks on asphalt
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, transparent: true, opacity: 0.25 });
    for (let i = 0; i < 8; i++) {
      const track = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 3), trackMat);
      track.rotation.x = -Math.PI / 2;
      track.position.set(36 + (i % 2) * 1.5, 0.12, -18 + i * 2);
      track.rotation.z = 0.05;
      this.scene.add(track);
    }

    // Crack marks on concrete floor
    const crackMat = new THREE.MeshStandardMaterial({ color: 0x555550, roughness: 0.9, transparent: true, opacity: 0.3 });
    const crackPositions = [[2, 3], [-8, -5], [12, 8], [-15, -10], [6, -8]];
    for (const [cx, cz] of crackPositions) {
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 2 + Math.random() * 2), crackMat);
      crack.rotation.x = -Math.PI / 2;
      crack.rotation.z = Math.random() * Math.PI;
      crack.position.set(cx, 0.13, cz);
      this.scene.add(crack);
    }

    // Moss/algae near dock
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.95, transparent: true, opacity: 0.4 });
    const mossPositions = [[5, 35], [15, 38], [28, 38], [40, 36]];
    for (const [mx, mz] of mossPositions) {
      const moss = new THREE.Mesh(new THREE.CircleGeometry(0.6 + Math.random() * 0.5, 8), mossMat);
      moss.rotation.x = -Math.PI / 2;
      moss.position.set(mx, 0.15, mz);
      this.scene.add(moss);
    }
  }

  // ===================== STORAGE ALCOVE (hidden room) =====================
  private buildStorageAlcove() {
    const ax = -16, az = -14;
    // Partition walls forming a small room
    this.box(6, 3.5, 0.2, ax, 1.75, az + 2, P.wallInner);
    this.box(0.2, 3.5, 4, ax + 3, 1.75, az, P.wallInner);
    this.box(2.2, 3.5, 0.2, ax - 1.8, 1.75, az + 2, P.wallInner, false);
    this.box(2.2, 1.0, 0.2, ax + 1.8, 3.0, az + 2, P.wallInner, false);
    // Shelf inside
    this.box(0.06, 2.8, 0.06, ax - 2.5, 1.4, az - 1.5, P.metalFrame, false);
    this.box(0.06, 2.8, 0.06, ax - 0.5, 1.4, az - 1.5, P.metalFrame, false);
    this.box(2.1, 0.05, 0.6, ax - 1.5, 1.0, az - 1.5, P.woodWarm, false);
    this.box(2.1, 0.05, 0.6, ax - 1.5, 2.0, az - 1.5, P.woodWarm, false);
    // Items on shelves
    this.box(0.3, 0.25, 0.2, ax - 2.2, 1.15, az - 1.5, P.containerRd, false);
    this.box(0.25, 0.3, 0.2, ax - 1.8, 1.18, az - 1.5, P.containerBl, false);
    this.cyl(0.06, 0.06, 0.2, ax - 1.0, 1.12, az - 1.5, P.metalClean, false);
    this.box(0.4, 0.2, 0.3, ax - 2.0, 2.12, az - 1.5, P.cardboard, false);
    // Boxes on floor
    this.box(0.8, 0.6, 0.6, ax + 1.5, 0.3, az - 1, P.cardboard);
    this.box(0.6, 0.4, 0.5, ax + 1.5, 0.2, az, P.cardboard);
    this.box(0.5, 0.8, 0.5, ax - 2.5, 0.4, az + 1, P.woodWarm);
    // Bare bulb
    const alcBulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffeeaa, emissiveIntensity: 0.6 }));
    alcBulb.position.set(ax, 3.2, az); this.scene.add(alcBulb);
  }

  // ===================== CATWALK =====================
  private buildCatwalk() {
    const cwX = -20.5, cwY = 4.2, cwZS = -14, cwZE = 14, cwLen = 28;
    this.box(1.5, 0.08, cwLen, cwX, cwY, 0, P.metalFrame, true, 0.5, 0.5);
    this.box(0.04, 1.0, cwLen, cwX - 0.7, cwY + 0.5, 0, P.metalFrame, false, 0.5, 0.5);
    this.box(0.04, 1.0, cwLen, cwX + 0.7, cwY + 0.5, 0, P.metalFrame, false, 0.5, 0.5);
    for (let i = 0; i <= 7; i++) {
      const pz = cwZS + i * 4;
      this.box(0.04, 1.0, 0.04, cwX - 0.7, cwY + 0.5, pz, P.metalDark, false, 0.5, 0.5);
      this.box(0.04, 1.0, 0.04, cwX + 0.7, cwY + 0.5, pz, P.metalDark, false, 0.5, 0.5);
    }
    for (let i = 0; i < 4; i++) {
      const bz = cwZS + 2 + i * 7;
      this.box(1.0, 0.12, 0.12, cwX + 0.2, cwY - 0.1, bz, P.metalDark, false, 0.5, 0.5);
      const brace = this.box(0.08, 1.8, 0.08, cwX + 0.5, cwY - 1.0, bz, P.metalFrame, false, 0.5, 0.5);
      brace.rotation.z = 0.6;
    }
    // Ladder
    const ladX = cwX + 0.5, ladZ = cwZS + 1;
    for (let r = 0; r < 14; r++) {
      this.box(0.5, 0.04, 0.06, ladX, 0.3 + r * 0.3, ladZ, P.metalFrame, false, 0.5, 0.5);
    }
    this.box(0.04, cwY, 0.04, ladX - 0.22, cwY / 2, ladZ, P.metalFrame, false, 0.5, 0.5);
    this.box(0.04, cwY, 0.04, ladX + 0.22, cwY / 2, ladZ, P.metalFrame, false, 0.5, 0.5);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(ladX - 0.3, 0, ladZ - 0.15), new THREE.Vector3(ladX + 0.3, cwY, ladZ + 0.15)));
    // Partial cover
    this.box(1.4, 0.8, 0.04, cwX, cwY + 0.6, cwZS + 5, P.corrugated, false, 0.6, 0.3);
    this.box(1.4, 0.8, 0.04, cwX, cwY + 0.6, cwZE - 3, P.corrugated, false, 0.6, 0.3);
  }

  // ===================== PIPE RUNS =====================
  private buildPipeRuns() {
    const pipeMat = mat(P.pipeSilver, 0.4, 0.6);
    const pipeRustMat = mat(P.pipeRust, 0.7, 0.3);
    this.add(new THREE.CylinderGeometry(0.08, 0.08, 40, 8), pipeMat, 0, 3.5, -16.5, false).rotation.z = Math.PI / 2;
    this.add(new THREE.CylinderGeometry(0.06, 0.06, 40, 8), pipeRustMat, 0, 4.2, -16.5, false).rotation.z = Math.PI / 2;
    for (const dx of [-15, -5, 8, 18]) {
      this.cyl(0.08, 0.08, 3.5, dx, 1.75, -16.5, P.pipeSilver, false);
      this.box(0.25, 0.06, 0.2, dx, 3.5, -16.5, P.metalDark, false, 0.5, 0.5);
    }
    this.add(new THREE.CylinderGeometry(0.07, 0.07, 30, 8), pipeMat, -21.5, 2.8, 0, false).rotation.x = Math.PI / 2;
    this.box(0.3, 0.3, 0.3, -15, 3.5, -16.5, P.metalDark, false, 0.5, 0.5);
    this.box(0.25, 0.25, 0.25, 8, 3.5, -16.5, P.metalDark, false, 0.5, 0.5);
    this.cyl(0.05, 0.05, 0.4, -5, 4.4, -16.5, P.pipeSilver, false);
    this.cyl(0.12, 0.05, 0.15, -5, 4.65, -16.5, P.metalClean, false);
    this.add(new THREE.CylinderGeometry(0.1, 0.1, 34, 8), pipeRustMat, -22.5, 1.5, 0, false).rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) {
      this.box(0.3, 0.08, 0.08, -22.5, 1.5, -14 + i * 7, P.metalFrame, false, 0.5, 0.5);
    }
  }

  // ===================== LOADING BAY =====================
  private buildLoadingBay() {
    const lx = 28, lz = 0;
    this.box(10, 0.15, 8, lx, 4.5, lz, P.corrugated, false, 0.6, 0.3);
    for (const [px, pz] of [[-4.5, -3.5], [4.5, -3.5], [-4.5, 3.5], [4.5, 3.5]]) {
      this.box(0.2, 4.5, 0.2, lx + px, 2.25, lz + pz, P.metalFrame, false, 0.5, 0.5);
    }
    this.box(10, 0.4, 8, lx, 0.2, lz, P.concreteLt, true);
    this.box(1.2, 1.2, 1.2, lx - 3, 1.0, lz - 2, P.woodWarm);
    this.box(1.2, 1.2, 1.2, lx - 3, 1.0, lz - 0.8, P.woodDark);
    this.box(1.0, 1.0, 1.0, lx - 3, 2.2, lz - 1.4, P.woodOld);
    this.box(1.2, 1.2, 1.2, lx + 2, 1.0, lz + 2, P.woodDark);
    this.box(1.2, 1.2, 1.2, lx + 3.2, 1.0, lz + 2, P.woodWarm);
    this.box(1.2, 1.2, 1.2, lx + 2.6, 2.2, lz + 2, P.woodOld);
    this.box(1.2, 0.12, 1.0, lx, 0.46, lz, P.woodPallet);
    this.box(1.0, 0.8, 0.8, lx, 0.9, lz, P.plasticWhite, true, 0.95, 0);
    this.cyl(0.33, 0.35, 0.95, lx + 3, 0.88, lz - 2, P.metalRust);
    this.cyl(0.33, 0.35, 0.95, lx + 3.7, 0.88, lz - 2, P.metalClean);
    const bayBulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffdd, emissive: 0xffeeaa, emissiveIntensity: 0.7 }));
    bayBulb.position.set(lx, 4.2, lz); this.scene.add(bayBulb);
    this.add(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), mat(P.metalFrame), lx, 4.4, lz, false);
  }

  // ===================== DOCK SHED =====================
  private buildDockShed() {
    const sx = 43, sz = 34;
    this.box(4, 0.15, 3.5, sx, 0.07, sz, P.woodOld, true);
    this.box(4, 2.8, 0.15, sx, 1.4, sz - 1.75, P.woodDark);
    this.box(0.15, 2.8, 3.5, sx - 2, 1.4, sz, P.woodDark);
    this.box(0.15, 2.8, 3.5, sx + 2, 1.4, sz, P.woodWarm);
    this.box(1.2, 2.8, 0.15, sx - 1.4, 1.4, sz + 1.75, P.woodDark);
    this.box(1.2, 2.8, 0.15, sx + 1.4, 1.4, sz + 1.75, P.woodWarm);
    this.box(1.6, 0.6, 0.15, sx, 2.5, sz + 1.75, P.woodDark, false);
    const roofM = this.box(4.4, 0.1, 4, sx, 2.95, sz, P.corrugated, false, 0.6, 0.3);
    roofM.rotation.x = 0.1;
    this.box(0.04, 0.04, 2.5, sx, 2.2, sz - 1.6, P.metalFrame, false, 0.5, 0.5);
    this.box(0.04, 0.6, 0.04, sx - 0.5, 1.85, sz - 1.6, P.woodOld, false);
    this.box(0.04, 0.5, 0.04, sx, 1.9, sz - 1.6, P.metalClean, false);
    this.box(0.04, 0.7, 0.04, sx + 0.5, 1.8, sz - 1.6, P.woodDark, false);
    this.box(1.5, 0.06, 0.6, sx - 0.5, 0.8, sz - 1, P.woodWarm, false);
    this.box(0.06, 0.8, 0.6, sx - 1.2, 0.4, sz - 1, P.woodDark, false);
    this.box(0.06, 0.8, 0.6, sx + 0.2, 0.4, sz - 1, P.woodDark, false);
    this.cyl(0.14, 0.11, 0.3, sx + 1.2, 0.22, sz + 0.5, 0x3366aa, false);
    this.box(0.4, 0.3, 0.3, sx + 1, 0.22, sz - 0.5, P.containerRd, false);
  }

  // ===================== OUTDOOR BREAK AREA =====================
  private buildOutdoorBreakArea() {
    const bx = -10, bz = 22;
    this.box(6, 0.1, 5, bx, 0.05, bz, P.concreteLt, false);
    this.box(2.0, 0.06, 0.8, bx, 0.72, bz, P.woodWarm);
    this.box(2.0, 0.06, 0.35, bx, 0.42, bz - 0.8, P.woodWarm, false);
    this.box(2.0, 0.06, 0.35, bx, 0.42, bz + 0.8, P.woodWarm, false);
    this.box(0.06, 0.72, 1.8, bx - 0.7, 0.36, bz, P.woodDark, false);
    this.box(0.06, 0.72, 1.8, bx + 0.7, 0.36, bz, P.woodDark, false);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(bx - 1.1, 0, bz - 1.1), new THREE.Vector3(bx + 1.1, 0.8, bz + 1.1)));
    this.box(0.8, 1.8, 0.65, bx + 4, 0.9, bz - 1.5, P.containerBl, true, 0.4, 0.3);
    this.box(0.6, 0.8, 0.02, bx + 4, 1.2, bz - 1.16, 0xaaddff, false, 0.2, 0.1);
    const vg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x88bbff, emissive: 0x4488cc, emissiveIntensity: 0.4 }));
    vg.position.set(bx + 4, 1.2, bz - 1.15); this.scene.add(vg);
    this.cyl(0.2, 0.18, 0.6, bx - 3, 0.3, bz + 1, P.dumpsterGn, true);
    this.box(1.5, 0.06, 0.4, bx - 3.5, 0.42, bz - 1, P.woodOld);
    this.cyl(0.04, 0.04, 2.5, bx, 1.25, bz, P.poleGray, false);
    const umb = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.4, 8, 1, true), mat(P.containerRd, 0.9, 0));
    umb.position.set(bx, 2.6, bz); umb.castShadow = true; this.scene.add(umb);
  }

  // ===================== ATMOSPHERIC DETAILS =====================
  private buildAtmosphericDetails() {
    const chainMat = mat(P.chainGray, 0.4, 0.6);
    for (const [cx, cy, cz] of [[-10,7,5],[8,7,-3],[-3,7,10],[15,7,-10],[-18,7,-5],[5,7,14],[-12,7,-12]]) {
      const cl = 1.5 + Math.random() * 2;
      this.cyl(0.015, 0.015, cl, cx, cy - cl / 2, cz, P.chainGray, false);
      const hk = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 8, Math.PI * 1.5), chainMat);
      hk.position.set(cx, cy - cl - 0.05, cz); this.scene.add(hk);
    }
    // Cobwebs
    const cwMat = new THREE.MeshStandardMaterial({ color: P.cobwebWhite, transparent: true, opacity: 0.15, side: THREE.DoubleSide, roughness: 1 });
    for (const [wx,wy,wz] of [[-21.5,7.2,-16.5],[21.5,7.2,-16.5],[-21.5,7.2,16.5],[21.5,7.2,16.5],[-21.5,3.8,-16.5],[21.5,3.8,16.5]]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), cwMat);
      w.position.set(wx, wy, wz); w.rotation.y = Math.atan2(wz, wx) + Math.PI; w.rotation.x = -0.3;
      this.scene.add(w);
    }
    // Dust motes
    const dMat = new THREE.MeshBasicMaterial({ color: 0xffffee, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 80; i++) {
      const s = 0.02 + Math.random() * 0.04;
      const d = new THREE.Mesh(new THREE.PlaneGeometry(s, s), dMat);
      d.position.set((Math.random()-0.5)*40, 1+Math.random()*5.5, (Math.random()-0.5)*30);
      d.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0);
      this.scene.add(d);
    }
    // Light shafts
    const sMat = new THREE.MeshBasicMaterial({ color: 0xfff8e0, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), sMat);
    s1.position.set(0, 4, 14); s1.rotation.x = -0.3; s1.rotation.y = 0.1; this.scene.add(s1);
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), sMat);
    s2.position.set(20, 3.5, 2); s2.rotation.y = Math.PI/2+0.2; s2.rotation.x = -0.2; this.scene.add(s2);
    // Ceiling fans
    const fMat = mat(P.metalFrame, 0.5, 0.5);
    for (const [fx,fy,fz] of [[-5,7.2,0],[10,7.2,-8]]) {
      this.cyl(0.1, 0.1, 0.15, fx, fy, fz, P.metalDark, false);
      this.cyl(0.015, 0.015, 0.5, fx, fy+0.3, fz, P.metalFrame, false);
      for (let b = 0; b < 4; b++) {
        const a = (b*Math.PI)/2;
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.8), fMat);
        bl.position.set(fx+Math.cos(a)*0.5, fy, fz+Math.sin(a)*0.5); bl.rotation.y = a;
        this.scene.add(bl);
      }
    }
    // Water shimmer
    const wMat = new THREE.MeshBasicMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), wMat);
      sh.rotation.x = -Math.PI/2; sh.position.set(-10+i*8, -0.1, 52+Math.random()*5);
      this.scene.add(sh);
    }
  }

  getColliders(): THREE.Box3[] {
    return this.colliders;
  }
}
