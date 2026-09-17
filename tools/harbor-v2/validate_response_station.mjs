/** Validate the exact native station export, its gate pivot, roof and clear lane. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { validateBytes } from "gltf-validator";
import * as THREE from "three";

const file = process.argv[2] ?? "art-source/harbor-v2/_staging/response-station/response-station-candidate.glb";
const bytes = await readFile(file);
const gltf = await validateBytes(bytes, { uri: file });
assert.equal(gltf.issues.numErrors, 0, "valid glTF");
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
assert.equal(doc.getRoot().listNodes().filter(n => n.getName().startsWith("COL_")).length, 0);
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const reports = [];
for (const lod of ["LOD0", "LOD1"]) {
  const nodes = doc.getRoot().listNodes().filter(n => n.getName().endsWith(lod));
  const staticMeshes = [];
  let triangles = 0;
  let gateMesh;
  let gateNode;
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute("POSITION").getArray();
      assert.ok(positions.every(Number.isFinite), "finite mesh coordinates");
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      if (primitive.getIndices()) geo.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray(), 1));
      triangles += (geo.index?.count ?? geo.attributes.position.count) / 3;
      const obj = new THREE.Mesh(geo, material);
      obj.name = node.getName();
      obj.matrixAutoUpdate = false;
      obj.matrix.fromArray(node.getWorldMatrix());
      obj.updateMatrixWorld(true);
      if (node.getExtras().gameplayRole === "hunterGate") {
        assert.equal(mesh.listPrimitives().length, 1, "gate remains one glTF primitive / Mesh");
        gateMesh = obj;
        gateNode = node;
      } else staticMeshes.push(obj);
    }
  }
  assert.ok(gateMesh, `${lod} has a gate`);
  const pivot = new THREE.Vector3().setFromMatrixPosition(gateMesh.matrixWorld);
  assert.ok(pivot.distanceTo(new THREE.Vector3(-35,5,0)) < 1e-5, "gate top-edge pivot");
  const gateBounds = new THREE.Box3().setFromObject(gateMesh);
  assert.ok(Math.abs(gateBounds.min.y) < 1e-5 && Math.abs(gateBounds.max.y-5) < 1e-5);
  assert.ok(Math.abs(gateBounds.min.z+7) < 1e-5 && Math.abs(gateBounds.max.z-7) < 1e-5);
  const ray = new THREE.Raycaster();
  let samples = 0;
  const cast = (origin, direction, far, meshes=staticMeshes) => {
    ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
    ray.far=far;
    return ray.intersectObjects(meshes,false);
  };
  // Finished deck must stand above the existing cinematic asphalt at y=.12.
  for (const x of [-47.5,-44.5,-41.5,-38.5]) {
    const floor=cast([x,.3,1.4],[0,-1,0],.2)[0];
    assert.ok(floor && Math.abs(floor.point.y-.14)<1e-5, "finished floor above asphalt");
    samples++;
  }
  // Closed gate blocks the entire existing 14m aperture at standing height.
  for (const z of [-6.5,-4,-2,0,2,4,6.5]) {
    assert.ok(cast([-34,1.5,z],[-1,0,0],2,[gateMesh]).length, "closed gate coverage");
    samples++;
  }
  // Full roof must be present for both fidelity levels, including edge overhangs.
  for (const x of [-49.2,-46,-42,-38,-34.8]) for(const z of [-7.2,-3,0,3,7.2]) {
    const hit=cast([x,6,z],[0,-1,0],1.2)[0];
    assert.ok(hit && hit.point.y >=5.399 && hit.point.y <=5.45, `roof ${x}/${z}`);
    samples++;
  }
  // No solid decoration may obstruct the preserved central deployment route.
  for (const z of [-2,0,2]) for(const y of [.5,1.5,3]) {
    assert.equal(cast([-48.5,y,z],[1,0,0],14).length,0, `open exit lane ${y}/${z}`);
    samples++;
  }
  // Glass and real lower/upper panels close the existing side-wall colliders.
  for (const side of [-1,1]) for(const x of [-48,-45,-42,-39,-36]) for(const y of [.5,2,4]) {
    assert.ok(cast([x,y,side*8],[0,0,-side],1.5).length, `side shell ${side}/${x}/${y}`);
    samples++;
  }
  assert.ok(nodes.length <=25);
  reports.push({lod,drawCalls:nodes.length,triangles,raySamples:samples,
    gateName:gateNode.getName(),gatePivot:pivot.toArray(),gateBounds:{min:gateBounds.min.toArray(),max:gateBounds.max.toArray()}});
  for(const mesh of [...staticMeshes,gateMesh])mesh.geometry.dispose();
}
material.dispose();
const report={passed:true,file,payloadBytes:bytes.length,validationErrors:gltf.issues.numErrors,
  validationWarnings:gltf.issues.numWarnings,warningCodes:[...new Set(gltf.issues.messages.filter(m=>m.severity===1).map(m=>m.code))],lods:reports};
await writeFile("art-source/harbor-v2/_staging/response-station/validation.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
