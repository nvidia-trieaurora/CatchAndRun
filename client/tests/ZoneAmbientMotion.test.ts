import * as THREE from "three";
import type { Renderer } from "three/webgpu";
import { describe, expect, it } from "vitest";
import { prepareMapAsset } from "../src/game/world/assets/MapAssetLoader";
import {
  BEACON_IDLE,
  BEACON_PERIOD,
  STATUS_PULSE_MIN,
  STATUS_PULSE_PERIOD,
  ZoneAmbientMotion,
  emissiveEnvelope,
  isMotionKind,
} from "../src/game/world/zones/ZoneAmbientMotion";

/** Renderer stub whose node library hands back a fake node material (TSL graphs are built, never compiled). */
function fakeRenderer(): Renderer {
  const library = {
    fromMaterial(material: THREE.Material) {
      const node = material.clone() as THREE.Material & { positionNode: unknown; normalNode: unknown };
      node.positionNode = null;
      node.normalNode = null;
      return node;
    },
  };
  return { library } as unknown as Renderer;
}

function tagged(name: string, kind: string, extra: Record<string, unknown> = {}, material = new THREE.MeshStandardMaterial()): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), material);
  mesh.name = name;
  mesh.userData = { ambientMotion: kind, ...extra };
  return mesh;
}

function advance(motion: ZoneAmbientMotion, seconds: number) {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i++) motion.update(0.05);
}

