import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { prepareMapAsset } from "../src/game/world/assets/MapAssetLoader";

/** Exercise the shipped geometry/node transforms in Node without a DOM image decoder. */
async function geometryScene(filename: string): Promise<THREE.Group> {
  const bytes = readFileSync(path.resolve(__dirname, "../public/assets/maps/harbor-v2/zones", filename));
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  // Keep distinct material slots, but remove only image references. Geometry,
  // indices, UVs, vertex colors, transforms and Blender extras remain original.
  json.materials = (json.materials ?? []).map(() => ({}));
  json.images = [];
  json.textures = [];
  const encoded = Buffer.from(JSON.stringify(json));
  const paddedLength = Math.ceil(encoded.length / 4) * 4;
  const bin = bytes.subarray(20 + jsonLength);
  const output = Buffer.alloc(20 + paddedLength + bin.length, 0x20);
  bytes.copy(output, 0, 0, 12);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(output, 20);
  bin.copy(output, 20 + paddedLength);
  const arrayBuffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
  return (await new GLTFLoader().parseAsync(arrayBuffer, "")).scene;
}

describe("Shipped Harbor instancing integrity", () => {
  it("keeps visible low-tier treads at every exterior warehouse stair collider", async () => {
    const root = await geometryScene("../warehouse.glb");
    root.updateMatrixWorld(true);
    const steps: { name: string; bounds: THREE.Box3 }[] = [];
    root.traverse((object) => {
      if (object.name.startsWith("COL_MOVE_EXT_STAIR_")) {
        steps.push({ name: object.name, bounds: new THREE.Box3().setFromObject(object) });
      }
    });
    expect(steps).toHaveLength(44);
    prepareMapAsset(root, "low");
    root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    ray.far = 0.12;
    for (const { name, bounds } of steps) {
      const center = bounds.getCenter(new THREE.Vector3());
      for (const fraction of [-0.3, 0, 0.3]) {
        const x = center.x + (bounds.max.x - bounds.min.x) * fraction;
        // The broad roof landing overlaps the last, higher tread. Probe the
        // highest authored walkable surface, not through that valid overlap.
        const top = Math.max(...steps.filter(({ bounds: other }) => (
          x >= other.min.x && x <= other.max.x
          && center.z >= other.min.z && center.z <= other.max.z
        )).map(({ bounds: other }) => other.max.y));
        ray.set(new THREE.Vector3(
          x,
          top + 0.06,
          center.z,
        ), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(root, true)[0];
        expect(hit, `${name}: invisible low-tier step at width fraction ${fraction}`).toBeDefined();
        expect(hit.point.y).toBeCloseTo(top, 2);
      }
    }
  });

  it("retains all authored fenders, cleat horns and coils at their original world positions", async () => {
    const root = await geometryScene("ferris-harbor.glb");
    const keys = ["fh-fender", "fh-cleat-horn", "fh-rope-coil"];
    const before = new Map<string, THREE.Vector3[]>();
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !keys.includes(object.userData.instanceKey)) return;
      const centers = before.get(object.userData.instanceKey) ?? [];
      centers.push(new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()));
      before.set(object.userData.instanceKey, centers);
    });
    expect(before.get("fh-fender")).toHaveLength(13);
    prepareMapAsset(root);
    root.updateMatrixWorld(true);
    const after = new Map<string, THREE.Vector3[]>();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !keys.includes(object.userData.instanceKey)) return;
      const centers = after.get(object.userData.instanceKey) ?? [];
      object.geometry.computeBoundingBox();
      if (object instanceof THREE.InstancedMesh) {
        for (let i = 0; i < object.count; i++) {
          const matrix = new THREE.Matrix4();
          object.getMatrixAt(i, matrix);
          matrix.premultiply(object.matrixWorld);
          centers.push(object.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(matrix));
        }
      } else {
        // Variant batches retain every original position attribute instead of
        // replacing it with the first mesh. Verify the full authored vertex
        // extents below; their one batch has no individual instance centres.
        const original = before.get(object.userData.instanceKey)!;
        const positions = object.geometry.getAttribute("position");
        const world = new THREE.Vector3();
        for (const point of original) {
          let found = false;
          for (let i = 0; i < positions.count && !found; i++) {
            world.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
            // Each fixture is under 1.2 m across. Different fixtures of these
            // families are several metres apart; an overlapped first copy
            // cannot satisfy the remaining authored locations.
            found = world.distanceTo(point) < 0.65;
          }
          if (found) centers.push(point.clone());
        }
      }
      after.set(object.userData.instanceKey, centers);
    });
    for (const key of keys) {
      expect(after.get(key)?.length, key).toBe(before.get(key)?.length);
      for (const point of before.get(key)!) {
        expect(after.get(key)!.some((candidate) => point.distanceTo(candidate) < 0.001), `${key} missing at ${point.toArray().join(",")}`).toBe(true);
      }
    }
  });

  it("keeps the exporter shadow budget on the actual operations scene", async () => {
    const root = await geometryScene("operations-ab.glb");
    prepareMapAsset(root);
    let shadowless = 0;
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.castShadow !== false) return;
      shadowless++;
      expect(object.castShadow, object.name).toBe(false);
    });
    expect(shadowless).toBeGreaterThanOrEqual(10);
  });
});
