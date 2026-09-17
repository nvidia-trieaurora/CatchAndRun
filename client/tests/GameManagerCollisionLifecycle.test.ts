import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CollisionSpatialIndex } from "../src/game/world/collisionBroadphase";
import { WaterVolumes } from "../src/game/controllers/WaterSwim";
import type { BoatCollisionRig } from "../src/game/world/zones/BoatCollisionRig";

interface Duplicate {
  mesh: THREE.Mesh;
  collider: THREE.Box3;
  hp: number;
  vy: number;
  onGround: boolean;
}

interface CollisionHarness {
  scene: THREE.Scene;
  mapBuilt: boolean;
  weaponEffectsWarmupPending: boolean;
  colliders: THREE.Box3[];
  collisionIndex: CollisionSpatialIndex;
  nearbyMapColliders: THREE.Box3[];
  duplicates: Duplicate[];
  rebuildCollisionIndex(): void;
  openHunterGate(): void;
  closeHunterGate(): void;
  spawnDuplicateMesh(x: number, y: number, z: number, propId: string, rotation: number): void;
  updateDuplicatePhysics(dt: number): void;
  destroyDuplicate(duplicate: Duplicate): void;
  clearDuplicates(): void;
  teardownMap(): void;
  animate(): void;
  updateBoatPhysics(): void;
}

let prototype: object;
beforeAll(async () => {
  // Import the real lifecycle methods without constructing the WebGL/UI shell.
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  prototype = (await import("../src/game/GameManager")).GameManager.prototype;
});
afterAll(() => vi.unstubAllGlobals());

function createHarness(colliders: THREE.Box3[], gate: THREE.Box3 | null = null): CollisionHarness {
  const manager = Object.assign(Object.create(prototype) as CollisionHarness, {
    colliders,
    collisionIndex: new CollisionSpatialIndex(),
    nearbyMapColliders: [],
    weaponEffectsWarmupPending: false,
    mapBuilt: true,
    gateColliderTemplate: gate,
    gateMesh: new THREE.Mesh(),
    ferrisCabinColliders: [],
    duplicates: [],
    scene: new THREE.Scene(),
    propRegistry: {
      createMesh: () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()),
      get: () => ({ hp: 100 }),
    },
    activeHarborZones: [],
    mapObjects: [],
    boatCarryScratch: new THREE.Vector3(),
    duplicateWater: new WaterVolumes(),
  });
  manager.rebuildCollisionIndex();
  return manager;
}

