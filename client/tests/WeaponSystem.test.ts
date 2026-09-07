import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeaponSystem } from "../src/game/systems/WeaponSystem";
import { tagWeaponImpactSurface } from "../src/game/world/weaponImpactSurfaces";

function findBulletHole(scene: THREE.Scene): THREE.Mesh | undefined {
  const object = scene.getObjectByName("bullet-hole");
  return object instanceof THREE.Mesh ? object : undefined;
}

function findGroundDebris(scene: THREE.Scene): THREE.Object3D[] {
  return scene.children.filter((object) => object.name === "ground-debris");
}

function findEffects(scene: THREE.Scene, name: string): THREE.Object3D[] {
  return scene.children.filter((object) => object.name === name);
}

function countEffects(scene: THREE.Scene, name: string): number {
  let count = 0;
  scene.traverse((object) => {
    if (object.name === name) count++;
  });
  return count;
}

function geometryIds(scene: THREE.Scene): Set<string> {
  const ids = new Set<string>();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      ids.add((object.geometry as THREE.BufferGeometry).uuid);
    }
  });
  return ids;
}

function materialIds(scene: THREE.Scene): Set<string> {
  const ids = new Set<string>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const meshMaterial = object.material as THREE.Material | THREE.Material[];
    const materials = Array.isArray(meshMaterial)
      ? meshMaterial
      : [meshMaterial];
    for (const material of materials) ids.add(material.uuid);
  });
  return ids;
}

