import * as THREE from "three";
import { getMemeTexture } from "./MemeTextureLoader";

const DEG = Math.PI / 180;

function mat(color: number, rough = 0.8, metal = 0.1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

/*
 * Body layout (feet at y=0):
 *   Feet:   y = 0.0
 *   Legs:   y = 0.0 to 0.6   (pivot at top, y=0.6)
 *   Body:   y = 0.6 to 1.25
 *   Head:   y = 1.25 to 1.95
 *   Arms:   pivot at y=1.2 (shoulder)
 */

export class HunterModel {
  readonly group: THREE.Group;

  private head: THREE.Mesh;
  private body: THREE.Mesh;
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private armL: THREE.Mesh;
  private armRGroup: THREE.Group;
  private armR: THREE.Mesh;
  private gun: THREE.Group;

  private memeId: string;
  private bodyColor: number;
  private isMoving = false;
  private isJumping = false;
  private isCrouching = false;
  private isShooting = false;
  private shootTimer = 0;
  private animTime = 0;
  private crouchAmount = 0;

  constructor(memeId: string = "default", bodyColor?: number) {
    this.memeId = memeId;
    this.bodyColor = bodyColor || this.randomBodyColor();
    this.group = new THREE.Group();

    this.head = this.createHead();
    this.body = this.createBody();
    this.legL = this.createLeg(-0.13);
    this.legR = this.createLeg(0.13);
    this.armL = this.createArm(-0.32);
    this.armRGroup = new THREE.Group();
    this.armR = this.createArmRight();
    this.gun = this.createGun();

    this.armRGroup.add(this.armR);
    this.armRGroup.add(this.gun);
    this.armRGroup.position.set(0.32, 1.2, 0);

    this.group.add(this.head);
    this.group.add(this.body);
    this.group.add(this.legL);
    this.group.add(this.legR);
    this.group.add(this.armL);
    this.group.add(this.armRGroup);

    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }

  private randomBodyColor(): number {
    const colors = [0x3366cc, 0xcc3333, 0x33aa55, 0xcc8833, 0x8833cc, 0x33cccc, 0xcc3388, 0x88cc33];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private createHead(): THREE.Mesh {
    const geo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const texture = getMemeTexture(this.memeId);

    // Use same texture reference (not clone) so GIF animation updates all faces
    const faceMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
    const materials = [faceMat, faceMat, faceMat, faceMat, faceMat, faceMat];

    const mesh = new THREE.Mesh(geo, materials);
    mesh.position.set(0, 1.6, 0);
    return mesh;
  }

  private createBody(): THREE.Mesh {
    const geo = new THREE.BoxGeometry(0.5, 0.65, 0.3);
    const mesh = new THREE.Mesh(geo, mat(this.bodyColor));
    mesh.position.set(0, 0.93, 0);
    return mesh;
  }

  private createLeg(xOffset: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(0.17, 0.6, 0.18);
    geo.translate(0, -0.3, 0);
    const mesh = new THREE.Mesh(geo, mat(0x333344));
    mesh.position.set(xOffset, 0.6, 0);
    return mesh;
  }

  private createArm(xOffset: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(0.13, 0.5, 0.13);
    geo.translate(0, -0.25, 0);
    const mesh = new THREE.Mesh(geo, mat(this.bodyColor, 0.85, 0.05));
    mesh.position.set(xOffset, 1.2, 0);
    return mesh;
  }

  private createArmRight(): THREE.Mesh {
    const geo = new THREE.BoxGeometry(0.13, 0.5, 0.13);
    geo.translate(0, -0.25, 0);
    const mesh = new THREE.Mesh(geo, mat(this.bodyColor, 0.85, 0.05));
    mesh.position.set(0, 0, 0);
    return mesh;
  }

  private createGun(): THREE.Group {
    const g = new THREE.Group();
    const gunMat = mat(0x2a2a2a, 0.4, 0.7);
    const gripMat = mat(0x443322, 0.9, 0.05);
    const metalMat = mat(0x555555, 0.3, 0.8);

    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.45), gunMat);
    bodyMesh.position.set(0, 0, -0.15);
    g.add(bodyMesh);

    const barrelGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.22, 8);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, metalMat);
    barrel.position.set(0, 0.02, -0.47);
    g.add(barrel);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), gripMat);
    grip.position.set(0, -0.1, -0.05);
    grip.rotation.x = 15 * DEG;
    g.add(grip);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.04), gunMat);
    mag.position.set(0, -0.12, -0.18);
    g.add(mag);

    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.1), metalMat);
    scope.position.set(0, 0.065, -0.2);
    g.add(scope);

    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.015, 4, 4), flashMat);
    flash.name = "muzzleFlash";
    flash.position.set(0, 0.02, -0.58);
    g.add(flash);

    g.position.set(0.05, -0.15, -0.1);
    g.rotation.x = -5 * DEG;
    return g;
  }

  setMeme(memeId: string) {
    this.memeId = memeId;
    const texture = getMemeTexture(memeId);
    const faceMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
    this.head.material = [faceMat, faceMat, faceMat, faceMat, faceMat, faceMat];
  }

  setMoving(moving: boolean) {
    this.isMoving = moving;
  }

  setJumping(jumping: boolean) {
    this.isJumping = jumping;
  }

  setCrouching(crouching: boolean) {
    this.isCrouching = crouching;
  }

  triggerShoot() {
    this.isShooting = true;
    this.shootTimer = 0.15;
  }

  update(dt: number) {
    this.animTime += dt;

    // Smooth crouch transition
    const targetCrouch = this.isCrouching ? 1 : 0;
    this.crouchAmount += (targetCrouch - this.crouchAmount) * Math.min(1, dt * 10);

    if (this.isJumping) {
      this.animateJump();
    } else if (this.isCrouching) {
      this.animateCrouch();
    } else if (this.isMoving) {
      this.animateWalk();
    } else {
      this.animateIdle();
    }

    // Apply crouch compression to body parts
    const crouch = this.crouchAmount;
    if (crouch > 0.01) {
      this.head.position.y = 1.6 - crouch * 0.65;
      this.body.position.y = 0.93 - crouch * 0.3;
      this.armRGroup.position.y = 1.2 - crouch * 0.3;
      this.armL.position.y = 1.2 - crouch * 0.3;
    }

    if (this.shootTimer > 0) {
      this.animateShoot();
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.isShooting = false;
      }
    }
  }

  private animateIdle() {
    const t = this.animTime;
    this.body.rotation.z = Math.sin(t * 1.5) * 1.5 * DEG;
    this.head.rotation.z = Math.sin(t * 1.2 + 0.5) * 1 * DEG;
    this.legL.rotation.x = 0;
    this.legR.rotation.x = 0;
    this.armL.rotation.x = Math.sin(t * 1.3) * 2 * DEG;
    this.armRGroup.rotation.x = -15 * DEG;
  }

  private animateWalk() {
    const t = this.animTime;
    const freq = 10;

    this.legL.rotation.x = Math.sin(t * freq) * 30 * DEG;
    this.legR.rotation.x = Math.sin(t * freq + Math.PI) * 30 * DEG;
    this.armL.rotation.x = Math.sin(t * freq + Math.PI) * 20 * DEG;
    this.armRGroup.rotation.x = -15 * DEG + Math.sin(t * freq) * 8 * DEG;
    this.body.rotation.z = Math.sin(t * freq * 0.5) * 2 * DEG;
    this.head.position.y = 1.6 + Math.abs(Math.sin(t * freq)) * 0.02;
  }

  private animateCrouch() {
    const t = this.animTime;
    this.legL.rotation.x = -55 * DEG;
    this.legR.rotation.x = -55 * DEG;
    this.body.rotation.x = 10 * DEG;
    this.body.rotation.z = Math.sin(t * 1.0) * 1 * DEG;
    this.armL.rotation.x = -20 * DEG;
    this.armRGroup.rotation.x = -25 * DEG;
    this.head.rotation.z = Math.sin(t * 0.8) * 1 * DEG;
  }

  private animateJump() {
    this.legL.rotation.x = -35 * DEG;
    this.legR.rotation.x = -25 * DEG;
    this.armL.rotation.x = -40 * DEG;
    this.armL.rotation.z = -20 * DEG;
    this.armRGroup.rotation.x = -30 * DEG;
  }

  private animateShoot() {
    const recoil = this.shootTimer / 0.15;
    this.gun.position.z = -0.1 + recoil * 0.06;
    this.gun.rotation.x = -5 * DEG - recoil * 8 * DEG;

    const flash = this.gun.getObjectByName("muzzleFlash") as THREE.Mesh;
    if (flash) {
      const fm = flash.material as THREE.MeshBasicMaterial;
      fm.opacity = recoil > 0.5 ? 1 : 0;
      flash.scale.setScalar(1 + recoil * 3);
    }
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
