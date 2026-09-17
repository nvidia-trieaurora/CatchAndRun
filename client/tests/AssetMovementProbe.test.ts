import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createMovementProbe, prepareMovementGeometry, visibleSurface, type MovementRole } from "./helpers/assetMovementProbe";

function planeAt(z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
  mesh.position.z = z;
  return mesh;
}

const lookForward = (root: THREE.Object3D) => visibleSurface(root, [0, 0, 0], [0, 0, -1], 5);

describe("asset movement geometric oracle", () => {
  it("skips a hidden mesh before the nearest visible surface", () => {
    const scene = new THREE.Scene();
    const hidden = planeAt(-1);
    hidden.visible = false;
    scene.add(hidden, planeAt(-3), planeAt(-4));
    scene.updateMatrixWorld(true);
    expect(lookForward(scene)?.z).toBeCloseTo(-3, 6);
  });

  it("skips a visible mesh inside a hidden ancestor before the visible surface", () => {
    const scene = new THREE.Scene(), hiddenParent = new THREE.Group(), visibleParent = new THREE.Group();
    hiddenParent.visible = false;
    visibleParent.add(planeAt(-1));
    hiddenParent.add(visibleParent);
    scene.add(hiddenParent, planeAt(-3));
    scene.updateMatrixWorld(true);
    expect(lookForward(scene)?.z).toBeCloseTo(-3, 6);
  });

  it("checks ancestors above the queried subtree, not just the raycast root", () => {
    const hiddenParent = new THREE.Group(), queriedRoot = new THREE.Group();
    hiddenParent.visible = false;
    queriedRoot.add(planeAt(-1));
    hiddenParent.add(queriedRoot);
    hiddenParent.updateMatrixWorld(true);
    expect(lookForward(queriedRoot)).toBeUndefined();
  });

  it("reports no surface for a genuinely clear ray", () => {
    expect(lookForward(new THREE.Scene())).toBeUndefined();
  });

  it("skips a mesh whose material is invisible", () => {
    const scene = new THREE.Scene(), hidden = planeAt(-1);
    (hidden.material as THREE.Material).visible = false;
    scene.add(hidden, planeAt(-3));
    scene.updateMatrixWorld(true);
    expect(lookForward(scene)?.z).toBeCloseTo(-3, 6);
  });

  it("skips a zero-opacity transparent material", () => {
    const scene = new THREE.Scene(), hidden = planeAt(-1);
    const material = hidden.material as THREE.Material;
    material.transparent = true; material.opacity = 0;
    scene.add(hidden, planeAt(-3));
    scene.updateMatrixWorld(true);
    expect(lookForward(scene)?.z).toBeCloseTo(-3, 6);
  });

  it("uses the actual intersected face material in a grouped material array", () => {
    const scene = new THREE.Scene();
    const materials = Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial());
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, .2), materials);
    box.position.z = -1;
    scene.add(box, planeAt(-3));
    scene.updateMatrixWorld(true);
    // +Z face uses slot4. An invisible unused slot0 must not hide this face.
    materials[0].visible = false;
    expect(lookForward(scene)?.z).toBeCloseTo(-.9, 6);
    materials[4].visible = false;
    expect(lookForward(scene)?.z).toBeCloseTo(-3, 6);
  });

  it("keeps FrontSide triangle winding and does not invent a visible backface", () => {
    const plane = planeAt(-1);
    plane.updateMatrixWorld(true);
    expect(lookForward(plane)?.z).toBeCloseTo(-1, 6);
    expect(visibleSurface(plane, [0, 0, -2], [0, 0, 1], 2)).toBeUndefined();
    (plane.material as THREE.Material).side = THREE.DoubleSide;
    expect(visibleSurface(plane, [0, 0, -2], [0, 0, 1], 2)?.z).toBeCloseTo(-1, 6);
  });
});

/** Minimal real binary glTF with a +Z triangle; the loader still parses GLB bytes. */
function materialGlb(material: Record<string, unknown>): Buffer {
  const vertices = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]);
  const bin = Buffer.from(vertices.buffer);
  const json = Buffer.from(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [0, 0, -1] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteLength: bin.length }], buffers: [{ byteLength: bin.length }],
    materials: [material],
  }));
  const padded = Math.ceil(json.length / 4) * 4;
  const result = Buffer.alloc(28 + padded + bin.length, 0x20);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded, 12); result.writeUInt32LE(0x4e4f534a, 16); json.copy(result, 20);
  result.writeUInt32LE(bin.length, 20 + padded); result.writeUInt32LE(0x004e4942, 24 + padded);
  bin.copy(result, 28 + padded);
  return result;
}

describe("geometry-only GLB material fidelity", () => {
  it("preserves BLEND alpha, doubleSided and base color while stripping textures", async () => {
    const result = await prepareMovementGeometry(materialGlb({
      name: "hidden-test", alphaMode: "BLEND", doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: [.2, .4, .6, 0], baseColorTexture: { index: 0 } },
    }), "high");
    const mesh = result.root.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.name).toBe("hidden-test");
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0);
    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.color.toArray()).toEqual([.2, .4, .6]);
    expect(material.map).toBeNull();
    expect(lookForward(result.root)).toBeUndefined();
  });

  it("preserves MASK cutoff and single-sided geometry", async () => {
    const result = await prepareMovementGeometry(materialGlb({
      alphaMode: "MASK", alphaCutoff: .7,
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, .2] },
    }), "low");
    const mesh = result.root.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.alphaTest).toBe(.7);
    expect(material.opacity).toBe(.2);
    expect(material.side).toBe(THREE.FrontSide);
    expect(lookForward(result.root)).toBeUndefined();
  });
});

describe("deterministic real-controller movement probes", () => {
  it.each<MovementRole>(["hunter", "prop"])("%s keeps zero yaw with no mouse input and right means positive X", (role) => {
    const probe = createMovementProbe(role, [0, 0, 0], { right: true });
    expect(probe.controller.getRotation().x).toBeCloseTo(0, 8);
    expect(probe.controller.getRotation().y).toBeCloseTo(0, 8);
    for (let frame = 0; frame < 20; frame++) probe.controller.update(1 / 60, []);
    expect(probe.controller.getRotation().x).toBeCloseTo(0, 8);
    expect(probe.controller.getRotation().y).toBeCloseTo(0, 8);
    expect(probe.sample().x).toBeGreaterThan(1);
    expect(probe.sample().z).toBeCloseTo(0, 8);
  });
});