describe("WeaponSystem bullet holes", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not create a bullet hole when a shot misses world geometry", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(100, 1, 100),
      new THREE.MeshBasicMaterial(),
    );
    ground.position.y = -0.5;
    scene.add(ground);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [ground]);
    weapon.fire(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0));
    weapon.update(0.21);

    expect(findBulletHole(scene)).toBeUndefined();
    expect(findGroundDebris(scene)).toHaveLength(0);
    vi.runAllTimers();
    weapon.dispose();
  });

  it("keeps a wall mark on the rendered surface until round cleanup", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1, 10, 10),
      new THREE.MeshBasicMaterial(),
    );
    wall.position.set(10, 1, 0);
    scene.add(wall);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [wall]);
    weapon.fire(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    weapon.update(0.21);

    const bulletHole = findBulletHole(scene);
    expect(bulletHole).toBeDefined();
    expect(bulletHole?.children).toHaveLength(0);
    expect(countEffects(scene, "bullet-scorch")).toBe(0);
    const worldPosition = bulletHole?.getWorldPosition(new THREE.Vector3());
    expect(worldPosition?.x).toBeCloseTo(9.498);

    vi.advanceTimersByTime(60_000);
    weapon.update(0.016);
    expect(findBulletHole(scene)).toBeDefined();

    weapon.clearRoundEffects();
    expect(findBulletHole(scene)).toBeUndefined();
    vi.runAllTimers();
    weapon.dispose();
  });

  it("keeps a wall mark attached to moving geometry", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const movingRoot = new THREE.Group();
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1, 4, 4),
      new THREE.MeshBasicMaterial(),
    );
    wall.position.x = 10;
    movingRoot.add(wall);
    scene.add(movingRoot);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [movingRoot]);
    weapon.fire(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    weapon.update(0.21);

    const bulletHole = findBulletHole(scene);
    expect(bulletHole?.parent).toBe(wall);
    const initialPosition = bulletHole?.getWorldPosition(new THREE.Vector3());

    movingRoot.rotation.z = Math.PI / 2;
    scene.updateMatrixWorld(true);
    const movedPosition = bulletHole?.getWorldPosition(new THREE.Vector3());

    expect(movedPosition?.x).toBeCloseTo(-(initialPosition?.y ?? 0));
    expect(movedPosition?.y).toBeCloseTo(initialPosition?.x ?? 0);
    weapon.clearRoundEffects();
    expect(findBulletHole(scene)).toBeUndefined();
    vi.runAllTimers();
    weapon.dispose();
  });

  it("keeps bullet marks physically small on scaled scenery", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const rock = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    rock.position.set(10, 1, 0);
    rock.scale.setScalar(8);
    scene.add(rock);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [rock]);
    weapon.fire(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    weapon.update(0.21);

    const bulletHole = findBulletHole(scene);
    expect(bulletHole?.parent).toBe(rock);
    const worldBounds = new THREE.Box3().setFromObject(bulletHole!);
    const worldSize = worldBounds.getSize(new THREE.Vector3());
    expect(Math.max(worldSize.x, worldSize.y, worldSize.z)).toBeLessThanOrEqual(0.14);

    vi.runAllTimers();
    weapon.dispose();
  });

  it("creates temporary debris instead of a wall mark when shooting the ground", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(100, 1, 100),
      new THREE.MeshBasicMaterial(),
    );
    ground.position.y = -0.5;
    scene.add(ground);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [ground]);
    weapon.fire(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0));
    weapon.update(0.21);

    expect(findBulletHole(scene)).toBeUndefined();
    expect(findGroundDebris(scene).length).toBeGreaterThan(0);

    weapon.update(1);
    expect(findGroundDebris(scene)).toHaveLength(0);
    vi.runAllTimers();
    weapon.dispose();
  });

  it("uses each instance transform when classifying an instanced ground hit", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const ground = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      1,
    );
    ground.setMatrixAt(0, new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    ground.instanceMatrix.needsUpdate = true;
    scene.add(ground);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [ground]);
    weapon.fire(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0));
    weapon.update(0.21);

    expect(findBulletHole(scene)).toBeUndefined();
    expect(findGroundDebris(scene).length).toBeGreaterThan(0);
    vi.runAllTimers();
    weapon.dispose();
  });

  it("sheds temporary leaves instead of marking a tree", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.BoxGeometry(1, 6, 1),
      new THREE.MeshBasicMaterial(),
    );
    trunk.position.set(10, 2, 0);
    tree.add(trunk);
    tagWeaponImpactSurface(tree, "foliage");
    scene.add(tree);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [tree]);
    weapon.fire(new THREE.Vector3(0, 2, 0), new THREE.Vector3(1, 0, 0));
    weapon.update(0.21);

    expect(findBulletHole(scene)).toBeUndefined();
    expect(findEffects(scene, "foliage-debris").length).toBeGreaterThan(0);

    weapon.update(2);
    expect(findEffects(scene, "foliage-debris")).toHaveLength(0);
    vi.runAllTimers();
    weapon.dispose();
  });

  it("creates a splash and ripple instead of marking water", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(20, 0.1, 20),
      new THREE.MeshBasicMaterial(),
    );
    tagWeaponImpactSurface(water, "water");
    scene.add(water);
    scene.updateMatrixWorld(true);

    const onWaterImpact = vi.fn();
    const weapon = new WeaponSystem(
      scene,
      () => [water],
      onWaterImpact,
    );
    weapon.fire(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0));
    weapon.update(0.21);

    expect(findBulletHole(scene)).toBeUndefined();
    expect(findGroundDebris(scene)).toHaveLength(0);
    expect(findEffects(scene, "water-splash").length).toBeGreaterThan(0);
    expect(findEffects(scene, "water-ripple")).toHaveLength(1);
    expect(onWaterImpact).toHaveBeenCalledWith(
      expect.objectContaining({ x: 0, z: 0 }),
      1,
    );

    weapon.clearRoundEffects();
    expect(findEffects(scene, "water-splash")).toHaveLength(0);
    expect(findEffects(scene, "water-ripple")).toHaveLength(0);
    vi.runAllTimers();
    weapon.dispose();
  });

  it("keeps the scene light topology stable while firing", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const weapon = new WeaponSystem(scene, () => []);
    const lightIdsBefore = scene.children
      .filter((object): object is THREE.PointLight => object instanceof THREE.PointLight)
      .map((light) => light.uuid);

    for (let i = 0; i < 8; i++) {
      weapon.fire(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
    }
    weapon.update(0.1);

    const lightIdsAfter = scene.children
      .filter((object): object is THREE.PointLight => object instanceof THREE.PointLight)
      .map((light) => light.uuid);
    expect(lightIdsAfter).toEqual(lightIdsBefore);
    vi.runAllTimers();
    weapon.dispose();
  });

  it("removes and disposes its pooled scene resources on terminal cleanup", () => {
    const scene = new THREE.Scene();
    const weapon = new WeaponSystem(scene, () => []);

    expect(scene.children.length).toBeGreaterThan(0);
    weapon.dispose();

    expect(scene.children).toHaveLength(0);
    expect(() => weapon.dispose()).not.toThrow();
  });

  it("caches the map hierarchy and broad-phases meshes outside the shot ray", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1, 8, 8),
      new THREE.MeshBasicMaterial(),
    );
    wall.position.x = 10;
    const offRay = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40, 30, 30),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    offRay.position.set(10, 100, 0);
    offRay.rotation.y = Math.PI / 2;
    world.add(wall, offRay);
    scene.add(world);
    scene.updateMatrixWorld(true);

    const traverse = vi.spyOn(world, "traverse");
    const offRayRaycast = vi.spyOn(offRay, "raycast");
    const weapon = new WeaponSystem(scene, () => [world]);
    weapon.fire(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    const traversalsAfterWarmup = traverse.mock.calls.length;
    const collectCandidates = vi.spyOn(
      weapon as unknown as {
        collectImpactCandidates(object: THREE.Object3D): void;
      },
      "collectImpactCandidates",
    );
    offRayRaycast.mockClear();

    for (let i = 0; i < 6; i++) {
      weapon.fire(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    }

    expect(traverse).toHaveBeenCalledTimes(traversalsAfterWarmup);
    expect(collectCandidates).not.toHaveBeenCalled();
    expect(offRayRaycast).not.toHaveBeenCalled();
    vi.runAllTimers();
    weapon.dispose();
  });

  it("limits exact raycasts to spatial chunks for dense static meshes", () => {
    const scene = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(80, 80, 64, 64);
    const wall = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    wall.position.x = 10;
    wall.rotation.y = Math.PI / 2;
    scene.add(wall);
    scene.updateMatrixWorld(true);

    const observedDrawCounts: number[] = [];
    const raycast = wall.raycast.bind(wall);
    vi.spyOn(wall, "raycast").mockImplementation((raycaster, intersections) => {
      observedDrawCounts.push(geometry.drawRange.count);
      raycast(raycaster, intersections);
    });
    const weapon = new WeaponSystem(scene, () => [wall]);
    weapon.prepareImpactSurfaces();
    weapon.fire(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));

    expect(observedDrawCounts.length).toBeGreaterThan(0);
    expect(Math.max(...observedDrawCounts)).toBeLessThan(
      geometry.getIndex()?.count ?? 0,
    );
    expect(geometry.drawRange).toEqual({ start: 0, count: Infinity });
    weapon.dispose();
  });

  it("does not stop tracers on hidden map geometry", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const hiddenGate = new THREE.Mesh(
      new THREE.BoxGeometry(1, 8, 8),
      new THREE.MeshBasicMaterial(),
    );
    hiddenGate.position.x = 5;
    hiddenGate.visible = false;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1, 8, 8),
      new THREE.MeshBasicMaterial(),
    );
    wall.position.x = 10;
    scene.add(hiddenGate, wall);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [hiddenGate, wall]);
    weapon.fire(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    weapon.update(0.21);

    expect(findBulletHole(scene)?.parent).toBe(wall);
    vi.runAllTimers();
    weapon.dispose();
  });

  it("restores a shared multi-material after the shot raycast", () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1, 8, 8),
      [material, material, material, material, material, material],
    );
    wall.position.x = 10;
    scene.add(wall);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [wall]);
    weapon.fire(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));

    expect(material.side).toBe(THREE.FrontSide);
    weapon.dispose();
  });

  it("refreshes cached bounds for explicitly dynamic map geometry", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const movingRoot = new THREE.Group();
    movingRoot.userData.dynamicWeaponRaycast = true;
    const movingWall = new THREE.Mesh(
      new THREE.BoxGeometry(1, 8, 8),
      new THREE.MeshBasicMaterial(),
    );
    movingWall.position.x = 5;
    movingRoot.add(movingWall);
    const fixedWall = new THREE.Mesh(
      new THREE.BoxGeometry(1, 8, 8),
      new THREE.MeshBasicMaterial(),
    );
    fixedWall.position.x = 10;
    scene.add(movingRoot, fixedWall);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [movingRoot, fixedWall]);
    weapon.prepareImpactSurfaces();
    movingRoot.position.y = 100;
    weapon.fire(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    weapon.update(0.21);

    expect(findBulletHole(scene)?.parent).toBe(fixedWall);
    vi.runAllTimers();
    weapon.dispose();
  });

  it("refreshes cached bounds when instance matrices are dynamic", () => {
    const scene = new THREE.Scene();
    const wall = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 8, 8),
      new THREE.MeshBasicMaterial(),
      1,
    );
    wall.userData.dynamicWeaponInstances = true;
    wall.setMatrixAt(0, new THREE.Matrix4().makeTranslation(100, 1, 0));
    wall.instanceMatrix.needsUpdate = true;
    scene.add(wall);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [wall]);
    weapon.prepareImpactSurfaces();
    wall.setMatrixAt(0, new THREE.Matrix4().makeTranslation(10, 1, 0));
    wall.instanceMatrix.needsUpdate = true;
    weapon.fire(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    weapon.update(0.21);

    expect(findBulletHole(scene)).toBeDefined();
    weapon.dispose();
  });

  it("reuses tracer and muzzle geometry on the repeated-fire hot path", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const weapon = new WeaponSystem(scene, () => []);
    const idsBefore = geometryIds(scene);
    const materialsBefore = materialIds(scene);

    for (let i = 0; i < 40; i++) {
      weapon.fire(new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
      weapon.update(0.21);
      vi.advanceTimersByTime(61);
    }

    expect(geometryIds(scene)).toEqual(idsBefore);
    expect(materialIds(scene)).toEqual(materialsBefore);
    vi.runAllTimers();
    weapon.dispose();
  });

  it("caps persistent wall marks during sustained fire", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1, 10, 10),
      new THREE.MeshBasicMaterial(),
    );
    wall.position.x = 10;
    scene.add(wall);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [wall]);
    for (let i = 0; i < 80; i++) {
      weapon.fire(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
      weapon.update(0.21);
    }

    expect(countEffects(scene, "bullet-hole")).toBe(48);
    vi.runAllTimers();
    weapon.dispose();
  });

  it("reuses impact geometry and bounds debris during sustained ground fire", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(100, 1, 100),
      new THREE.MeshBasicMaterial(),
    );
    ground.position.y = -0.5;
    scene.add(ground);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [ground]);
    const idsBefore = geometryIds(scene);
    for (let i = 0; i < 12; i++) {
      weapon.fire(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0));
      weapon.update(0.21);
    }

    expect(geometryIds(scene)).toEqual(idsBefore);
    expect(findGroundDebris(scene).length).toBeGreaterThan(0);
    expect(findGroundDebris(scene).length).toBeLessThanOrEqual(40);
    vi.runAllTimers();
    weapon.dispose();
  });
});
