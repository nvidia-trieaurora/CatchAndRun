import * as THREE from "three";
import type { QualityTier } from "../../../config/QualityManager";

/** Exterior faces of the actual island seawalls; Ferris facing adds 9cm south. */
export const HARBOR_SHORELINE = Object.freeze({
  minX: -55.4,
  maxX: 63.4,
  minZ: -43.4,
  maxZ: 47.5,
});
export const HARBOR_OCEAN_ORIGIN = Object.freeze({ x: 4, z: 2 });

/** Same indexed grid budget as before, with sub-metre cells near the quays. */
export function createCoastalWaterGeometry(quality: QualityTier): THREE.PlaneGeometry {
  const counts = quality === "high" ? [12, 14, 14, 16]
    : quality === "medium" ? [8, 9, 10, 10] : [4, 4, 5, 6];
  const farCount = counts[0] / 2;
  const subdivisions = [farCount, farCount, ...counts.slice(1), counts[2], counts[1], farCount, farCount];
  const segments = subdivisions.reduce((sum, count) => sum + count, 0);
  const axis = (extent: number, minimum: number, maximum: number) => {
    // Keep offshore tessellation near the playable shore, then stretch only
    // the outermost ring beyond fog instead of exposing a 300m "water card".
    const knots = [-extent, -180, minimum - 16, minimum - 3, minimum + 1,
      maximum - 1, maximum + 3, maximum + 16, 180, extent];
    const samples = [knots[0]];
    for (let band = 0; band < subdivisions.length; band++) {
      for (let i = 1; i <= subdivisions[band]; i++) {
        samples.push(THREE.MathUtils.lerp(knots[band], knots[band + 1], i / subdivisions[band]));
      }
    }
    return samples;
  };
  const xs = axis(1600, HARBOR_SHORELINE.minX - HARBOR_OCEAN_ORIGIN.x,
    HARBOR_SHORELINE.maxX - HARBOR_OCEAN_ORIGIN.x);
  const zs = axis(1600, HARBOR_SHORELINE.minZ - HARBOR_OCEAN_ORIGIN.z,
    HARBOR_SHORELINE.maxZ - HARBOR_OCEAN_ORIGIN.z);
  const geometry = new THREE.PlaneGeometry(3200, 3200, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    positions.setXYZ(i, xs[i % (segments + 1)], 0, zs[Math.floor(i / (segments + 1))]);
  }
  positions.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.boundingBox?.expandByScalar(4);
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius += 4;
  return geometry;
}

/** One small draw for all four wall-water contacts, 1.5cm outside the real faces. */
export function createShoreWashGeometry(): THREE.BufferGeometry {
  const { minX, maxX, minZ, maxZ } = HARBOR_SHORELINE;
  const faces = [
    [minX, minZ - .015, maxX, minZ - .015],
    [maxX, maxZ + .015, minX, maxZ + .015],
    [minX - .015, maxZ, minX - .015, minZ],
    [maxX + .015, minZ, maxX + .015, maxZ],
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const [x0, z0, x1, z1] of faces) {
    const start = positions.length / 3;
    for (const [x, y, z] of [[x0, -.85, z0], [x1, -.85, z1], [x1, .85, z1], [x0, .85, z0]]) {
      positions.push(x - HARBOR_OCEAN_ORIGIN.x, y, z - HARBOR_OCEAN_ORIGIN.z);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
