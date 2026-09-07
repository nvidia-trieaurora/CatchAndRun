import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { WEAPON_FIRE_RATE_MS, WEAPON_RELOAD_TIME_MS } from "@catch-and-run/shared";
import {
  resolveWeaponImpactKind,
  type WeaponImpactKind,
} from "../world/weaponImpactSurfaces";

type RenderMesh = THREE.Mesh;

const MAX_ACTIVE_TRACERS = 16;
const MAX_MUZZLE_FLASHES = 8;
const MAX_BULLET_HOLES = 48;
const MAX_GROUND_DEBRIS = 40;
const MAX_FOLIAGE_DEBRIS = 40;
const MAX_WATER_SPLASHES = 36;
const MAX_WATER_RIPPLES = 8;
const MUZZLE_FLASH_SECONDS = 0.06;
const IMPACT_CHUNK_THRESHOLD_TRIANGLES = 1024;
const IMPACT_CHUNK_TRIANGLES = 128;

function isRenderMesh(object: THREE.Object3D): object is RenderMesh {
  return object instanceof THREE.Mesh;
}

function isEffectivelyVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function hasDynamicWeaponTransform(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (
      current.userData.dynamicWeaponRaycast === true
      || current.userData.dynamicWeaponInstances === true
      || typeof current.userData.ambientMotion === "string"
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function rayBoxEntryDistance(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  box: THREE.Box3,
  near: number,
  far: number,
): number | null {
  let entry = near;
  let exit = far;

  for (const axis of ["x", "y", "z"] as const) {
    const axisDirection = direction[axis];
    if (Math.abs(axisDirection) < 1e-8) {
      if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) {
        return null;
      }
      continue;
    }

    let first = (box.min[axis] - origin[axis]) / axisDirection;
    let second = (box.max[axis] - origin[axis]) / axisDirection;
    if (first > second) [first, second] = [second, first];
    entry = Math.max(entry, first);
    exit = Math.min(exit, second);
    if (entry > exit) return null;
  }

  return exit >= near ? entry : null;
}

function createBulletMarkGeometry(): THREE.BufferGeometry {
  const center = new THREE.CircleGeometry(0.025, 8);
  const scorch = new THREE.RingGeometry(0.025, 0.065, 8);
  const applyVertexColor = (
    geometry: THREE.BufferGeometry,
    colorValue: THREE.ColorRepresentation,
  ) => {
    const color = new THREE.Color(colorValue);
    const colors = new Float32Array(
      geometry.getAttribute("position").count * 3,
    );
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  };
  applyVertexColor(center, 0x222222);
  applyVertexColor(scorch, 0x444433);
  const geometry = mergeGeometries([center, scorch]) as
    THREE.BufferGeometry | null;
  center.dispose();
  scorch.dispose();
  if (!geometry) throw new Error("Unable to create bullet mark geometry");
  return geometry;
}

interface BulletTracer {
  mesh: THREE.Mesh;
  trail: THREE.Mesh;
  origin: THREE.Vector3;
  target: THREE.Vector3;
  progress: number;
  speed: number;
  impactNormal: THREE.Vector3 | null;
  impactSurface: "ground" | "wall" | null;
  impactObject: THREE.Object3D | null;
  impactLocalPoint: THREE.Vector3 | null;
  impactLocalNormal: THREE.Vector3 | null;
  impactKind: WeaponImpactKind;
}

interface BulletHole {
  mesh: THREE.Mesh;
}

interface BulletImpact {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  surface: "ground" | "wall";
  object: THREE.Object3D;
  localPoint: THREE.Vector3;
  localNormal: THREE.Vector3;
  kind: WeaponImpactKind;
}

interface GroundDebris {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  age: number;
  lifetime: number;
}

interface ImpactParticle {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  age: number;
  lifetime: number;
  gravity: number;
}

interface WaterRipple {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  age: number;
  lifetime: number;
}

interface ImpactCandidate {
  mesh: RenderMesh;
  bounds: THREE.Box3;
  materials: THREE.Material[];
  dynamic: boolean;
  entryDistance: number;
  chunkSet: ImpactChunkSet | null;
}

interface ImpactChunk {
  bounds: THREE.Box3;
  start: number;
  count: number;
  entryDistance: number;
}

interface ImpactChunkSet {
  chunks: ImpactChunk[];
  drawRangeStart: number;
  drawRangeCount: number;
}

interface MuzzleFlash {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  remaining: number;
}

export class WeaponSystem {
  private scene: THREE.Scene;
  private getImpactSurfaces: () => readonly THREE.Object3D[];
  private onWaterImpact: (position: THREE.Vector3, strength: number) => void;
  private lastFireTime = 0;
  private isReloading = false;
  private reloadStartTime = 0;
  private tracers: BulletTracer[] = [];
  private tracerPool: BulletTracer[] = [];
  private bulletHoles: BulletHole[] = [];
  private bulletHolePool: BulletHole[] = [];
  private groundDebris: GroundDebris[] = [];
  private groundDebrisPool: GroundDebris[] = [];
  private foliageDebris: ImpactParticle[] = [];
  private foliageDebrisPool: ImpactParticle[] = [];
  private waterSplashes: ImpactParticle[] = [];
  private waterSplashPool: ImpactParticle[] = [];
  private waterRipples: WaterRipple[] = [];
  private waterRipplePool: WaterRipple[] = [];

  private impactCacheReady = false;
  private cachedImpactRoots: THREE.Object3D[] = [];
  private impactCandidates: ImpactCandidate[] = [];
  private impactShortlist: ImpactCandidate[] = [];
  private impactChunkShortlist: ImpactChunk[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly intersections: THREE.Intersection[] = [];
  private readonly materialSideScratch: THREE.Side[] = [];
  private readonly positionScratch = new THREE.Vector3();
  private readonly instanceMatrixScratch = new THREE.Matrix4();
  private readonly hitMatrixScratch = new THREE.Matrix4();
  private readonly inverseHitMatrixScratch = new THREE.Matrix4();
  private readonly normalMatrixScratch = new THREE.Matrix3();
  private readonly impactWorldScaleScratch = new THREE.Vector3();
  private destroyed = false;

  private tracerMat: THREE.MeshBasicMaterial;
  private trailMat: THREE.MeshBasicMaterial;
  private holeMat: THREE.MeshStandardMaterial;
  private tracerGeo: THREE.SphereGeometry;
  private trailGeo: THREE.CylinderGeometry;
  private holeGeo: THREE.BufferGeometry;
  private muzzleFlashGeo: THREE.SphereGeometry;
  private muzzleFlashMat: THREE.MeshBasicMaterial;
  private groundDebrisGeo: THREE.BoxGeometry;
  private foliageDebrisGeo: THREE.CircleGeometry;
  private waterSplashGeo: THREE.SphereGeometry;
  private waterRippleGeo: THREE.RingGeometry;
  private muzzleFlashes: MuzzleFlash[] = [];
  private nextMuzzleFlash = 0;
  private muzzleLight: THREE.PointLight;
  private muzzleLightRemaining = 0;

  constructor(
    scene: THREE.Scene,
    getImpactSurfaces: () => readonly THREE.Object3D[],
    onWaterImpact: (position: THREE.Vector3, strength: number) => void =
      () => {},
  ) {
    this.scene = scene;
    this.getImpactSurfaces = getImpactSurfaces;
    this.onWaterImpact = onWaterImpact;

    this.tracerGeo = new THREE.SphereGeometry(0.04, 4, 4);
    this.trailGeo = new THREE.CylinderGeometry(0.015, 0.008, 2, 4);
    this.trailGeo.rotateX(Math.PI / 2);
    this.holeGeo = createBulletMarkGeometry();
    this.muzzleFlashGeo = new THREE.SphereGeometry(0.08, 6, 6);
    this.groundDebrisGeo = new THREE.BoxGeometry(1, 1, 1);
    this.foliageDebrisGeo = new THREE.CircleGeometry(1, 4);
    this.waterSplashGeo = new THREE.SphereGeometry(1, 5, 4);
    this.waterRippleGeo = new THREE.RingGeometry(0.12, 0.18, 24);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0.9 });
    this.trailMat = new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.4 });
    this.holeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.75,
      metalness: 0.15,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    this.muzzleFlashMat = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.muzzleLight = new THREE.PointLight(0xffaa00, 0, 6);
    this.muzzleLight.userData.ignoreWeaponRaycast = true;
    this.scene.add(this.muzzleLight);
    this.initializeShotPools();
    this.initializeImpactPools();
  }

  private initializeShotPools() {
    for (let i = 0; i < MAX_ACTIVE_TRACERS; i++) {
      const bullet = new THREE.Mesh(this.tracerGeo, this.tracerMat);
      bullet.name = "bullet-tracer";
      bullet.userData.ignoreWeaponRaycast = true;
      bullet.visible = false;
      this.scene.add(bullet);

      const trailMaterial = this.trailMat.clone();
      const trail = new THREE.Mesh(this.trailGeo, trailMaterial);
      trail.name = "bullet-trail";
      trail.userData.ignoreWeaponRaycast = true;
      trail.visible = false;
      this.scene.add(trail);

      this.tracerPool.push({
        mesh: bullet,
        trail,
        origin: new THREE.Vector3(),
        target: new THREE.Vector3(),
        progress: 0,
        speed: 5,
        impactNormal: null,
        impactSurface: null,
        impactObject: null,
        impactLocalPoint: null,
        impactLocalNormal: null,
        impactKind: "solid",
      });
    }

    for (let i = 0; i < MAX_MUZZLE_FLASHES; i++) {
      const mesh = new THREE.Mesh(this.muzzleFlashGeo, this.muzzleFlashMat);
      mesh.name = "muzzle-flash";
      mesh.userData.ignoreWeaponRaycast = true;
      mesh.visible = false;
      this.scene.add(mesh);
      this.muzzleFlashes.push({ mesh, remaining: 0 });
    }

    for (let i = 0; i < MAX_BULLET_HOLES; i++) {
      const hole = new THREE.Mesh(this.holeGeo, this.holeMat);
      hole.name = "bullet-hole";
      hole.userData.ignoreWeaponRaycast = true;
      hole.visible = false;
      this.bulletHolePool.push({ mesh: hole });
    }
  }

  private initializeImpactPools() {
    for (let i = 0; i < MAX_GROUND_DEBRIS; i++) {
      const mesh = new THREE.Mesh(
        this.groundDebrisGeo,
        new THREE.MeshStandardMaterial({
          color: 0x5b3a22,
          roughness: 1,
          transparent: true,
        }),
      );
      mesh.visible = false;
      mesh.userData.ignoreWeaponRaycast = true;
      this.scene.add(mesh);
      this.groundDebrisPool.push({
        mesh,
        velocity: new THREE.Vector3(),
        angularVelocity: new THREE.Vector3(),
        age: 0,
        lifetime: 0,
      });
    }

    for (let i = 0; i < MAX_FOLIAGE_DEBRIS; i++) {
      const mesh = new THREE.Mesh(
        this.foliageDebrisGeo,
        new THREE.MeshBasicMaterial({
          color: 0x39752f,
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
        }),
      );
      mesh.visible = false;
      mesh.userData.ignoreWeaponRaycast = true;
      this.scene.add(mesh);
      this.foliageDebrisPool.push({
        mesh,
        velocity: new THREE.Vector3(),
        angularVelocity: new THREE.Vector3(),
        age: 0,
        lifetime: 0,
        gravity: 3.5,
      });
    }

    for (let i = 0; i < MAX_WATER_SPLASHES; i++) {
      const mesh = new THREE.Mesh(
        this.waterSplashGeo,
        new THREE.MeshBasicMaterial({
          color: 0xd6f4f1,
          transparent: true,
          depthWrite: false,
        }),
      );
      mesh.visible = false;
      mesh.userData.ignoreWeaponRaycast = true;
      this.scene.add(mesh);
      this.waterSplashPool.push({
        mesh,
        velocity: new THREE.Vector3(),
        angularVelocity: new THREE.Vector3(),
        age: 0,
        lifetime: 0,
        gravity: 5.5,
      });
    }

    for (let i = 0; i < MAX_WATER_RIPPLES; i++) {
      const mesh = new THREE.Mesh(
        this.waterRippleGeo,
        new THREE.MeshBasicMaterial({
          color: 0x9de3e2,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      mesh.visible = false;
      mesh.userData.ignoreWeaponRaycast = true;
      mesh.rotation.x = -Math.PI / 2;
      this.scene.add(mesh);
      this.waterRipplePool.push({ mesh, age: 0, lifetime: 0 });
    }
  }

  canFire(ammo: number): boolean {
    if (this.destroyed) return false;
    if (ammo <= 0) return false;
    if (this.isReloading) return false;
    return Date.now() - this.lastFireTime >= WEAPON_FIRE_RATE_MS;
  }

  fire(origin: THREE.Vector3, direction: THREE.Vector3) {
    if (this.destroyed) return;
    this.lastFireTime = Date.now();
    this.createTracer(origin, direction);
    this.createMuzzleFlash(origin);
  }

  startReload() {
    if (this.destroyed) return;
    this.isReloading = true;
    this.reloadStartTime = Date.now();
  }

  update(dt: number) {
    if (this.destroyed) return;
    if (this.isReloading && Date.now() - this.reloadStartTime >= WEAPON_RELOAD_TIME_MS) {
      this.isReloading = false;
    }

    // Animate bullet tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.progress += dt * t.speed;

      if (t.progress >= 1) {
        this.tracers.splice(i, 1);
        if (t.impactNormal) {
          if (t.impactKind === "foliage") {
            this.spawnFoliageDebris(t.target, t.impactNormal);
          } else if (t.impactKind === "water") {
            this.spawnWaterSplash(t.target);
          } else if (t.impactSurface === "ground") {
            this.spawnGroundDebris(t.target, t.impactNormal);
          } else {
            this.spawnBulletHole(
              t.target,
              t.impactNormal,
              t.impactObject,
              t.impactLocalPoint,
              t.impactLocalNormal,
            );
          }
        }
        this.releaseTracer(t);
        continue;
      }

      this.positionScratch.copy(t.origin).lerp(t.target, t.progress);
      t.mesh.position.copy(this.positionScratch);
      t.mesh.lookAt(t.target);

      // Trail stretches from origin to current position
      this.positionScratch.copy(t.origin).lerp(t.mesh.position, 0.5);
      t.trail.position.copy(this.positionScratch);
      t.trail.lookAt(t.mesh.position);
      const trailLen = t.origin.distanceTo(t.mesh.position);
      t.trail.scale.set(1, 1, Math.max(0.01, trailLen / 2));

      // Fade trail as bullet moves
      (t.trail.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - t.progress * 0.7);
    }

    this.updateMuzzleFlash(dt);
    this.updateGroundDebris(dt);
    this.updateImpactParticles(
      this.foliageDebris,
      this.foliageDebrisPool,
      dt,
    );
    this.updateImpactParticles(
      this.waterSplashes,
      this.waterSplashPool,
      dt,
    );
    this.updateWaterRipples(dt);
  }

  getIsReloading(): boolean {
    return this.isReloading;
  }

  spawnWaterImpact(position: THREE.Vector3, strength = 1) {
    if (this.destroyed) return;
    this.spawnWaterSplash(position, strength);
  }

  prepareImpactSurfaces() {
    if (this.destroyed) return;
    this.refreshImpactCache(true);
  }

  invalidateImpactSurfaces() {
    this.impactCacheReady = false;
    this.cachedImpactRoots = [];
    this.impactCandidates = [];
    this.impactShortlist.length = 0;
    this.impactChunkShortlist.length = 0;
  }

  private createTracer(origin: THREE.Vector3, direction: THREE.Vector3) {
    const range = 80;
    const normalizedDirection = direction.clone().normalize();
    const impact = this.findBulletImpact(origin, normalizedDirection, range);
    const target = impact?.point ?? origin.clone().addScaledVector(normalizedDirection, range);

    const tracer = this.tracerPool.pop() ?? this.tracers.shift();
    if (!tracer) return;
    tracer.mesh.visible = true;
    tracer.mesh.position.copy(origin);
    tracer.trail.visible = true;
    tracer.trail.position.copy(origin);
    tracer.trail.scale.set(1, 1, 0.01);
    (tracer.trail.material as THREE.MeshBasicMaterial).opacity = 0.4;
    tracer.origin.copy(origin);
    tracer.target.copy(target);
    tracer.progress = 0;
    tracer.speed = 5;
    tracer.impactNormal = impact?.normal ?? null;
    tracer.impactSurface = impact?.surface ?? null;
    tracer.impactObject = impact?.object ?? null;
    tracer.impactLocalPoint = impact?.localPoint ?? null;
    tracer.impactLocalNormal = impact?.localNormal ?? null;
    tracer.impactKind = impact?.kind ?? "solid";
    this.tracers.push(tracer);
  }

  private releaseTracer(tracer: BulletTracer) {
    tracer.mesh.visible = false;
    tracer.trail.visible = false;
    tracer.impactNormal = null;
    tracer.impactSurface = null;
    tracer.impactObject = null;
    tracer.impactLocalPoint = null;
    tracer.impactLocalNormal = null;
    tracer.impactKind = "solid";
    this.tracerPool.push(tracer);
  }

  private findBulletImpact(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    range: number,
  ): BulletImpact | null {
    this.refreshImpactCache(false);
    this.impactShortlist.length = 0;
    for (const candidate of this.impactCandidates) {
      if (!isEffectivelyVisible(candidate.mesh)) continue;
      if (candidate.dynamic) {
        candidate.mesh.updateWorldMatrix(true, false);
        this.updateImpactBounds(candidate);
      }
      const entryDistance = rayBoxEntryDistance(
        origin,
        direction,
        candidate.bounds,
        0.01,
        range,
      );
      if (entryDistance === null) continue;
      candidate.entryDistance = entryDistance;
      this.impactShortlist.push(candidate);
    }
    this.impactShortlist.sort((left, right) =>
      left.entryDistance - right.entryDistance
    );

    this.raycaster.set(origin, direction);
    this.raycaster.near = 0.01;
    this.raycaster.far = range;
    let hit: THREE.Intersection | null = null;
    for (const candidate of this.impactShortlist) {
      if (candidate.entryDistance > this.raycaster.far) break;

      this.materialSideScratch.length = candidate.materials.length;
      candidate.materials.forEach((material, index) => {
        this.materialSideScratch[index] = material.side;
        material.side = THREE.DoubleSide;
      });
      this.intersections.length = 0;
      let candidateHit: THREE.Intersection | null = null;
      try {
        candidateHit = this.raycastImpactCandidate(candidate);
      } finally {
        candidate.materials.forEach((material, index) => {
          material.side = this.materialSideScratch[index];
        });
      }

      if (candidateHit && (!hit || candidateHit.distance < hit.distance)) {
        hit = candidateHit;
        this.raycaster.far = candidateHit.distance;
      }
    }

    if (!hit) return null;

    this.hitMatrixScratch.copy(hit.object.matrixWorld);
    if (
      hit.object instanceof THREE.InstancedMesh
      && hit.instanceId !== undefined
    ) {
      hit.object.getMatrixAt(hit.instanceId, this.instanceMatrixScratch);
      this.hitMatrixScratch.multiply(this.instanceMatrixScratch);
    }
    this.inverseHitMatrixScratch.copy(this.hitMatrixScratch).invert();

    const localNormal = hit.face
      ? hit.face.normal.clone()
      : direction.clone().negate().transformDirection(
        this.inverseHitMatrixScratch,
      );
    const normal = hit.face
      ? localNormal.clone().applyMatrix3(
        this.normalMatrixScratch.getNormalMatrix(this.hitMatrixScratch),
      ).normalize()
      : direction.clone().negate();
    if (normal.dot(direction) > 0) {
      normal.negate();
      localNormal.negate();
    }

    return {
      point: hit.point.clone(),
      normal,
      surface: normal.y >= 0.65 ? "ground" : "wall",
      object: hit.object,
      localPoint: hit.point.clone().applyMatrix4(this.inverseHitMatrixScratch),
      localNormal,
      kind: resolveWeaponImpactKind(hit.object),
    };
  }

  private refreshImpactCache(force: boolean) {
    const roots = this.getImpactSurfaces();
    if (!force && this.impactCacheReady && this.sameImpactRoots(roots)) return;

    this.cachedImpactRoots = [...roots];
    this.impactCandidates = [];
    for (const root of roots) {
      root.updateWorldMatrix(true, true);
      this.collectImpactCandidates(root);
    }
    this.impactCacheReady = true;
  }

  private sameImpactRoots(roots: readonly THREE.Object3D[]): boolean {
    return roots.length === this.cachedImpactRoots.length
      && roots.every((root, index) => root === this.cachedImpactRoots[index]);
  }

  private collectImpactCandidates(object: THREE.Object3D) {
    if (object.userData.ignoreWeaponRaycast === true) return;
    if (isRenderMesh(object)) {
      const candidate: ImpactCandidate = {
        mesh: object,
        bounds: new THREE.Box3(),
        materials: Array.isArray(object.material)
          ? [...new Set(object.material)]
          : [object.material],
        dynamic: hasDynamicWeaponTransform(object),
        entryDistance: 0,
        chunkSet: null,
      };
      this.updateImpactBounds(candidate);
      candidate.chunkSet = this.createImpactChunkSet(candidate);
      if (!candidate.bounds.isEmpty()) this.impactCandidates.push(candidate);
    }

    for (const child of object.children) this.collectImpactCandidates(child);
  }

  private updateImpactBounds(candidate: ImpactCandidate) {
    const object = candidate.mesh;
    candidate.bounds.makeEmpty();
    if (object instanceof THREE.InstancedMesh) {
      if (
        object.boundingBox === null
        || object.userData.dynamicWeaponInstances === true
      ) {
        object.computeBoundingBox();
      }
      if (
        object.boundingSphere === null
        || object.userData.dynamicWeaponInstances === true
      ) {
        object.computeBoundingSphere();
      }
      if (object.boundingBox) {
        candidate.bounds.copy(object.boundingBox).applyMatrix4(object.matrixWorld);
      }
    } else {
      if (object.geometry.boundingBox === null) {
        object.geometry.computeBoundingBox();
      }
      if (object.geometry.boundingBox) {
        candidate.bounds.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
      }
      if (object.geometry.boundingSphere === null) {
        object.geometry.computeBoundingSphere();
      }
    }
    candidate.bounds.expandByScalar(0.15);
  }

  private createImpactChunkSet(
    candidate: ImpactCandidate,
  ): ImpactChunkSet | null {
    const mesh = candidate.mesh;
    const geometry = mesh.geometry;
    if (
      candidate.dynamic
      || mesh instanceof THREE.InstancedMesh
      || mesh instanceof THREE.SkinnedMesh
      || geometry.morphAttributes.position?.length
    ) {
      return null;
    }

    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const elementCount = index?.count ?? position.count;
    const drawRangeStart = geometry.drawRange.start;
    const drawRangeCount = geometry.drawRange.count;
    if (!Number.isInteger(drawRangeStart) || drawRangeStart % 3 !== 0) {
      return null;
    }
    const start = Math.max(0, drawRangeStart);
    const requestedEnd = Number.isFinite(drawRangeCount)
      ? start + Math.max(0, drawRangeCount)
      : elementCount;
    const end = Math.min(elementCount, requestedEnd);
    const usableCount = end - start - ((end - start) % 3);
    if (usableCount / 3 < IMPACT_CHUNK_THRESHOLD_TRIANGLES) return null;

    const chunkElementCount = IMPACT_CHUNK_TRIANGLES * 3;
    const chunks: ImpactChunk[] = [];
    const point = new THREE.Vector3();
    for (
      let chunkStart = start;
      chunkStart < start + usableCount;
      chunkStart += chunkElementCount
    ) {
      const count = Math.min(
        chunkElementCount,
        start + usableCount - chunkStart,
      );
      const bounds = new THREE.Box3();
      for (let offset = chunkStart; offset < chunkStart + count; offset++) {
        const vertexIndex = index ? index.getX(offset) : offset;
        point.fromBufferAttribute(position, vertexIndex);
        bounds.expandByPoint(point);
      }
      bounds.applyMatrix4(mesh.matrixWorld).expandByScalar(0.01);
      chunks.push({ bounds, start: chunkStart, count, entryDistance: 0 });
    }
    return { chunks, drawRangeStart, drawRangeCount };
  }

  private raycastImpactCandidate(
    candidate: ImpactCandidate,
  ): THREE.Intersection | null {
    const geometry = candidate.mesh.geometry;
    const chunkSet = candidate.chunkSet;
    if (chunkSet === null) return this.raycastWholeCandidate(candidate.mesh);
    if (
      geometry.drawRange.start !== chunkSet.drawRangeStart
      || geometry.drawRange.count !== chunkSet.drawRangeCount
    ) return this.raycastWholeCandidate(candidate.mesh);

    this.impactChunkShortlist.length = 0;
    for (const chunk of chunkSet.chunks) {
      const entryDistance = rayBoxEntryDistance(
        this.raycaster.ray.origin,
        this.raycaster.ray.direction,
        chunk.bounds,
        this.raycaster.near,
        this.raycaster.far,
      );
      if (entryDistance === null) continue;
      chunk.entryDistance = entryDistance;
      this.impactChunkShortlist.push(chunk);
    }
    this.impactChunkShortlist.sort((left, right) =>
      left.entryDistance - right.entryDistance
    );

    let closest: THREE.Intersection | null = null;
    try {
      for (const chunk of this.impactChunkShortlist) {
        if (chunk.entryDistance > this.raycaster.far) break;
        geometry.setDrawRange(chunk.start, chunk.count);
        this.intersections.length = 0;
        this.raycaster.intersectObject(
          candidate.mesh,
          false,
          this.intersections,
        );
        const hit = this.intersections.at(0);
        if (hit && (!closest || hit.distance < closest.distance)) {
          closest = hit;
          this.raycaster.far = hit.distance;
        }
      }
    } finally {
      geometry.setDrawRange(
        chunkSet.drawRangeStart,
        chunkSet.drawRangeCount,
      );
    }
    return closest;
  }

  private raycastWholeCandidate(mesh: RenderMesh): THREE.Intersection | null {
    this.intersections.length = 0;
    this.raycaster.intersectObject(mesh, false, this.intersections);
    return this.intersections.at(0) ?? null;
  }

  private spawnBulletHole(
    hitPoint: THREE.Vector3,
    surfaceNormal: THREE.Vector3,
    impactObject: THREE.Object3D | null,
    localPoint: THREE.Vector3 | null,
    localNormal: THREE.Vector3 | null,
  ) {
    const entry = this.bulletHolePool.pop() ?? this.bulletHoles.shift();
    if (!entry) return;
    const hole = entry.mesh;
    hole.removeFromParent();
    hole.visible = true;
    hole.scale.setScalar(1);

    if (
      impactObject
      && !(impactObject instanceof THREE.InstancedMesh)
      && localPoint
      && localNormal
    ) {
      impactObject.getWorldScale(this.impactWorldScaleScratch);
      hole.scale.set(
        1 / Math.max(Math.abs(this.impactWorldScaleScratch.x), 1e-6),
        1 / Math.max(Math.abs(this.impactWorldScaleScratch.y), 1e-6),
        1 / Math.max(Math.abs(this.impactWorldScaleScratch.z), 1e-6),
      );
      hole.position.copy(localPoint).addScaledVector(localNormal, 0.002);
      hole.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        localNormal.clone().normalize(),
      );
      impactObject.add(hole);
    } else {
      hole.position.copy(hitPoint).addScaledVector(surfaceNormal, 0.002);
      hole.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        surfaceNormal.clone().normalize(),
      );
      this.scene.add(hole);
    }
    this.bulletHoles.push(entry);
  }

  private spawnGroundDebris(hitPoint: THREE.Vector3, surfaceNormal: THREE.Vector3) {
    const colors = [0x5b3a22, 0x79512e, 0x3f2b1d];

    for (let i = 0; i < 10; i++) {
      const debris = this.groundDebrisPool.pop() ?? this.groundDebris.shift();
      if (!debris) break;
      const size = 0.025 + Math.random() * 0.045;
      const mesh = debris.mesh;
      mesh.name = "ground-debris";
      mesh.visible = true;
      mesh.scale.setScalar(size);
      mesh.rotation.set(0, 0, 0);
      mesh.position.copy(hitPoint).addScaledVector(surfaceNormal, 0.02);
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.setHex(colors[i % colors.length]);
      material.opacity = 1;
      debris.velocity.set(
        (Math.random() - 0.5) * 1.8,
        0,
        (Math.random() - 0.5) * 1.8,
      ).addScaledVector(surfaceNormal, 1.2 + Math.random() * 1.2);
      debris.angularVelocity.set(
        Math.random() * 8,
        Math.random() * 8,
        Math.random() * 8,
      );
      debris.age = 0;
      debris.lifetime = 0.65 + Math.random() * 0.25;
      this.groundDebris.push(debris);
    }
  }

  private updateGroundDebris(dt: number) {
    for (let i = this.groundDebris.length - 1; i >= 0; i--) {
      const debris = this.groundDebris[i];
      debris.age += dt;

      if (debris.age >= debris.lifetime) {
        this.groundDebris.splice(i, 1);
        debris.mesh.visible = false;
        debris.mesh.name = "";
        debris.mesh.scale.setScalar(1);
        this.groundDebrisPool.push(debris);
        continue;
      }

      debris.velocity.y -= 6 * dt;
      debris.mesh.position.addScaledVector(debris.velocity, dt);
      debris.mesh.rotation.x += debris.angularVelocity.x * dt;
      debris.mesh.rotation.y += debris.angularVelocity.y * dt;
      debris.mesh.rotation.z += debris.angularVelocity.z * dt;
      (debris.mesh.material as THREE.MeshStandardMaterial).opacity =
        1 - debris.age / debris.lifetime;
    }
  }

  private spawnFoliageDebris(
    hitPoint: THREE.Vector3,
    surfaceNormal: THREE.Vector3,
  ) {
    const colors = [0x39752f, 0x4f8f3a, 0x78a944, 0x9a7d32];
    for (let i = 0; i < 10; i++) {
      const particle = this.foliageDebrisPool.pop()
        ?? this.foliageDebris.shift();
      if (!particle) break;
      const mesh = particle.mesh;
      mesh.name = "foliage-debris";
      mesh.visible = true;
      mesh.scale.setScalar(0.055 + Math.random() * 0.045);
      mesh.position.copy(hitPoint).addScaledVector(surfaceNormal, 0.04);
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      mesh.material.color.setHex(colors[i % colors.length]);
      mesh.material.opacity = 1;
      particle.velocity.set(
        (Math.random() - 0.5) * 2.8,
        0.8 + Math.random() * 1.6,
        (Math.random() - 0.5) * 2.8,
      ).addScaledVector(surfaceNormal, 0.6 + Math.random());
      particle.angularVelocity.set(
        4 + Math.random() * 8,
        4 + Math.random() * 8,
        4 + Math.random() * 8,
      );
      particle.age = 0;
      particle.lifetime = 0.7 + Math.random() * 0.45;
      particle.gravity = 3.5;
      this.foliageDebris.push(particle);
    }
  }

  private spawnWaterSplash(hitPoint: THREE.Vector3, strength = 1) {
    this.onWaterImpact(hitPoint, strength);
    const colors = [0xd6f4f1, 0x81cbd0, 0x4aa5b3];
    for (let i = 0; i < 9; i++) {
      const particle = this.waterSplashPool.pop() ?? this.waterSplashes.shift();
      if (!particle) break;
      const mesh = particle.mesh;
      mesh.name = "water-splash";
      mesh.visible = true;
      mesh.scale.setScalar(0.025 + Math.random() * 0.03);
      mesh.rotation.set(0, 0, 0);
      mesh.position.copy(hitPoint);
      mesh.material.color.setHex(colors[i % colors.length]);
      mesh.material.opacity = 1;

      const angle = (i / 9) * Math.PI * 2 + Math.random() * 0.35;
      const radialSpeed = 0.5 + Math.random() * 1.1;
      particle.velocity.set(
        Math.cos(angle) * radialSpeed,
        1.5 + Math.random() * 1.7,
        Math.sin(angle) * radialSpeed,
      );
      particle.angularVelocity.set(0, 0, 0);
      particle.age = 0;
      particle.lifetime = 0.45 + Math.random() * 0.25;
      particle.gravity = 5.5;
      this.waterSplashes.push(particle);
    }

    const ripple = this.waterRipplePool.pop() ?? this.waterRipples.shift();
    if (!ripple) return;
    const mesh = ripple.mesh;
    mesh.visible = true;
    mesh.name = "water-ripple";
    mesh.scale.setScalar(1);
    mesh.material.opacity = 0.85;
    mesh.rotation.set(-Math.PI / 2, 0, 0);
    mesh.position.copy(hitPoint);
    mesh.position.y += 0.025;
    ripple.age = 0;
    ripple.lifetime = 0.75;
    this.waterRipples.push(ripple);
  }

  private updateImpactParticles(
    particles: ImpactParticle[],
    pool: ImpactParticle[],
    dt: number,
  ) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.age += dt;
      if (particle.age >= particle.lifetime) {
        particles.splice(i, 1);
        particle.mesh.visible = false;
        particle.mesh.name = "";
        particle.mesh.scale.setScalar(1);
        pool.push(particle);
        continue;
      }

      particle.velocity.y -= particle.gravity * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.rotation.x += particle.angularVelocity.x * dt;
      particle.mesh.rotation.y += particle.angularVelocity.y * dt;
      particle.mesh.rotation.z += particle.angularVelocity.z * dt;
      particle.mesh.material.opacity = 1 - particle.age / particle.lifetime;
    }
  }

  private updateWaterRipples(dt: number) {
    for (let i = this.waterRipples.length - 1; i >= 0; i--) {
      const ripple = this.waterRipples[i];
      ripple.age += dt;
      if (ripple.age >= ripple.lifetime) {
        this.waterRipples.splice(i, 1);
        ripple.mesh.visible = false;
        ripple.mesh.name = "";
        ripple.mesh.scale.setScalar(1);
        this.waterRipplePool.push(ripple);
        continue;
      }

      const progress = ripple.age / ripple.lifetime;
      const scale = 1 + progress * 5;
      ripple.mesh.scale.setScalar(scale);
      ripple.mesh.material.opacity = 0.85 * (1 - progress);
    }
  }

  clearRoundEffects() {
    if (this.destroyed) return;
    while (this.tracers.length > 0) {
      const tracer = this.tracers.pop();
      if (!tracer) break;
      this.releaseTracer(tracer);
    }

    while (this.bulletHoles.length > 0) {
      const hole = this.bulletHoles.pop();
      if (!hole) break;
      hole.mesh.removeFromParent();
      hole.mesh.visible = false;
      this.bulletHolePool.push(hole);
    }

    while (this.groundDebris.length > 0) {
      const debris = this.groundDebris.pop();
      if (!debris) break;
      debris.mesh.visible = false;
      debris.mesh.name = "";
      debris.mesh.scale.setScalar(1);
      this.groundDebrisPool.push(debris);
    }

    while (this.foliageDebris.length > 0) {
      const debris = this.foliageDebris.pop();
      if (!debris) break;
      debris.mesh.visible = false;
      debris.mesh.name = "";
      debris.mesh.scale.setScalar(1);
      this.foliageDebrisPool.push(debris);
    }

    while (this.waterSplashes.length > 0) {
      const splash = this.waterSplashes.pop();
      if (!splash) break;
      splash.mesh.visible = false;
      splash.mesh.name = "";
      splash.mesh.scale.setScalar(1);
      this.waterSplashPool.push(splash);
    }

    while (this.waterRipples.length > 0) {
      const ripple = this.waterRipples.pop();
      if (!ripple) break;
      ripple.mesh.visible = false;
      ripple.mesh.name = "";
      ripple.mesh.scale.setScalar(1);
      this.waterRipplePool.push(ripple);
    }

    for (const flash of this.muzzleFlashes) {
      flash.remaining = 0;
      flash.mesh.visible = false;
    }
    this.muzzleLightRemaining = 0;
    this.muzzleLight.intensity = 0;
  }

  private createMuzzleFlash(origin: THREE.Vector3) {
    const flash = this.muzzleFlashes[
      this.nextMuzzleFlash % this.muzzleFlashes.length
    ];
    this.nextMuzzleFlash++;
    flash.mesh.position.copy(origin);
    flash.mesh.scale.setScalar(0.8 + Math.random() * 0.4);
    flash.mesh.visible = true;
    flash.remaining = MUZZLE_FLASH_SECONDS;

    // Keep one stable light UUID in the scene. WebGPU keys lit pipelines by the
    // light graph, so adding/removing a new PointLight per shot recompiles work.
    this.muzzleLight.position.copy(origin);
    this.muzzleLight.intensity = 4;
    this.muzzleLightRemaining = MUZZLE_FLASH_SECONDS;
  }

  private updateMuzzleFlash(dt: number) {
    for (const flash of this.muzzleFlashes) {
      if (flash.remaining <= 0) continue;
      flash.remaining -= dt;
      if (flash.remaining <= 0) flash.mesh.visible = false;
    }

    if (this.muzzleLightRemaining > 0) {
      this.muzzleLightRemaining -= dt;
      if (this.muzzleLightRemaining <= 0) this.muzzleLight.intensity = 0;
    }
  }

  dispose() {
    if (this.destroyed) return;
    this.clearRoundEffects();
    this.invalidateImpactSurfaces();
    this.destroyed = true;

    const materials = new Set<THREE.Material>([
      this.tracerMat,
      this.trailMat,
      this.holeMat,
      this.muzzleFlashMat,
    ]);
    const removeMesh = (mesh: THREE.Mesh) => {
      mesh.removeFromParent();
      const meshMaterials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of meshMaterials) materials.add(material);
    };

    for (const tracer of this.tracerPool) {
      removeMesh(tracer.mesh);
      removeMesh(tracer.trail);
    }
    for (const flash of this.muzzleFlashes) removeMesh(flash.mesh);
    for (const hole of this.bulletHolePool) removeMesh(hole.mesh);
    for (const debris of this.groundDebrisPool) removeMesh(debris.mesh);
    for (const debris of this.foliageDebrisPool) removeMesh(debris.mesh);
    for (const splash of this.waterSplashPool) removeMesh(splash.mesh);
    for (const ripple of this.waterRipplePool) removeMesh(ripple.mesh);

    this.muzzleLight.removeFromParent();
    this.muzzleLight.dispose();
    for (const geometry of [
      this.tracerGeo,
      this.trailGeo,
      this.holeGeo,
      this.muzzleFlashGeo,
      this.groundDebrisGeo,
      this.foliageDebrisGeo,
      this.waterSplashGeo,
      this.waterRippleGeo,
    ]) {
      geometry.dispose();
    }
    for (const material of materials) material.dispose();

    this.tracerPool.length = 0;
    this.muzzleFlashes.length = 0;
    this.bulletHolePool.length = 0;
    this.groundDebrisPool.length = 0;
    this.foliageDebrisPool.length = 0;
    this.waterSplashPool.length = 0;
    this.waterRipplePool.length = 0;
  }
}
