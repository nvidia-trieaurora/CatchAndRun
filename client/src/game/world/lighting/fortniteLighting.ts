import * as THREE from "three";
import { PALETTE } from "../materials/materialLibrary";

export function createFortniteLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.fog = new THREE.FogExp2(PALETTE.fogColor, 0.0035);

  createGradientSky(scene);
  createSun(scene);

  // Hemisphere: bright sky + warm ground bounce
  const hemi = new THREE.HemisphereLight(0x99bbdd, 0x997755, 1.0);
  scene.add(hemi);

  // Main sun -- only shadow caster
  const sun = new THREE.DirectionalLight(0xffecc8, 3.0);
  sun.position.set(-25, 40, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Cool fill from opposite side (no shadow)
  const fill = new THREE.DirectionalLight(0x8899cc, 0.6);
  fill.position.set(30, 15, -25);
  scene.add(fill);

  // Warm bounce from below/front
  const bounce = new THREE.DirectionalLight(0xddccaa, 0.3);
  bounce.position.set(0, -5, 20);
  scene.add(bounce);
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
  scene.add(new THREE.Mesh(skyGeo, skyMats));
}

function createSun(scene: THREE.Scene) {
  const sunPos = new THREE.Vector3(-25, 40, 35).normalize().multiplyScalar(350);

  // Glow
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(20, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff5d0, transparent: true, opacity: 0.25, depthWrite: false })
  );
  glow.position.copy(sunPos);
  scene.add(glow);

  // Core
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(8, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfffff5, transparent: true, opacity: 0.95 })
  );
  core.position.copy(sunPos);
  scene.add(core);

  // Halo ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(14, 35, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.position.copy(sunPos);
  ring.lookAt(0, 0, 0);
  scene.add(ring);
}
