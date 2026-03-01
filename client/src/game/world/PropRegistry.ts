import * as THREE from "three";
import type { PropDefinition } from "@catch-and-run/shared";

export class PropRegistry {
  private definitions: Map<string, PropDefinition> = new Map();

  loadFromMapData(props: PropDefinition[]) {
    props.forEach((p) => this.definitions.set(p.id, p));
  }

  get(propId: string): PropDefinition | undefined {
    return this.definitions.get(propId);
  }

  getAll(): PropDefinition[] {
    return Array.from(this.definitions.values());
  }

  createMesh(propId: string): THREE.Mesh | null {
    const def = this.definitions.get(propId);
    if (!def) return null;

    const group = new THREE.Group();
    const builder = PROP_BUILDERS[propId];

    if (builder) {
      builder(group, def);
    } else {
      buildDefault(group, def);
    }

    const wrapper = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ visible: false }));
    wrapper.add(group);
    wrapper.castShadow = true;
    wrapper.receiveShadow = true;
    wrapper.userData.propId = propId;
    wrapper.userData.propName = def.name;
    return wrapper;
  }
}

function mat(color: number, roughness = 0.8, metalness = 0.1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function addPart(group: THREE.Group, geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

function buildDefault(group: THREE.Group, def: PropDefinition) {
  const { x, y, z } = def.dimensions;
  const geo = new THREE.BoxGeometry(x, y, z);
  addPart(group, geo, mat(def.color), 0, y / 2, 0);
}

function buildCrate(group: THREE.Group, def: PropDefinition) {
  const s = 1.1;
  const woodMat = mat(0xb8803a);
  const plankMat = mat(0x9a6c2e);
  const bandMat = mat(0x665533, 0.6, 0.3);

  addPart(group, new THREE.BoxGeometry(s, s, s), woodMat, 0, s / 2, 0);
  // Cross planks on front
  const plank = new THREE.BoxGeometry(s + 0.02, 0.08, 0.04);
  addPart(group, plank, plankMat, 0, s * 0.3, s / 2 + 0.01);
  addPart(group, plank, plankMat, 0, s * 0.7, s / 2 + 0.01);
  // Bands
  const band = new THREE.BoxGeometry(s + 0.04, 0.06, s + 0.04);
  addPart(group, band, bandMat, 0, s * 0.25, 0);
  addPart(group, band, bandMat, 0, s * 0.75, 0);
}

function buildBarrel(group: THREE.Group, _def: PropDefinition) {
  const bodyMat = mat(0x665544, 0.7, 0.3);
  const bandMat = mat(0x888888, 0.4, 0.6);
  const lidMat = mat(0x777766, 0.5, 0.4);

  addPart(group, new THREE.CylinderGeometry(0.33, 0.35, 0.95, 16), bodyMat, 0, 0.475, 0);
  addPart(group, new THREE.CylinderGeometry(0.36, 0.36, 0.06, 16), bandMat, 0, 0.15, 0);
  addPart(group, new THREE.CylinderGeometry(0.36, 0.36, 0.06, 16), bandMat, 0, 0.8, 0);
  addPart(group, new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), lidMat, 0, 0.96, 0);
}

function buildChair(group: THREE.Group, _def: PropDefinition) {
  const seatMat = mat(0x2a2a2a);
  const legMat = mat(0x555555, 0.5, 0.5);

  addPart(group, new THREE.BoxGeometry(0.45, 0.06, 0.45), seatMat, 0, 0.45, 0);
  addPart(group, new THREE.BoxGeometry(0.45, 0.45, 0.06), seatMat, 0, 0.7, -0.2);
  const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6);
  addPart(group, legGeo, legMat, -0.18, 0.22, -0.18);
  addPart(group, legGeo, legMat, 0.18, 0.22, -0.18);
  addPart(group, legGeo, legMat, -0.18, 0.22, 0.18);
  addPart(group, legGeo, legMat, 0.18, 0.22, 0.18);
}