describe("ZoneAmbientMotion (AB kinds)", () => {
  it("shares node materials only within the same motion kind, retaining static palette users", () => {
    const root = new THREE.Group();
    const palette = new THREE.MeshStandardMaterial();
    const cable = tagged("cable", "davit-sway", {}, palette);
    const reeds = tagged("reeds", "sway-reed", {}, palette);
    const reeds2 = tagged("reeds2", "sway-reed", {}, palette);
    const staticMesh = new THREE.Mesh(new THREE.BoxGeometry(), palette);
    root.add(cable, reeds, reeds2, staticMesh);
    const motion = new ZoneAmbientMotion([root], fakeRenderer(), true);
    expect(motion.getStats().convertedMaterials).toBe(2);
    expect(cable.material).not.toBe(reeds.material);
    expect(reeds2.material).toBe(reeds.material);
    expect(staticMesh.material).toBe(palette);
  });
  it("recognises the new kinds and keeps the legacy ones", () => {
    for (const kind of ["spin", "status-pulse", "beacon-flash", "davit-sway", "sway-reed", "lamp-flicker", "hang-sway", "pond-ripple"]) {
      expect(isMotionKind(kind), kind).toBe(true);
    }
    expect(isMotionKind("boat-workboat")).toBe(false);
    expect(isMotionKind(undefined)).toBe(false);
  });

  it("drives deterministic emissive envelopes: restrained cyan pulse, sharp beacon flash, subtle lamp flicker", () => {
    for (let t = 0; t < 20; t += 0.037) {
      const pulse = emissiveEnvelope("status-pulse", t, 1.2);
      expect(pulse).toBeGreaterThanOrEqual(STATUS_PULSE_MIN - 1e-9);
      expect(pulse).toBeLessThanOrEqual(1 + 1e-9);
      const flicker = emissiveEnvelope("lamp-flicker", t, 0.4);
      expect(Math.abs(flicker - 1)).toBeLessThanOrEqual(0.04);
      const beacon = emissiveEnvelope("beacon-flash", t, 0);
      expect(beacon).toBeGreaterThanOrEqual(BEACON_IDLE - 1e-9);
      expect(beacon).toBeLessThanOrEqual(1 + 1e-9);
    }
    // same inputs -> same output (seeded by name hash, no randomness)
    expect(emissiveEnvelope("status-pulse", 3.3, 0.7)).toBe(emissiveEnvelope("status-pulse", 3.3, 0.7));
    expect(emissiveEnvelope("status-pulse", 0, 0)).toBeCloseTo((STATUS_PULSE_MIN + 1) / 2, 9);
    expect(emissiveEnvelope("status-pulse", STATUS_PULSE_PERIOD / 4, 0)).toBeCloseTo(1, 9);
    // the beacon peaks at the start of every period and idles for most of it
    expect(emissiveEnvelope("beacon-flash", 0, 0)).toBeCloseTo(1, 9);
    expect(emissiveEnvelope("beacon-flash", BEACON_PERIOD, 0)).toBeCloseTo(1, 9);
    expect(emissiveEnvelope("beacon-flash", BEACON_PERIOD * 0.5, 0)).toBeCloseTo(BEACON_IDLE, 9);
  });

  it("isolates pulsing emissives from the shared palette material and never modulates untagged batches", () => {
    const palette = new THREE.MeshStandardMaterial({ emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 3 });
    const status = tagged("MESH_OPERATIONS_AB_AB_STATUS_STATUS_PULSE_LOD0", "status-pulse", {}, palette);
    const beacon = tagged("MESH_OPERATIONS_AB_AB_BEACON_BEACON_FLASH_LOD0", "beacon-flash", {}, palette);
    const lamps = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), palette);
    lamps.name = "MESH_OPERATIONS_AB_AB_LIGHT_LOD0";
    const root = new THREE.Group();
    root.add(status, beacon, lamps);

    const motion = new ZoneAmbientMotion([root], fakeRenderer(), true);
    expect(motion.getStats().emissiveMaterials).toBe(2);
    expect(status.material).not.toBe(palette);
    expect(beacon.material).not.toBe(palette);
    expect(status.material).not.toBe(beacon.material);
    expect(lamps.material).toBe(palette);

    let minStatus = Infinity;
    let maxStatus = -Infinity;
    let minBeacon = Infinity;
    for (let i = 0; i < 120; i++) {
      motion.update(0.05);
      const s = (status.material as THREE.MeshStandardMaterial).emissiveIntensity;
      minStatus = Math.min(minStatus, s);
      maxStatus = Math.max(maxStatus, s);
      minBeacon = Math.min(minBeacon, (beacon.material as THREE.MeshStandardMaterial).emissiveIntensity);
      expect(palette.emissiveIntensity).toBe(3);
    }
    expect(minStatus).toBeGreaterThanOrEqual(3 * STATUS_PULSE_MIN - 1e-6);
    expect(minStatus).toBeLessThan(3 * 0.7);
    expect(maxStatus).toBeGreaterThan(3 * 0.9);
    expect(maxStatus).toBeLessThanOrEqual(3 + 1e-6);
    expect(minBeacon).toBeCloseTo(3 * BEACON_IDLE, 3);
  });

  it("spins rotor meshes about their tagged axis at spinRpm with clamped dt and no drift of the hub", () => {
    const rotor = tagged("MESH_OPERATIONS_AB_INST_AB_ROTOR_Y4_0_LOD0", "spin", { spinAxis: "y", spinRpm: 15 });
    rotor.position.set(4, 7.5, -36);
    const fan = tagged("MESH_OPERATIONS_AB_INST_AB_ROTOR_Z5_0_LOD0", "spin", { spinAxis: "z" });   // default 18 rpm
    fan.position.set(9.3, 5, -33);
    const root = new THREE.Group();
    root.add(rotor, fan);

    const motion = new ZoneAmbientMotion([root], fakeRenderer(), true);
    expect(motion.getStats().spinners).toBe(2);
    motion.update(0);
    const q0 = rotor.quaternion.clone();
    const f0 = fan.quaternion.clone();
    // one huge frame is clamped to 50 ms; twenty of them make one second
    motion.update(5);
    expect(rotor.quaternion.angleTo(q0)).toBeCloseTo((15 / 60) * Math.PI * 2 * 0.05, 6);
    advance(motion, 0.95);
    expect(rotor.quaternion.angleTo(q0)).toBeCloseTo((15 / 60) * Math.PI * 2, 6);       // quarter turn
    expect(fan.quaternion.angleTo(f0)).toBeCloseTo((18 / 60) * Math.PI * 2, 6);         // 108 degrees
    expect(rotor.position.toArray()).toEqual([4, 7.5, -36]);
    // the rotation happened about the tagged axes
    const rotorAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(rotor.quaternion);
    expect(rotorAxis.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-9);
    const fanAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(fan.quaternion);
    expect(fanAxis.distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-9);
  });

  it("keeps ambient extras on collapsed InstancedMesh batches and spins every instance in its own frame", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const geometry = new THREE.BoxGeometry(0.8, 0.04, 0.8);
    const positions: [number, number, number][] = [[-7.7, 7.6, -37.2], [3.0, 7.6, -31.0], [8.0, 7.6, -40.0]];
    for (const [i, position] of positions.entries()) {
      const blade = new THREE.Mesh(geometry, material);
      blade.name = `MESH_OPERATIONS_AB_INST_AB_ROTOR_Y4_${i}_LOD0`;
      blade.userData = { instanceKey: "ab-rotor-y4", ambientMotion: "spin", spinAxis: "y", spinRpm: 30, ignoreWeaponRaycast: true, harborZone: "operations-ab" };
      blade.position.set(...position);
      root.add(blade);
    }
    const asset = prepareMapAsset(root, "high");
    const instances = asset.root.getObjectByName("INSTANCE_ab-rotor-y4");
    expect(instances).toBeInstanceOf(THREE.InstancedMesh);
    expect(instances?.userData.ambientMotion).toBe("spin");
    expect(instances?.userData.ignoreWeaponRaycast).toBe(true);
    expect(instances?.userData.spinRpm).toBe(30);

    const motion = new ZoneAmbientMotion([asset.root], fakeRenderer(), true);
    expect(motion.getStats().spinners).toBe(1);
    const batch = instances as THREE.InstancedMesh;
    motion.update(0);       // seeded phase applied
    const before = positions.map((_, i) => { const m = new THREE.Matrix4(); batch.getMatrixAt(i, m); return m; });
    advance(motion, 0.5);   // 30 rpm -> a quarter turn in half a second
    for (const [i, base] of before.entries()) {
      const now = new THREE.Matrix4();
      batch.getMatrixAt(i, now);
      const translation = new THREE.Vector3().setFromMatrixPosition(now);
      expect(translation.distanceTo(new THREE.Vector3(...positions[i]))).toBeLessThan(1e-5);   // float32 instance matrices
      const local = base.clone().invert().multiply(now);          // B^-1 · M = R (rotation in the instance frame)
      const rotation = new THREE.Quaternion().setFromRotationMatrix(local);
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
      expect(axis.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-6);
      expect(new THREE.Quaternion().angleTo(rotation)).toBeCloseTo(Math.PI / 2, 5);
    }
    expect(batch.instanceMatrix.needsUpdate || batch.instanceMatrix.version > 0).toBe(true);
  });

  it("does nothing when disabled (low tier) and leaves materials untouched", () => {
    const palette = new THREE.MeshStandardMaterial({ emissiveIntensity: 2 });
    const status = tagged("status", "status-pulse", {}, palette);
    const rotor = tagged("rotor", "spin", { spinAxis: "y" });
    const root = new THREE.Group();
    root.add(status, rotor);
    const motion = new ZoneAmbientMotion([root], fakeRenderer(), false);
    advance(motion, 1);
    expect(motion.getStats()).toEqual({ convertedMaterials: 0, lampMaterials: 0, emissiveMaterials: 0, spinners: 0 });
    expect(status.material).toBe(palette);
    expect(rotor.quaternion.equals(new THREE.Quaternion())).toBe(true);
  });
});
