import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { describe, expect, it } from "vitest";
import { prepareMapAsset } from "../src/game/world/assets/MapAssetLoader";
import { HARBOR_ZONE_ASSETS } from "../src/game/world/zones/harborZones";

async function cinematicGeometry() {
  const source = process.env.HARBOR_SURFACE_GLB ?? path.resolve(__dirname, "../public/assets/maps/harbor-v2/cinematic/harbor-cinematic.glb");
  const bytes = readFileSync(source);
  const size = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + size).toString()) as {
    materials?: { name?: string }[]; images: unknown[]; textures: unknown[];
  };
  json.materials = (json.materials ?? []).map((m: { name?: string }) => ({ name: m.name }));
  json.images = []; json.textures = [];
  const encoded = Buffer.from(JSON.stringify(json));
  const aligned = Math.ceil(encoded.length / 4) * 4;
  const bin = bytes.subarray(20 + size);
  const output = Buffer.alloc(20 + aligned + bin.length, 0x20);
  bytes.copy(output, 0, 0, 12);
  output.writeUInt32LE(output.length, 8); output.writeUInt32LE(aligned, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(output, 20); bin.copy(output, 20 + aligned);
  const scene = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength), "")).scene;
  scene.updateMatrixWorld(true);
  return scene;
}

describe("native island surface scale", () => {
  it("removes the retired Low house floor at 4.75m without carving exterior timber", async () => {
    const scene = await cinematicGeometry();
    const wood = scene.getObjectByName("harbor_MESH_wood_LOD1") as THREE.Mesh;
    const ray = new THREE.Raycaster(new THREE.Vector3(-35, 4.95, 23), new THREE.Vector3(0, -1, 0), 0, .3);
    // The legacy batch really contains this floor. The replacement native house
    // draws the procedural 5.55m floor, so keeping both creates an invisible step.
    expect(ray.intersectObject(wood)).not.toHaveLength(0);
    prepareMapAsset(scene, "low", { zoneOverrides: HARBOR_ZONE_ASSETS.map(zone => zone.override) });
    scene.updateMatrixWorld(true);
    expect(ray.intersectObject(scene, true).filter(hit => hit.object.name === wood.name)).toHaveLength(0);
    expect(wood.parent).not.toBeNull();
    const bounds = new THREE.Box3().setFromObject(wood);
    expect(bounds.max.x).toBeGreaterThan(0); // shared piers outside the residence survive
  });

  it.each(["base_MESH_asphalt_LOD0", "harbor_MESH_asphalt_LOD1"])("%s uses metres, not stretched whole-island UV islands", async (name) => {
    const scene = await cinematicGeometry();
    const mesh = scene.getObjectByName(name) as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    const index = geometry.getIndex();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ua = new THREE.Vector2(), ub = new THREE.Vector2();
    let checked = 0;
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      const ai = index ? index.getX(i) : i;
      const bi = index ? index.getX(i + 1) : i + 1;
      const ci = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(position, ai).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, bi).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, ci).applyMatrix4(mesh.matrixWorld);
      if (Math.abs(a.y - b.y) > .001 || Math.abs(a.y - c.y) > .001 || a.distanceTo(b) < .1) continue;
      // Vector2's typings exclude interleaved attributes; both expose getX/Y.
      ua.set(uv.getX(ai), uv.getY(ai)); ub.set(uv.getX(bi), uv.getY(bi));
      expect(ua.distanceTo(ub) / a.distanceTo(b), `UV density at ${a.toArray().join(",")}`).toBeCloseTo(1 / 3, 3);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(8);
    expect(mesh.userData.surfaceTileMeters).toBe(3);
  });
});