function buildDesk(group: THREE.Group, _def: PropDefinition) {
  const topMat = mat(0x6b4226);
  const legMat = mat(0x555555, 0.5, 0.5);
  const drawerMat = mat(0x5a3820);

  addPart(group, new THREE.BoxGeometry(1.5, 0.06, 0.8), topMat, 0, 0.75, 0);
  const legGeo = new THREE.BoxGeometry(0.06, 0.74, 0.06);
  addPart(group, legGeo, legMat, -0.68, 0.37, -0.34);
  addPart(group, legGeo, legMat, 0.68, 0.37, -0.34);
  addPart(group, legGeo, legMat, -0.68, 0.37, 0.34);
  addPart(group, legGeo, legMat, 0.68, 0.37, 0.34);
  addPart(group, new THREE.BoxGeometry(0.4, 0.25, 0.7), drawerMat, 0.45, 0.55, 0);
}

function buildFireExtinguisher(group: THREE.Group, _def: PropDefinition) {
  const bodyMat = mat(0xcc0000);
  const topMat = mat(0x222222, 0.5, 0.5);
  const handleMat = mat(0x333333, 0.5, 0.5);

  addPart(group, new THREE.CylinderGeometry(0.09, 0.1, 0.4, 12), bodyMat, 0, 0.2, 0);
  addPart(group, new THREE.CylinderGeometry(0.04, 0.06, 0.08, 8), topMat, 0, 0.44, 0);
  addPart(group, new THREE.BoxGeometry(0.12, 0.04, 0.04), handleMat, 0, 0.48, 0);
  addPart(group, new THREE.CylinderGeometry(0.015, 0.015, 0.15, 6), handleMat, 0.06, 0.35, 0.06);
}

function buildCardboardBox(group: THREE.Group, _def: PropDefinition) {
  const boxMat = mat(0xc4953d);
  const tapeMat = mat(0xb8863a, 0.9, 0.0);

  addPart(group, new THREE.BoxGeometry(0.75, 0.55, 0.55), boxMat, 0, 0.275, 0);
  addPart(group, new THREE.BoxGeometry(0.08, 0.56, 0.56), tapeMat, 0, 0.28, 0);
  // Flap suggestion
  const flapGeo = new THREE.BoxGeometry(0.37, 0.02, 0.55);
  const flap = addPart(group, flapGeo, boxMat, 0, 0.56, 0);
  flap.rotation.z = 0.15;
}

function buildCone(group: THREE.Group, _def: PropDefinition) {
  const coneMat = mat(0xff8c00);
  const baseMat = mat(0x222222);
  const stripeMat = mat(0xffffff);

  addPart(group, new THREE.BoxGeometry(0.4, 0.04, 0.4), baseMat, 0, 0.02, 0);
  addPart(group, new THREE.CylinderGeometry(0.03, 0.18, 0.65, 8), coneMat, 0, 0.36, 0);
  addPart(group, new THREE.CylinderGeometry(0.08, 0.12, 0.08, 8), stripeMat, 0, 0.45, 0);
  addPart(group, new THREE.CylinderGeometry(0.13, 0.16, 0.08, 8), stripeMat, 0, 0.25, 0);
}

function buildTrashCan(group: THREE.Group, _def: PropDefinition) {
  const bodyMat = mat(0x556b55, 0.7, 0.2);
  const rimMat = mat(0x444444, 0.5, 0.4);
  const bagMat = mat(0x111111);

  addPart(group, new THREE.CylinderGeometry(0.25, 0.22, 0.75, 12), bodyMat, 0, 0.375, 0);
  addPart(group, new THREE.CylinderGeometry(0.27, 0.27, 0.06, 12), rimMat, 0, 0.76, 0);
  addPart(group, new THREE.SphereGeometry(0.18, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), bagMat, 0, 0.7, 0);
}

