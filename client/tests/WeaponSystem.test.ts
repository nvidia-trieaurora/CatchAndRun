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

  it("precompiles pooled shaders in isolation without exposing hidden effects", async () => {
    const scene = new THREE.Scene();
    scene.environment = new THREE.Texture();
    scene.fog = new THREE.Fog(0x334455, 1, 100);
    const camera = new THREE.PerspectiveCamera();
    const weapon = new WeaponSystem(scene, () => []);
    const childrenBefore = [...scene.children];
    const visibleBefore = childrenBefore.map((object) => object.visible);
    const materialsBefore = materialIds(scene);
    const tracer = scene.getObjectByName("bullet-tracer") as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    const disposeGeometry = vi.spyOn(tracer.geometry, "dispose");
    const disposeMaterial = vi.spyOn(tracer.material, "dispose");
    const stagingScenes: THREE.Object3D[] = [];
    const compileAsync = vi.fn(async (staging: THREE.Object3D, compileCamera: THREE.Camera, target?: THREE.Scene | null) => {
      stagingScenes.push(staging);
      expect(target).toBe(scene);
      expect(compileCamera).toBe(camera);
      expect(staging).not.toBe(scene);
      expect(staging).toBeInstanceOf(THREE.Scene);
      expect((staging as THREE.Scene).environment).toBe(scene.environment);
      expect((staging as THREE.Scene).fog).toBe(scene.fog);
      const warmed = new Set<string>();
      staging.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        expect(object.visible).toBe(true);
        expect(object.frustumCulled).toBe(false);
        const sourceMaterials = object.material as THREE.Material | THREE.Material[];
        for (const material of Array.isArray(sourceMaterials) ? sourceMaterials : [sourceMaterials]) warmed.add(material.uuid);
      });
      for (const material of materialsBefore) expect(warmed.has(material)).toBe(true);
      // Detached bullet-hole materials must also be compiled before their first hit.
      expect(warmed.size).toBeGreaterThan(materialsBefore.size);
      await Promise.resolve();
      expect(scene.children).toEqual(childrenBefore);
      expect(scene.children.map((object) => object.visible)).toEqual(visibleBefore);
    });

    await weapon.prepareVisualEffects({ compileAsync }, camera);

    expect(compileAsync).toHaveBeenCalledOnce();
    expect(scene.children).toEqual(childrenBefore);
    expect(stagingScenes[0].children).toEqual([]);
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
    disposeGeometry.mockRestore();
    disposeMaterial.mockRestore();
    weapon.dispose();
  });

  it("allows shader warmup retry after compilation failure and skips disposed systems", async () => {
    const scene = new THREE.Scene();
    const weapon = new WeaponSystem(scene, () => []);
    const camera = new THREE.PerspectiveCamera();
    const compileAsync = vi.fn().mockRejectedValueOnce(new Error("compile failed")).mockResolvedValue(undefined);
    await expect(weapon.prepareVisualEffects({ compileAsync }, camera)).rejects.toThrow("compile failed");
    await weapon.prepareVisualEffects({ compileAsync }, camera);
    expect(compileAsync).toHaveBeenCalledTimes(2);
    weapon.dispose();
    await weapon.prepareVisualEffects({ compileAsync }, camera);
    expect(compileAsync).toHaveBeenCalledTimes(2);
  });

  it("serializes warmup across map upgrades and cancels queued work on disposal", async () => {
    const weapon = new WeaponSystem(new THREE.Scene(), () => []);
    const camera = new THREE.PerspectiveCamera();
    let finishCompilation = () => {};
    const compiling = new Promise<void>((resolve) => { finishCompilation = resolve; });
    const compileAsync = vi.fn(() => compiling);
    const first = weapon.prepareVisualEffects({ compileAsync }, camera);
    const queued = weapon.prepareVisualEffects({ compileAsync }, camera);
    await vi.waitFor(() => expect(compileAsync).toHaveBeenCalledOnce());
    weapon.dispose();
    finishCompilation();
    await Promise.all([first, queued]);
    expect(compileAsync).toHaveBeenCalledOnce();
  });

  it.each(["environment", "fog"] as const)("drops queued warmup when an unrendered %s replaces its snapshot", async (changed) => {
    const scene = new THREE.Scene();
    const weapon = new WeaponSystem(scene, () => []);
    const camera = new THREE.PerspectiveCamera();
    const compileAsync = vi.fn().mockResolvedValue(undefined);
    const queued = weapon.prepareVisualEffects({ compileAsync }, camera);
    if (changed === "environment") scene.environment = new THREE.Texture();
    else scene.fog = new THREE.Fog(0, 1, 100);
    await queued;
    expect(compileAsync).not.toHaveBeenCalled();
    await weapon.prepareVisualEffects({ compileAsync }, camera);
    expect(compileAsync).toHaveBeenCalledOnce();
    weapon.dispose();
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
    if (!bulletHole) throw new Error("Expected a mark on the scaled rock");
    const worldBounds = new THREE.Box3().setFromObject(bulletHole);
    const worldSize = worldBounds.getSize(new THREE.Vector3());
    expect(Math.max(worldSize.x, worldSize.y, worldSize.z)).toBeLessThanOrEqual(0.14);

    vi.runAllTimers();
    weapon.dispose();
  });

  it.each([false, true])("keeps marks 13cm wide and 2mm off nonuniform scenery (nested rotation: %s)", (nested) => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.position.set(10, 1, 0);
    if (nested) {
      root.scale.set(3, 1, 7);
      root.rotation.z = 0.15;
    }
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    wall.scale.set(0.2, 5, 12);
    if (nested) wall.rotation.y = 0.65;
    root.add(wall);
    scene.add(root);
    scene.updateMatrixWorld(true);
    const point = new THREE.Vector3(-0.5, 0, 0).applyMatrix4(wall.matrixWorld);
    const normal = new THREE.Vector3(-1, 0, 0).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(wall.matrixWorld));
    const weapon = new WeaponSystem(scene, () => [root]);
    weapon.fire(point.clone().addScaledVector(normal, 4), normal.clone().negate());
    weapon.update(0.21);

    const hole = findBulletHole(scene);
    expect(hole?.parent).toBe(wall);
    if (!hole) throw new Error("Expected a mark on the nonuniform wall");
    // Measure actual vertices, not the rotated square AABB around the disc.
    const size = new THREE.Box3().setFromObject(hole, true).getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeLessThanOrEqual(0.131);
    const initialPosition = hole.getWorldPosition(new THREE.Vector3());
    expect(initialPosition.distanceTo(point)).toBeCloseTo(0.002, 5);
    const vertices = hole.geometry.getAttribute("position");
    const radial = new THREE.Vector3();
    for (let vertex = 0; vertex < vertices.count; vertex++) {
      radial.fromBufferAttribute(vertices, vertex).applyMatrix4(hole.matrixWorld).sub(initialPosition);
      expect(radial.length()).toBeLessThanOrEqual(0.0651);
      expect(radial.dot(normal)).toBeCloseTo(0, 5);
    }
    root.position.z += 3;
    scene.updateMatrixWorld(true);
    expect(hole.getWorldPosition(new THREE.Vector3()).z - initialPosition.z).toBeCloseTo(3);
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

  it("treats ambientMotion-tagged zone meshes (AB rotors, davit hook) as dynamic and skips no-ray ones", () => {
    vi.useFakeTimers();
    const scene = new THREE.Scene();
    // a spinning vent rotor that also opts out of weapon hits entirely
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    rotor.userData.ambientMotion = "spin";
    rotor.userData.ignoreWeaponRaycast = true;
    rotor.position.x = 3;
    // a swaying hook block: hit surface that moves after the cache was built
    const hook = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    hook.userData.ambientMotion = "davit-sway";
    hook.position.x = 5;
    const fixedWall = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    fixedWall.position.x = 10;
    scene.add(rotor, hook, fixedWall);
    scene.updateMatrixWorld(true);

    const weapon = new WeaponSystem(scene, () => [rotor, hook, fixedWall]);
    weapon.prepareImpactSurfaces();
    hook.position.y = 100;
    hook.updateMatrixWorld(true);
    weapon.fire(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    weapon.update(0.21);

    // the rotor never takes hits, the moved hook is re-evaluated: the shot lands on the fixed wall
    expect(findBulletHole(scene)?.parent).toBe(fixedWall);
    vi.runAllTimers();
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
