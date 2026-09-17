import * as THREE from "three";
import type { GameRenderer } from "../../rendering/RendererFactory";

export function createFortniteLighting(
  scene: THREE.Scene,
  renderer: GameRenderer,
  environment: THREE.Texture | null = null,
) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.fog = new THREE.FogExp2(0x8d8982, 0.0042);

  if (environment) {
    applyHarborEnvironment(scene, environment);
  } else {
    createGradientSky(scene);
    createSun(scene);
  }

  // Restrained ambient light keeps material roughness and normal detail visible.
  const hemi = new THREE.HemisphereLight(0x91a5ad, 0x5a4938, 0.42);
  scene.add(hemi);

  // Low late-afternoon sun is the only shadow caster.
  const sun = new THREE.DirectionalLight(0xffc982, 3.4);
  sun.position.set(-55, 38, -32);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 140;
  // The wide harbor shadow frustum needs enough separation to avoid self-shadow
  // bands on shallow roofs/slabs. Runtime A/B keeps contact shadows with these
  // offsets; disabling normal maps did not remove the former shadow acne.
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.08;
  scene.add(sun);

  // Cool maritime fill from the opposite side, without flattening the scene.
  const fill = new THREE.DirectionalLight(0x6f8fa5, 0.24);
  fill.position.set(30, 15, -25);
  scene.add(fill);

  const bounce = new THREE.DirectionalLight(0xd7a86d, 0.1);
  bounce.position.set(0, -5, 20);
  scene.add(bounce);
}

export function applyHarborEnvironment(
  scene: THREE.Scene,
  environment: THREE.Texture,
) {
  const fallbackObjects = scene.children.filter((object) =>
    object.name.startsWith("harbor-fallback-")
  );
  for (const object of fallbackObjects) {
    object.removeFromParent();
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        const map = (
          material as THREE.Material & { map?: THREE.Texture | null }
        ).map;
        if (map instanceof THREE.Texture) map.dispose();
        material.dispose();
      }
    });
  }
  scene.environment = environment;
  scene.background = environment;
  scene.backgroundBlurriness = 0.12;
  scene.backgroundIntensity = 0.68;
  scene.environmentIntensity = 0.82;
}

function makeSolidTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 4;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 4, 4);
  return new THREE.CanvasTexture(c);
}

function makeGradientTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, "#5599cc");
  g.addColorStop(0.3, "#88bbdd");
  g.addColorStop(0.55, "#aaccdd");
  g.addColorStop(0.75, "#c8d8e4");
  g.addColorStop(0.9, "#e0ddd5");
  g.addColorStop(1.0, "#e0c890");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  return new THREE.CanvasTexture(c);
}

function createGradientSky(scene: THREE.Scene) {
  const sideTexture = makeGradientTexture();
  const topTexture = makeSolidTexture("#4488bb");
  const bottomTexture = makeSolidTexture("#e0c890");

  const skyGeo = new THREE.BoxGeometry(800, 800, 800);
  // Box face order: +X, -X, +Y (top), -Y (bottom), +Z, -Z
  const skyMats = [
    new THREE.MeshBasicMaterial({ map: sideTexture, side: THREE.BackSide, depthWrite: false }),
    new THREE.MeshBasicMaterial({ map: sideTexture, side: THREE.BackSide, depthWrite: false }),
    new THREE.MeshBasicMaterial({ map: topTexture, side: THREE.BackSide, depthWrite: false }),
    new THREE.MeshBasicMaterial({ map: bottomTexture, side: THREE.BackSide, depthWrite: false }),
    new THREE.MeshBasicMaterial({ map: sideTexture, side: THREE.BackSide, depthWrite: false }),
    new THREE.MeshBasicMaterial({ map: sideTexture, side: THREE.BackSide, depthWrite: false }),
  ];
  const sky = new THREE.Mesh(skyGeo, skyMats);
  sky.name = "harbor-fallback-sky";
  scene.add(sky);
}

function createSun(scene: THREE.Scene) {
  const sunPos = new THREE.Vector3(-25, 40, 35).normalize().multiplyScalar(350);

  // Glow
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(20, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff5d0, transparent: true, opacity: 0.25, depthWrite: false })
  );
  glow.position.copy(sunPos);
  glow.name = "harbor-fallback-sun-glow";
  scene.add(glow);

  // Core
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(8, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfffff5, transparent: true, opacity: 0.95 })
  );
  core.position.copy(sunPos);
  core.name = "harbor-fallback-sun-core";
  scene.add(core);

  // Halo ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(14, 35, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.position.copy(sunPos);
  ring.lookAt(0, 0, 0);
  ring.name = "harbor-fallback-sun-ring";
  scene.add(ring);
}
