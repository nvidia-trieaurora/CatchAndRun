import * as THREE from "three";
import { WEAPON_FIRE_RATE_MS, WEAPON_RELOAD_TIME_MS } from "@catch-and-run/shared";

interface BulletTracer {
  mesh: THREE.Mesh;
  trail: THREE.Mesh;
  origin: THREE.Vector3;
  target: THREE.Vector3;
  progress: number;
  speed: number;
}

interface BulletHole {
  mesh: THREE.Mesh;
  spawnTime: number;
}

export class WeaponSystem {
  private scene: THREE.Scene;
  private lastFireTime = 0;
  private isReloading = false;
  private reloadStartTime = 0;
  private tracers: BulletTracer[] = [];
  private bulletHoles: BulletHole[] = [];

  private tracerMat: THREE.MeshBasicMaterial;
  private trailMat: THREE.MeshBasicMaterial;
  private holeMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0.9 });
    this.trailMat = new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.4 });
    this.holeMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.3,
      metalness: 0.5,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
  }

  canFire(ammo: number): boolean {
    if (ammo <= 0) return false;
    if (this.isReloading) return false;
    return Date.now() - this.lastFireTime >= WEAPON_FIRE_RATE_MS;
  }

  fire(origin: THREE.Vector3, direction: THREE.Vector3) {
    this.lastFireTime = Date.now();
    this.createTracer(origin, direction);
    this.createMuzzleFlash(origin);
  }

  startReload() {
    this.isReloading = true;
    this.reloadStartTime = Date.now();
  }

  update(dt: number) {
    if (this.isReloading && Date.now() - this.reloadStartTime >= WEAPON_RELOAD_TIME_MS) {
      this.isReloading = false;
    }

    // Animate bullet tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.progress += dt * t.speed;

      if (t.progress >= 1) {
        this.scene.remove(t.mesh);
        this.scene.remove(t.trail);
        t.mesh.geometry.dispose();
        t.trail.geometry.dispose();
        this.spawnBulletHole(t.target, t.origin);
        this.tracers.splice(i, 1);
        continue;
      }

      const pos = t.origin.clone().lerp(t.target, t.progress);
      t.mesh.position.copy(pos);
      t.mesh.lookAt(t.target);

      // Trail stretches from origin to current position
      const trailPos = t.origin.clone().lerp(pos, 0.5);
      t.trail.position.copy(trailPos);
      t.trail.lookAt(pos);
      const trailLen = t.origin.distanceTo(pos);
      t.trail.scale.set(1, 1, Math.max(0.01, trailLen / 2));

      // Fade trail as bullet moves
      (t.trail.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - t.progress * 0.7);
    }

    // Fade and remove bullet holes after 3s
    const now = Date.now();
    for (let i = this.bulletHoles.length - 1; i >= 0; i--) {
      const hole = this.bulletHoles[i];
      const age = (now - hole.spawnTime) / 1000;

      if (age > 3) {
        this.scene.remove(hole.mesh);
        hole.mesh.geometry.dispose();
        this.bulletHoles.splice(i, 1);
        continue;
      }

      if (age > 2) {
        (hole.mesh.material as THREE.MeshStandardMaterial).opacity = 0.8 * (1 - (age - 2));
      }
    }
  }

  getIsReloading(): boolean {
    return this.isReloading;
  }

  private createTracer(origin: THREE.Vector3, direction: THREE.Vector3) {
    const range = 80;
    const target = origin.clone().addScaledVector(direction, range);

    // Bullet head (bright dot)
    const bulletGeo = new THREE.SphereGeometry(0.04, 4, 4);
    const bullet = new THREE.Mesh(bulletGeo, this.tracerMat.clone());
    bullet.position.copy(origin);
    this.scene.add(bullet);

    // Trail (stretched cylinder)
    const trailGeo = new THREE.CylinderGeometry(0.015, 0.008, 2, 4);
    trailGeo.rotateX(Math.PI / 2);
    const trail = new THREE.Mesh(trailGeo, this.trailMat.clone());
    trail.position.copy(origin);
    this.scene.add(trail);

    this.tracers.push({
      mesh: bullet,
      trail,
      origin: origin.clone(),
      target,
      progress: 0,
      speed: 5.0,
    });
  }

  private spawnBulletHole(hitPoint: THREE.Vector3, fromOrigin: THREE.Vector3) {
    const holeGeo = new THREE.CircleGeometry(0.06, 8);
    const hole = new THREE.Mesh(holeGeo, this.holeMat.clone());
    hole.position.copy(hitPoint);

    const dir = hitPoint.clone().sub(fromOrigin).normalize();
    hole.lookAt(hitPoint.clone().add(dir));

    // Scorch ring around hole
    const scorchGeo = new THREE.RingGeometry(0.06, 0.15, 8);
    const scorchMat = new THREE.MeshStandardMaterial({
      color: 0x444433,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.9,
    });
    const scorch = new THREE.Mesh(scorchGeo, scorchMat);
    hole.add(scorch);

    this.scene.add(hole);
    this.bulletHoles.push({ mesh: hole, spawnTime: Date.now() });
  }

  private createMuzzleFlash(origin: THREE.Vector3) {
    const light = new THREE.PointLight(0xffaa00, 4, 6);
    light.position.copy(origin);
    this.scene.add(light);

    const flashGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.8 });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(origin);
    this.scene.add(flash);

    setTimeout(() => {
      this.scene.remove(light);
      this.scene.remove(flash);
      light.dispose();
      flashGeo.dispose();
      flashMat.dispose();
    }, 60);
  }

  dispose() {
    this.tracers.forEach((t) => {
      this.scene.remove(t.mesh);
      this.scene.remove(t.trail);
      t.mesh.geometry.dispose();
      t.trail.geometry.dispose();
    });
    this.tracers = [];

    this.bulletHoles.forEach((h) => {
      this.scene.remove(h.mesh);
      h.mesh.geometry.dispose();
    });
    this.bulletHoles = [];
  }
}
