import * as THREE from "three";
import {
  HUNTER_GRENADE_THROW_SPEED,
  HUNTER_GRENADE_UP_BOOST,
  HUNTER_GRENADE_GRAVITY,
} from "@catch-and-run/shared";

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  type?: 'fire' | 'smoke' | 'debris' | 'spark';
}

interface ScanPulse {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxRadius: number;
}

interface GrenadeProjectile {
  mesh: THREE.Mesh;
  trail: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface ExplosionFlash {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
}

interface Shockwave {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private particles: Particle[] = [];
  private pool: THREE.Mesh[] = [];
  private scanPulses: ScanPulse[] = [];
  private grenades: GrenadeProjectile[] = [];
  private explosionFlashes: ExplosionFlash[] = [];
  private shockwaves: Shockwave[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const geo = new THREE.SphereGeometry(0.03, 4, 4);
    for (let i = 0; i < 100; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.pool.push(mesh);
    }
  }

  spawnImpact(position: THREE.Vector3, count = 5) {
    for (let i = 0; i < count; i++) {
      const mesh = this.pool.find((p) => !p.visible);
      if (!mesh) break;

      mesh.visible = true;
      mesh.position.copy(position);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.color.setHex(0xffaa00);
      material.opacity = 1;
      material.blending = THREE.NormalBlending;

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3,
        (Math.random() - 0.5) * 4
      );

      this.particles.push({ mesh, velocity: vel, life: 0, maxLife: 0.4 });
    }
  }

