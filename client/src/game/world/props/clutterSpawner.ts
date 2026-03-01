import * as THREE from "three";
import { getMaterial, getCustomMaterial, PALETTE } from "../materials/materialLibrary";

// Deterministic seeded RNG (mulberry32)
function createRNG(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MAP_SEED = 42;

interface ClutterDef {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  positions: Array<{ x: number; z: number; y?: number }>;
  scaleRange: [number, number];
  rotRange: [number, number];
  castShadow?: boolean;
}

export function spawnClutterProps(scene: THREE.Scene, seed: number = MAP_SEED): THREE.Box3[] {
  const rng = createRNG(seed);
  const colliders: THREE.Box3[] = [];

  const defs: ClutterDef[] = [
    // Traffic cones
    {
      geometry: new THREE.CylinderGeometry(0.03, 0.18, 0.65, 8),
      material: getCustomMaterial(PALETTE.accentOrange, 0.7, 0.1),
      positions: [
        { x: 30, z: -4 }, { x: 32, z: -4 }, { x: 28, z: -6 },
        { x: 38, z: 6 }, { x: -25, z: 18 }, { x: 15, z: 20 },
        { x: 42, z: -18 }, { x: 20, z: -16 },
      ],
      scaleRange: [0.95, 1.05],
      rotRange: [-0.1, 0.1],
    },
    // Oil barrels
    {
      geometry: new THREE.CylinderGeometry(0.33, 0.35, 0.95, 12),
      material: getMaterial("steelDark"),
      positions: [
        { x: -19, z: 5 }, { x: -18, z: 5 }, { x: 10, z: 15 },
        { x: 38, z: -22 }, { x: -15, z: -12 }, { x: 5, z: 13 },
      ],
      scaleRange: [0.95, 1.05],
      rotRange: [0, Math.PI * 2],
      castShadow: true,
    },
    // Tires
    {
      geometry: new THREE.TorusGeometry(0.3, 0.1, 8, 12),
      material: getCustomMaterial(0x1a1a1a, 0.92, 0),
      positions: [
        { x: 28, z: -6 }, { x: 28.5, z: -5.5 }, { x: 35, z: 8 },
        { x: -20, z: 12 }, { x: 45, z: -10 },
      ],
      scaleRange: [0.9, 1.1],
      rotRange: [0, 0.3],
    },
    // Wooden pallets
    {
      geometry: new THREE.BoxGeometry(1.2, 0.12, 1.0),
      material: getMaterial("woodOld"),
      positions: [
        { x: -5, z: -14 }, { x: 12, z: 10 }, { x: 4, z: -2 },
        { x: -12, z: 8 }, { x: 18, z: -8 }, { x: 0, z: 16 },
        { x: 35, z: -5 }, { x: -8, z: -5 },
      ],
      scaleRange: [0.9, 1.1],
      rotRange: [0, Math.PI],
    },
    // Cement bags
    {
      geometry: new THREE.BoxGeometry(0.6, 0.25, 0.4),
      material: getMaterial("cement"),
      positions: [
        { x: -30, z: -18 }, { x: -29, z: -18 }, { x: -29.5, z: -18, y: 0.38 },
        { x: -32, z: -15 }, { x: 42, z: 5 },
      ],
      scaleRange: [0.95, 1.05],
      rotRange: [-0.15, 0.15],
    },
    // Trash bags
    {
      geometry: new THREE.SphereGeometry(0.35, 8, 6),
      material: getCustomMaterial(0x1a1a1a, 0.95, 0),
      positions: [
        { x: -8, z: 14 }, { x: -7.5, z: 14.4 }, { x: 42, z: -5 },
        { x: 18, z: 16 }, { x: -15, z: 20 },
      ],
      scaleRange: [0.7, 1.2],
      rotRange: [0, Math.PI * 2],
    },
    // Rope coils
    {
      geometry: new THREE.CylinderGeometry(0.25, 0.25, 0.15, 12),
      material: getMaterial("rope"),
      positions: [
        { x: 5, z: 36 }, { x: 30, z: 36 }, { x: -10, z: 34 },
      ],
      scaleRange: [0.9, 1.1],
      rotRange: [0, Math.PI * 2],
    },
    // Warning signs (flat planes)
    {
      geometry: new THREE.BoxGeometry(0.6, 0.6, 0.04),
      material: getCustomMaterial(PALETTE.accentYellow, 0.7, 0.1),
      positions: [
        { x: 21, z: 17.2, y: 2.5 }, { x: -20.5, z: -16, y: 1.5 },
        { x: 35, z: 0.5, y: 2.0 },
      ],
      scaleRange: [1.0, 1.0],
      rotRange: [0, 0],
    },
  ];

  for (const def of defs) {
    if (def.positions.length > 4) {
      const instMesh = new THREE.InstancedMesh(def.geometry, def.material, def.positions.length);
      instMesh.castShadow = def.castShadow ?? false;
      instMesh.receiveShadow = true;

      const dummy = new THREE.Object3D();
      for (let i = 0; i < def.positions.length; i++) {
        const p = def.positions[i];
        const scale = def.scaleRange[0] + rng() * (def.scaleRange[1] - def.scaleRange[0]);
        const rot = def.rotRange[0] + rng() * (def.rotRange[1] - def.rotRange[0]);
        dummy.position.set(p.x, (p.y ?? 0) + 0.3, p.z);
        dummy.rotation.set(0, rot, 0);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        instMesh.setMatrixAt(i, dummy.matrix);
      }
      scene.add(instMesh);
    } else {
      for (const p of def.positions) {
        const scale = def.scaleRange[0] + rng() * (def.scaleRange[1] - def.scaleRange[0]);
        const rot = def.rotRange[0] + rng() * (def.rotRange[1] - def.rotRange[0]);
        const mesh = new THREE.Mesh(def.geometry, def.material);
        mesh.position.set(p.x, (p.y ?? 0) + 0.3, p.z);
        mesh.rotation.y = rot;
        mesh.scale.setScalar(scale);
        mesh.castShadow = def.castShadow ?? false;
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }
  }

  // Oil stain decals
  const stainMat = new THREE.MeshStandardMaterial({ color: 0x333830, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.3 });
  const stainPositions = [[0, 5], [-10, -3], [8, -10], [15, 2], [-5, 12], [12, 18], [-3, 0], [35, -10], [40, -18]];
  for (const [sx, sz] of stainPositions) {
    const r = 0.5 + rng() * 0.8;
    const stain = new THREE.Mesh(new THREE.CircleGeometry(r, 10), stainMat);
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(sx, 0.13, sz);
    scene.add(stain);
  }

  // Puddles
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x556688, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.45 });
  const puddlePositions = [[-8, 8], [5, -12], [35, -20], [20, 30]];
  for (const [px, pz] of puddlePositions) {
    const r = 0.6 + rng() * 0.8;
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(r, 12), puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(px, 0.14, pz);
    scene.add(puddle);
  }

  // Grass tufts (outside warehouse)
  const grassMat = getCustomMaterial(0x5a8a32, 0.95, 0);
  const grassGeo = new THREE.ConeGeometry(0.12, 0.25, 4);
  for (let i = 0; i < 40; i++) {
    const gx = (rng() - 0.5) * 120;
    const gz = (rng() - 0.5) * 100;
    if (Math.abs(gx) < 25 && Math.abs(gz) < 20) continue;
    const tuft = new THREE.Mesh(grassGeo, grassMat);
    tuft.position.set(gx, 0.12, gz);
    tuft.rotation.y = rng() * Math.PI;
    tuft.scale.setScalar(0.8 + rng() * 0.5);
    scene.add(tuft);
  }

  return colliders;
}
