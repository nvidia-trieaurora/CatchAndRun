import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { prepareMapAsset } from "../src/game/world/assets/MapAssetLoader";
import { FerrisHarborRig } from "../src/game/world/zones/FerrisHarborRig";
import { MooringRopes } from "../src/game/world/zones/MooringRopes";
import { HARBOR_ZONE_ASSETS } from "../src/game/world/zones/harborZones";

const HUB = new THREE.Vector3(-10, 12, 34);
const MOUNT_R = 8.5;
const CABINS = 8;

/** Mirror of the node tree build_ferris_harbor.py exports (transforms only). */
function makeZoneRoot(): { root: THREE.Group; cabinMeshes: THREE.Mesh[] } {
  const root = new THREE.Group();
  root.name = "ferris-harbor-zone";
  const wheel = new THREE.Group();
  wheel.name = "RIG_FERRIS_HARBOR_WHEEL_ROOT";
  wheel.userData.dynamicWeaponRaycast = true;
  wheel.position.copy(HUB);
  root.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(8, 0.13, 6, 32), new THREE.MeshStandardMaterial());
  rim.name = "MESH_FERRIS_HARBOR_WHEEL_ROOT_STEEL_NAVY_WEATHERED_LOD0";
  wheel.add(rim);
  const cabinMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < CABINS; i++) {
    const a = (Math.PI * 2 * i) / CABINS;
    const mount = new THREE.Group();
    mount.name = `RIG_FERRIS_HARBOR_MOUNT_${i}`;
    mount.position.set(Math.cos(a) * MOUNT_R, Math.sin(a) * MOUNT_R, 0);
    wheel.add(mount);
    const pivot = new THREE.Group();
    pivot.name = `RIG_FERRIS_HARBOR_CABIN_${i}`;
    pivot.userData.cabinIndex = i;
    mount.add(pivot);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 1.4), new THREE.MeshStandardMaterial());
    body.name = `MESH_FERRIS_HARBOR_CABIN_${i}_PALETTE_LOD0`;
    pivot.add(body);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 }));
    glass.name = `MESH_FERRIS_HARBOR_CABIN_${i}_GLASS_CABIN_LOD0`;
    pivot.add(glass);
    cabinMeshes.push(body);
  }
  return { root, cabinMeshes };
}

describe("FerrisHarborRig", () => {
  it("finds the authored wheel and keeps the eight cabin pivots in index order", () => {
    const { root } = makeZoneRoot();
    const rig = FerrisHarborRig.fromRoots([new THREE.Group(), root]);
    expect(rig).not.toBeNull();
    expect(rig!.cabins.map((cabin) => cabin.name)).toEqual(
      Array.from({ length: CABINS }, (_, i) => `RIG_FERRIS_HARBOR_CABIN_${i}`),
    );
    expect(rig!.wheelRoot.userData.dynamicWeaponRaycast).toBe(true);
    expect(FerrisHarborRig.fromRoots([new THREE.Group()])).toBeNull();
  });

  it("puts every cabin on the gameplay collider circle and keeps it upright at any angle", () => {
    const { root, cabinMeshes } = makeZoneRoot();
    const rig = FerrisHarborRig.fromRoots([root])!;
    const world = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (const angle of [0, 0.37, 1.9, 4.2]) {
      rig.setAngle(angle);
      root.updateMatrixWorld(true);
      for (let i = 0; i < CABINS; i++) {
        const a = (Math.PI * 2 * i) / CABINS + angle;
        rig.cabinWorldPosition(i, world);
        // matches GameManager.updateFerrisWheel: cx = ferrisX + cos(a) * ferrisR, cy = hubY + sin(a) * ferrisR
        expect(world.x).toBeCloseTo(HUB.x + Math.cos(a) * MOUNT_R, 6);
        expect(world.y).toBeCloseTo(HUB.y + Math.sin(a) * MOUNT_R, 6);
        expect(world.z).toBeCloseTo(HUB.z, 6);
        cabinMeshes[i].getWorldQuaternion(quaternion);
        euler.setFromQuaternion(quaternion);
        expect(Math.abs(euler.z)).toBeLessThan(1e-6);
      }
    }
  });

  it("carries bullet marks parented to a cabin mesh along with the ride", () => {
    const { root, cabinMeshes } = makeZoneRoot();
    const rig = FerrisHarborRig.fromRoots([root])!;
    rig.setAngle(0);
    root.updateMatrixWorld(true);
    const mark = new THREE.Object3D();
    mark.position.set(0.9, 0.3, 0.7); // on the cabin's +x face
    cabinMeshes[0].add(mark);
    const before = mark.getWorldPosition(new THREE.Vector3());
    rig.setAngle(Math.PI / 2);
    root.updateMatrixWorld(true);
    const after = mark.getWorldPosition(new THREE.Vector3());
    // cabin 0 rode from the 3 o'clock to the 12 o'clock position...
    expect(after.x).toBeCloseTo(HUB.x + 0.9, 6);
    expect(after.y).toBeCloseTo(HUB.y + MOUNT_R + 0.3, 6);
    // ...and the mark kept its offset on the upright cabin
    expect(after.clone().sub(before).length()).toBeCloseTo(Math.hypot(MOUNT_R, MOUNT_R), 6);
  });

  it("registers the promoted zone with a cache token and prepares cabin glass as non depth-writing", () => {
    const zone = HARBOR_ZONE_ASSETS.find((asset) => asset.id === "ferris-harbor");
    expect(zone).toBeDefined();
    // promoted 2026-09-07: production clients load it, and the ?v token busts cached copies
    expect(zone!.promoted).toBe(true);
    expect(zone!.url).toMatch(/^\/assets\/maps\/harbor-v2\/zones\/ferris-harbor\.glb\?v=/);
    expect(zone!.override.removeZones).toEqual(["ferris-static", "boats"]);
    const { root } = makeZoneRoot();
    const asset = prepareMapAsset(root, "high");
    const glass = asset.root.getObjectByName("MESH_FERRIS_HARBOR_CABIN_0_GLASS_CABIN_LOD0") as THREE.Mesh;
    const material = glass.material as THREE.MeshStandardMaterial;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(asset.colliders).toHaveLength(0);
    // the rig nodes survive prepareMapAsset untouched
    expect(asset.root.getObjectByName("RIG_FERRIS_HARBOR_CABIN_7")).toBeDefined();
  });
});