function buildToolbox(group: THREE.Group, _def: PropDefinition) {
  const bodyMat = mat(0xcc2222);
  const handleMat = mat(0x444444, 0.4, 0.6);
  const latchMat = mat(0xcccc44, 0.4, 0.5);

  addPart(group, new THREE.BoxGeometry(0.5, 0.22, 0.28), bodyMat, 0, 0.11, 0);
  addPart(group, new THREE.BoxGeometry(0.5, 0.12, 0.28), bodyMat, 0, 0.28, 0);
  addPart(group, new THREE.BoxGeometry(0.3, 0.04, 0.04), handleMat, 0, 0.38, 0);
  addPart(group, new THREE.BoxGeometry(0.04, 0.06, 0.04), latchMat, -0.15, 0.22, 0.13);
  addPart(group, new THREE.BoxGeometry(0.04, 0.06, 0.04), latchMat, 0.15, 0.22, 0.13);
}

function buildBucket(group: THREE.Group, _def: PropDefinition) {
  const bodyMat = mat(0x3366aa);
  const handleMat = mat(0x888888, 0.4, 0.6);

  addPart(group, new THREE.CylinderGeometry(0.18, 0.14, 0.35, 10), bodyMat, 0, 0.175, 0);
  const handle = new THREE.TorusGeometry(0.16, 0.012, 6, 12, Math.PI);
  const hMesh = addPart(group, handle, handleMat, 0, 0.35, 0);
  hMesh.rotation.x = Math.PI;
}

function buildPallet(group: THREE.Group, _def: PropDefinition) {
  const woodMat = mat(0xb8944a);

  for (let i = 0; i < 3; i++) {
    addPart(group, new THREE.BoxGeometry(1.2, 0.03, 0.15), woodMat, 0, 0.12, -0.35 + i * 0.35);
  }
  for (let i = 0; i < 5; i++) {
    addPart(group, new THREE.BoxGeometry(0.2, 0.03, 0.9), woodMat, -0.48 + i * 0.24, 0.03, 0);
  }
  for (let i = 0; i < 3; i++) {
    addPart(group, new THREE.BoxGeometry(0.1, 0.08, 0.1), woodMat, -0.45 + i * 0.45, 0.075, -0.35);
    addPart(group, new THREE.BoxGeometry(0.1, 0.08, 0.1), woodMat, -0.45 + i * 0.45, 0.075, 0.35);
  }
}

function buildTire(group: THREE.Group, _def: PropDefinition) {
  const tireMat = mat(0x1a1a1a, 0.9, 0.0);
  const rimMat = mat(0xaaaaaa, 0.3, 0.7);

  addPart(group, new THREE.TorusGeometry(0.28, 0.1, 10, 16), tireMat, 0, 0.28, 0);
  addPart(group, new THREE.CylinderGeometry(0.18, 0.18, 0.08, 12), rimMat, 0, 0.28, 0);
}

function buildHardhat(group: THREE.Group, _def: PropDefinition) {
  const shellMat = mat(0xffcc00);
  const rimMat = mat(0xddaa00);

  addPart(group, new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), shellMat, 0, 0.12, 0);
  addPart(group, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12), rimMat, 0, 0.04, 0);
}

function buildBuoy(group: THREE.Group, _def: PropDefinition) {
  const bodyMat = mat(0xdd2222);
  const stripeMat = mat(0xffffff);

  addPart(group, new THREE.SphereGeometry(0.22, 12, 10), bodyMat, 0, 0.22, 0);
  addPart(group, new THREE.CylinderGeometry(0.23, 0.23, 0.06, 12), stripeMat, 0, 0.22, 0);
  addPart(group, new THREE.CylinderGeometry(0.04, 0.04, 0.15, 6), mat(0x333333), 0, 0.45, 0);
}

const PROP_BUILDERS: Record<string, (group: THREE.Group, def: PropDefinition) => void> = {
  crate: buildCrate,
  crate_small: buildCrate,
  barrel: buildBarrel,
  chair: buildChair,
  desk: buildDesk,
  fire_extinguisher: buildFireExtinguisher,
  cardboard_box: buildCardboardBox,
  cone: buildCone,
  trash_can: buildTrashCan,
  toolbox: buildToolbox,
  bucket: buildBucket,
  pallet: buildPallet,
  tire: buildTire,
  hardhat: buildHardhat,
  buoy: buildBuoy,
};