describe("GameManager collision-index lifecycle", () => {
  it("indexes boat boxes as dynamic and carries a supported prop with its vessel", () => {
    const deck = new THREE.Box3(new THREE.Vector3(39, -.3, 49), new THREE.Vector3(41, -.1, 51));
    const manager = createHarness([deck]);
    const order: string[] = [];
    Object.assign(manager, {
      boatCollisionRig: { colliders: [deck], update: () => { deck.translate(new THREE.Vector3(-40, .04, 0)); order.push("boat"); },
        carryDelta: (_x: number, _y: number, _z: number, delta: THREE.Vector3) => { delta.set(.01, .04, .02); return true; },
      } as unknown as BoatCollisionRig,
      controllersReady: true, localIsAlive: true, localRole: "prop",
      propController: { isGrounded: () => true, setBoatSupports: () => {}, getPosition: () => new THREE.Vector3(0, -.1, 50), translatePosition: (...delta: number[]) => { expect(delta).toEqual([.01, .04, .02]); order.push("carry"); } },
    });
    manager.rebuildCollisionIndex();
    expect(manager.collisionIndex.collectNearby(new THREE.Vector3(0, 0, 50), 3)).toEqual([]);
    manager.updateBoatPhysics();
    expect(order).toEqual(["boat", "carry"]);
    expect(manager.collisionIndex.collectNearby(new THREE.Vector3(0, 0, 50), 3)).toContain(deck);
  });

  it("lets falling objects settle on a low boat deck instead of an invisible sea-level floor", () => {
    const deck = new THREE.Box3(new THREE.Vector3(-2, -.3, 49), new THREE.Vector3(2, -.1, 51));
    const manager = createHarness([deck]);
    const water = new WaterVolumes();
    water.setBoxes([{ min: { x: -50, y: -10, z: 48 }, max: { x: 50, y: 1, z: 60 } }]);
    Object.assign(manager, { duplicateWater: water });
    manager.spawnDuplicateMesh(0, 3, 50, "crate", 0);
    for (let i = 0; i < 100; i++) manager.updateDuplicatePhysics(1 / 60);
    expect(manager.duplicates[0].collider.min.y).toBeCloseTo(deck.max.y, 4);
  });

  it.each([false, true])("waits for an actual world render before prewarming a new HDR (postprocessing: %s)", (postprocessing) => {
    const manager = createHarness([]);
    let renderedEnvironment: THREE.Texture | null = null;
    const order: string[] = [];
    const render = () => { renderedEnvironment = manager.scene.environment; order.push("render"); };
    const prepareVisualEffects = vi.fn(() => {
      expect(renderedEnvironment).toBe(manager.scene.environment);
      order.push("warm");
      return Promise.resolve();
    });
    Object.assign(manager, {
      camera: new THREE.PerspectiveCamera(),
      clock: { getDelta: () => 0.016 },
      runtimeMetrics: { recordFrame: () => {} },
      isGameActive: () => false,
      updateDrowningCinematic: () => {},
      playerEntities: new Map(),
      updateDuplicatePhysics: () => {},
      updateGunViewmodel: () => {},
      updateFovKick: () => {},
      cameraShake: { update: () => {} },
      post: { enabled: postprocessing, render },
      renderer: { render },
      weaponSystem: { update: () => {}, prepareVisualEffects },
      metricsFrame: 0,
    });
    manager.mapBuilt = false;
    manager.weaponEffectsWarmupPending = true;
    manager.animate();
    expect(prepareVisualEffects).not.toHaveBeenCalled();
    expect(manager.weaponEffectsWarmupPending).toBe(true);

    manager.mapBuilt = true;
    manager.scene.environment = new THREE.Texture();
    manager.animate();
    expect(order).toEqual(["render", "render", "warm"]);
    expect(manager.weaponEffectsWarmupPending).toBe(false);
    manager.animate();
    expect(prepareVisualEffects).toHaveBeenCalledOnce();

    manager.scene.environment = new THREE.Texture();
    manager.weaponEffectsWarmupPending = true;
    expect(prepareVisualEffects).toHaveBeenCalledOnce();
    manager.animate();
    expect(order.slice(-2)).toEqual(["render", "warm"]);
    expect(prepareVisualEffects).toHaveBeenCalledTimes(2);
  });

  it("removes the gate for ACTIVE and restores it for the next HIDING round", () => {
    const gate = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 3, 1));
    const manager = createHarness([gate], gate);
    const origin = new THREE.Vector3();
    manager.openHunterGate();
    expect(manager.collisionIndex.collectNearby(origin, 4)).not.toContain(gate);
    manager.closeHunterGate();
    expect(manager.collisionIndex.collectNearby(origin, 4)).toEqual([gate]);
    manager.closeHunterGate();
    expect(manager.collisionIndex.collectNearby(origin, 4)).toEqual([gate]);
  });

  it.each([false, true])("warms offscreen map resources after rendered HDR and weapon effects, using the active target (post: %s)", async (postprocessing) => {
    const manager = createHarness([]);
    const target = new THREE.RenderTarget(16, 16);
    const order: string[] = [];
    const prepare = vi.fn(() => { order.push("map"); return Promise.resolve(); });
    const objects = [new THREE.Group()];
    const camera = new THREE.PerspectiveCamera();
    const renderer = { render: () => { order.push("render"); } };
    Object.assign(manager, {
      camera, renderer, mapObjects: objects,
      mapRenderWarmup: { prepare, invalidate: vi.fn() },
      clock: { getDelta: () => 0.016 },
      runtimeMetrics: { recordFrame: () => {} },
      isGameActive: () => false,
      updateDrowningCinematic: () => {},
      playerEntities: new Map(),
      updateDuplicatePhysics: () => {}, updateGunViewmodel: () => {}, updateFovKick: () => {},
      cameraShake: { update: () => {} },
      post: { enabled: postprocessing, render: renderer.render, getSceneRenderTarget: () => target },
      weaponSystem: { update: () => {}, prepareVisualEffects: () => { order.push("weapon"); return Promise.resolve(); } },
      metricsFrame: 0, weaponEffectsWarmupPending: true,
    });
    manager.animate();
    expect(order).toEqual(["render", "weapon"]);
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["render", "weapon", "map"]);
    expect(prepare).toHaveBeenCalledWith(renderer, manager.scene, camera, objects, postprocessing ? target : null);
    manager.animate();
    await Promise.resolve();
    expect(prepare).toHaveBeenCalledOnce();
  });

  it("registers live decoy bounds and forgets destroyed/cleared decoys", () => {
    const manager = createHarness([]);
    const origin = new THREE.Vector3();
    manager.spawnDuplicateMesh(30, 3, 0, "crate", 0);
    const duplicate = manager.duplicates[0];
    expect(manager.collisionIndex.collectNearby(origin, 4)).toEqual([]);
    duplicate.mesh.position.x = 0;
    manager.updateDuplicatePhysics(0.016);
    expect(manager.collisionIndex.collectNearby(origin, 4)).toEqual([duplicate.collider]);
    manager.destroyDuplicate(duplicate);
    expect(manager.collisionIndex.collectNearby(origin, 4)).toEqual([]);
    manager.spawnDuplicateMesh(0, 1, 0, "crate", 0);
    expect(manager.collisionIndex.collectNearby(origin, 4)).toHaveLength(1);
    manager.clearDuplicates();
    expect(manager.collisionIndex.collectNearby(origin, 4)).toEqual([]);
  });

  it("clears the cached query and map index when switching maps", () => {
    const floor = new THREE.Box3(new THREE.Vector3(-40, -1, -40), new THREE.Vector3(40, 0, 40));
    const manager = createHarness([floor]);
    manager.collisionIndex.collectNearby(new THREE.Vector3(), 16, manager.nearbyMapColliders);
    expect(manager.nearbyMapColliders).toEqual([floor]);
    manager.teardownMap();
    expect(manager.nearbyMapColliders).toEqual([]);
    expect(manager.collisionIndex.collectNearby(new THREE.Vector3(), 16)).toEqual([]);
  });

  it("removes decoy visuals with their colliders when leaving the map", () => {
    const manager = createHarness([]);
    manager.spawnDuplicateMesh(0, 1, 0, "crate", 0);
    const mesh = manager.duplicates[0].mesh;
    expect(mesh.parent).not.toBeNull();
    manager.teardownMap();
    expect(manager.duplicates).toEqual([]);
    expect(mesh.parent).toBeNull();
    expect(manager.collisionIndex.collectNearby(new THREE.Vector3(), 16)).toEqual([]);
  });
});