  spawnScanPulse(position: THREE.Vector3, maxRadius: number) {
    const geo = new THREE.RingGeometry(0.3, 0.6, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ddff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.position.y += 0.15;
    mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    this.scanPulses.push({ mesh, material: mat, life: 0, maxRadius });
  }

  spawnGrenade(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    flightTime: number,
  ) {
    const grenadeMat = new THREE.MeshStandardMaterial({
      color: 0x3a5a2a, roughness: 0.6, metalness: 0.3,
    });
    const grenadeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      grenadeMat
    );
    grenadeMesh.position.copy(origin);
    grenadeMesh.castShadow = true;
    this.scene.add(grenadeMesh);

    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x888888, transparent: true, opacity: 0.3,
    });
    const trail = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 4, 4),
      trailMat
    );
    trail.visible = false;
    this.scene.add(trail);

    const normDir = dir.clone().normalize();
    const velocity = new THREE.Vector3(
      normDir.x * HUNTER_GRENADE_THROW_SPEED,
      normDir.y * HUNTER_GRENADE_THROW_SPEED + HUNTER_GRENADE_UP_BOOST,
      normDir.z * HUNTER_GRENADE_THROW_SPEED
    );

    this.grenades.push({
      mesh: grenadeMesh,
      trail,
      velocity,
      life: 0,
      maxLife: flightTime,
    });
  }

  spawnExplosion(position: THREE.Vector3) {
    const pos = position.clone();
    if (pos.y < 0.1) pos.y = 0.1;

    // Central flash sphere (bright expanding ball)
    const flashGeo = new THREE.SphereGeometry(0.3, 12, 8);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffcc,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    flashMesh.position.copy(pos);
    this.scene.add(flashMesh);
    this.explosionFlashes.push({ mesh: flashMesh, material: flashMat, life: 0 });

    // Ground shockwave ring
    const ringGeo = new THREE.RingGeometry(0.2, 0.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.copy(pos);
    ringMesh.position.y = 0.05;
    ringMesh.rotation.x = -Math.PI / 2;
    this.scene.add(ringMesh);
    this.shockwaves.push({ mesh: ringMesh, material: ringMat, life: 0 });

    // Fire particles (bright orange/yellow, fast)
    for (let i = 0; i < 25; i++) {
      const mesh = this.pool.find((p) => !p.visible);
      if (!mesh) break;

      mesh.visible = true;
      mesh.position.copy(pos);
      mesh.scale.setScalar(1 + Math.random() * 1.5);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.9;
      material.depthWrite = false;
      material.blending = THREE.AdditiveBlending;
      const colors = [0xff4400, 0xff6600, 0xff8800, 0xffaa00, 0xffcc00];
      material.color.setHex(
        colors[Math.floor(Math.random() * colors.length)]
      );

      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 6;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.random() * 8 + 4,
        Math.sin(angle) * speed
      );

      this.particles.push({ mesh, velocity: vel, life: 0, maxLife: 0.5 + Math.random() * 0.3, type: 'fire' });
    }

    // Smoke particles (gray, slower, longer lasting)
    for (let i = 0; i < 10; i++) {
      const mesh = this.pool.find((p) => !p.visible);
      if (!mesh) break;

      mesh.visible = true;
      mesh.position.copy(pos);
      mesh.position.y += Math.random() * 0.5;
      mesh.scale.setScalar(0.8 + Math.random() * 0.6);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.color.setHex(0x7a7f84 + Math.floor(Math.random() * 0x181818));
      material.opacity = 0.24;
      material.depthWrite = false;
      material.blending = THREE.NormalBlending;

      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.random() * 4 + 2,
        Math.sin(angle) * speed
      );

      this.particles.push({ mesh, velocity: vel, life: 0, maxLife: 0.8 + Math.random() * 0.4, type: 'smoke' });
    }

    // Debris particles (dark, falling fast)
    for (let i = 0; i < 12; i++) {
      const mesh = this.pool.find((p) => !p.visible);
      if (!mesh) break;

      mesh.visible = true;
      mesh.position.copy(pos);
      mesh.scale.setScalar(0.5 + Math.random() * 0.5);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.color.setHex(0x4b4038);
      material.opacity = 0.8;
      material.depthWrite = false;
      material.blending = THREE.NormalBlending;

      const angle = Math.random() * Math.PI * 2;
      const speed = 6 + Math.random() * 8;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.random() * 10 + 5,
        Math.sin(angle) * speed
      );

      this.particles.push({ mesh, velocity: vel, life: 0, maxLife: 0.8 + Math.random() * 0.4, type: 'debris' });
    }

    // Sparks (tiny, very fast)
    for (let i = 0; i < 20; i++) {
      const mesh = this.pool.find((p) => !p.visible);
      if (!mesh) break;

      mesh.visible = true;
      mesh.position.copy(pos);
      mesh.scale.setScalar(0.3 + Math.random() * 0.3);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.color.setHex(0xffff88);
      material.opacity = 1;
      material.depthWrite = false;
      material.blending = THREE.AdditiveBlending;

      const angle = Math.random() * Math.PI * 2;
      const elevation = Math.random() * Math.PI * 0.5;
      const speed = 10 + Math.random() * 15;
      const vel = new THREE.Vector3(
        Math.cos(angle) * Math.cos(elevation) * speed,
        Math.sin(elevation) * speed,
        Math.sin(angle) * Math.cos(elevation) * speed
      );

      this.particles.push({ mesh, velocity: vel, life: 0, maxLife: 0.3 + Math.random() * 0.2, type: 'spark' });
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        p.mesh.visible = false;
        p.mesh.scale.setScalar(1);
        this.particles.splice(i, 1);
        continue;
      }

      const t = p.life / p.maxLife;
      const gravity = p.type === 'smoke' ? 2 : (p.type === 'spark' ? 5 : 12);
      p.velocity.y -= gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);

      if (p.type === 'smoke') {
        p.mesh.scale.multiplyScalar(1 + dt * 0.7);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.24 * (1 - t);
      } else if (p.type === 'fire') {
        p.mesh.scale.multiplyScalar(1 - dt * 1.5);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t * t;
      } else {
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      }
    }

    // Update explosion flashes
    for (let i = this.explosionFlashes.length - 1; i >= 0; i--) {
      const f = this.explosionFlashes[i];
      f.life += dt;
      const duration = 0.25;
      const t = f.life / duration;

      if (t >= 1) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.material.dispose();
        this.explosionFlashes.splice(i, 1);
        continue;
      }

      const scale = 1 + t * 8;
      f.mesh.scale.setScalar(scale);
      f.material.opacity = 1 - t * t;
      const colorT = Math.min(1, t * 2);
      f.material.color.setRGB(1, 1 - colorT * 0.5, 1 - colorT);
    }

    // Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life += dt;
      const duration = 0.4;
      const t = s.life / duration;

      if (t >= 1) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.material.dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }

      const scale = 1 + t * 12;
      s.mesh.scale.setScalar(scale);
      s.material.opacity = 0.8 * (1 - t);
    }

    for (let i = this.scanPulses.length - 1; i >= 0; i--) {
      const pulse = this.scanPulses[i];
      pulse.life += dt;
      const progress = Math.min(1, pulse.life / 0.8);
      const scale = 0.5 + progress * (pulse.maxRadius / 0.6);
      pulse.mesh.scale.set(scale, scale, 1);
      pulse.material.opacity = 0.7 * (1 - progress);
      if (progress >= 1) {
        this.scene.remove(pulse.mesh);
        pulse.mesh.geometry.dispose();
        pulse.material.dispose();
        this.scanPulses.splice(i, 1);
      }
    }

    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.life += dt;

      g.velocity.y += HUNTER_GRENADE_GRAVITY * dt;
      g.mesh.position.addScaledVector(g.velocity, dt);
      g.mesh.rotation.x += dt * 8;
      g.mesh.rotation.z += dt * 5;

      if (g.life >= g.maxLife || g.mesh.position.y <= 0) {
        this.scene.remove(g.mesh);
        this.scene.remove(g.trail);
        g.mesh.geometry.dispose();
        (g.mesh.material as THREE.Material).dispose();
        g.trail.geometry.dispose();
        (g.trail.material as THREE.Material).dispose();
        this.grenades.splice(i, 1);
      }
    }
  }

  dispose() {
    this.particles.forEach((p) => {
      p.mesh.visible = false;
      p.mesh.scale.setScalar(1);
    });
    this.particles = [];

    this.scanPulses.forEach((p) => {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.material.dispose();
    });
    this.scanPulses = [];

    this.grenades.forEach((g) => {
      this.scene.remove(g.mesh);
      this.scene.remove(g.trail);
      g.mesh.geometry.dispose();
      (g.mesh.material as THREE.Material).dispose();
      g.trail.geometry.dispose();
      (g.trail.material as THREE.Material).dispose();
    });
    this.grenades = [];

    this.explosionFlashes.forEach((f) => {
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      f.material.dispose();
    });
    this.explosionFlashes = [];

    this.shockwaves.forEach((s) => {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.material.dispose();
    });
    this.shockwaves = [];
  }
}