describe("MooringRopes", () => {
  function makeHarbor(): { root: THREE.Group; boat: THREE.Object3D } {
    const root = new THREE.Group();
    const dock = new THREE.Object3D();
    dock.name = "SOCKET_FERRIS_HARBOR_MOOR_DOCK_2";
    dock.position.set(0, 1.15, 47.28);
    root.add(dock);
    const boat = new THREE.Object3D();
    boat.name = "RIG_FERRIS_HARBOR_BOAT_WORKBOAT";
    boat.userData.ambientMotion = "boat-workboat";
    boat.position.set(7, -0.8, 49.9);
    const socket = new THREE.Object3D();
    socket.name = "SOCKET_FERRIS_HARBOR_MOOR_WORKBOAT_0_BOAT";
    socket.userData.dock = "SOCKET_FERRIS_HARBOR_MOOR_DOCK_2";
    socket.position.set(-4, 0.45, -1.3);
    boat.add(socket);
    const orphan = new THREE.Object3D();
    orphan.name = "SOCKET_FERRIS_HARBOR_MOOR_WORKBOAT_1_BOAT";
    orphan.userData.dock = "SOCKET_FERRIS_HARBOR_MOOR_DOCK_99";
    boat.add(orphan);
    root.add(boat);
    root.updateMatrixWorld(true);
    return { root, boat };
  }

  it("builds one sagging tube per resolvable socket pair and follows the boat without reallocating", () => {
    const { root, boat } = makeHarbor();
    const ropes = new MooringRopes([root], false);
    expect(ropes.getRopeCount()).toBe(1);
    const mesh = ropes.group.children[0] as THREE.Mesh;
    const attribute = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    expect(attribute.count).toBe(9 * 4);
    // first ring sits at the boat socket, last ring at the cleat, middle sags below the chord
    const firstY = array[1];
    const lastY = array[(8 * 4) * 3 + 1];
    const midY = array[(4 * 4) * 3 + 1];
    expect(firstY).toBeCloseTo(-0.8 + 0.45, 1);
    expect(lastY).toBeCloseTo(1.15, 1);
    expect(midY).toBeLessThan((firstY + lastY) / 2 - 0.1);

    boat.position.y += 0.3;
    root.updateMatrixWorld(true);
    const sameArray = attribute.array;
    ropes.update();
    expect(attribute.array).toBe(sameArray); // rewritten in place
    expect(array[1]).toBeCloseTo(firstY + 0.3, 5);
    expect(mesh.userData.ignoreWeaponRaycast).toBe(true);
    ropes.dispose();
    expect(ropes.getRopeCount()).toBe(0);
  });

  it("uses a straight two-segment line on the low tier", () => {
    const { root } = makeHarbor();
    const ropes = new MooringRopes([root], true);
    const mesh = ropes.group.children[0] as THREE.Mesh;
    expect(mesh.geometry.getAttribute("position").count).toBe(3 * 4);
  });
});
