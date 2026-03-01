import * as THREE from "three";
import { InterpolationBuffer } from "../../network/InterpolationBuffer";
import type { PropRegistry } from "../world/PropRegistry";
import { HunterModel } from "./HunterModel";

export class PlayerEntity {
  readonly sessionId: string;
  readonly group: THREE.Group;
  private body: THREE.Mesh;
  private nameSprite: THREE.Sprite;
  private propMesh: THREE.Mesh | null = null;
  private hunterModel: HunterModel | null = null;
  private interpolation: InterpolationBuffer;
  private role: string = "prop";
  private propId: string = "";
  private memeId: string = "default";
  private propRegistry: PropRegistry;
  private isLocalPlayer: boolean;
  private prevPos = new THREE.Vector3();
  private wasMoving = false;
  private stunStars: THREE.Group | null = null;
  private stunTimer = 0;
  private stunDuration = 0;
  private highlighted = false;
  private highlightTimer = 0;

  constructor(sessionId: string, nickname: string, propRegistry: PropRegistry, isLocal: boolean, memeId: string = "default") {
    this.sessionId = sessionId;
    this.propRegistry = propRegistry;
    this.isLocalPlayer = isLocal;
    this.memeId = memeId;
    this.interpolation = new InterpolationBuffer();
    this.group = new THREE.Group();

    const bodyGeo = new THREE.CapsuleGeometry(0.3, 1.0, 4, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.6 });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = 0.8;
    this.body.castShadow = true;
    this.group.add(this.body);

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.roundRect(0, 0, 256, 64, 10);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(nickname, 128, 40);

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    this.nameSprite = new THREE.Sprite(spriteMat);
    this.nameSprite.position.y = 2.5;
    this.nameSprite.scale.set(2, 0.5, 1);
    this.group.add(this.nameSprite);

    if (isLocal) {
      this.group.visible = false;
    }
  }

  updateFromServer(x: number, y: number, z: number, rotY: number, role: string, propId: string, isAlive: boolean, memeId?: string) {
    if (this.isLocalPlayer) return;

    this.interpolation.push(x, y, z, rotY);

    if (memeId && memeId !== this.memeId) {
      this.memeId = memeId;
      if (this.hunterModel) {
        this.hunterModel.setMeme(memeId);
      }
    }

    if (role !== this.role || propId !== this.propId) {
      this.role = role;
      this.propId = propId;
      this.updateAppearance();
    }

    this.group.visible = isAlive;
  }

  setNameVisible(visible: boolean) {
    this.nameSprite.visible = visible;
  }

  getRole(): string {
    return this.role;
  }

  updateVisual(dt?: number) {
    if (this.isLocalPlayer) return;
    const d = dt || 0.016;

    const interp = this.interpolation.getInterpolated();
    if (interp) {
      this.group.position.set(interp.x, interp.y, interp.z);
      this.group.rotation.y = interp.rotY;

      if (this.hunterModel) {
        const dx = interp.x - this.prevPos.x;
        const dz = interp.z - this.prevPos.z;
        const speed = Math.sqrt(dx * dx + dz * dz) / d;
        const isMoving = speed > 0.5;
        this.hunterModel.setMoving(isMoving);
        this.hunterModel.update(d);
        this.prevPos.set(interp.x, interp.y, interp.z);
      }
    }

    if (this.stunStars) {
      this.stunTimer += d;
      if (this.stunTimer >= this.stunDuration) {
        this.clearStunEffect();
      } else {
        this.stunStars.rotation.y += d * 4;
        this.stunStars.children.forEach((star, i) => {
          star.position.y = Math.sin(this.stunTimer * 6 + i) * 0.08;
        });
      }
    }

    if (this.highlighted) {
      this.highlightTimer += d;
      if (this.highlightTimer >= 3.0) {
        this.setHighlighted(false);
      }
    }
  }

  showStunEffect(durationMs: number) {
    this.clearStunEffect();
    this.stunStars = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 5; i++) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), mat);
      const angle = (i / 5) * Math.PI * 2;
      star.position.set(Math.cos(angle) * 0.5, 0, Math.sin(angle) * 0.5);
      this.stunStars.add(star);
    }
    this.stunStars.position.y = 2.3;
    this.group.add(this.stunStars);
    this.stunTimer = 0;
    this.stunDuration = durationMs / 1000;
  }

  clearStunEffect() {
    if (!this.stunStars) return;
    this.group.remove(this.stunStars);
    this.stunStars.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.stunStars = null;
    this.stunTimer = 0;
  }

  setHighlighted(on: boolean) {
    this.highlighted = on;
    if (on) this.highlightTimer = 0;
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh && !(child instanceof THREE.Sprite)) {
        const mat = child.material;
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.emissive.setHex(on ? 0xff2222 : 0x000000);
          mat.emissiveIntensity = on ? 0.8 : 0;
          mat.needsUpdate = true;
        }
      }
    });
  }

  private updateAppearance() {
    if (this.propMesh) {
      this.group.remove(this.propMesh);
      this.propMesh.geometry.dispose();
      if (Array.isArray(this.propMesh.material)) {
        this.propMesh.material.forEach((m) => m.dispose());
      } else {
        (this.propMesh.material).dispose();
      }
      this.propMesh = null;
    }

    if (this.hunterModel) {
      this.group.remove(this.hunterModel.group);
      this.hunterModel.dispose();
      this.hunterModel = null;
    }

    if (this.role === "hunter") {
      this.body.visible = false;
      this.hunterModel = new HunterModel(this.memeId);
      this.group.add(this.hunterModel.group);
      this.nameSprite.position.y = 2.6;
    } else if (this.role === "prop" && this.propId) {
      this.body.visible = false;
      const mesh = this.propRegistry.createMesh(this.propId);
      if (mesh) {
        this.propMesh = mesh;
        this.group.add(mesh);
      }
      this.nameSprite.position.y = 2.2;
    } else {
      this.body.visible = true;
      const m = this.body.material as THREE.MeshStandardMaterial;
      m.color.setHex(0x4488ff);
      this.nameSprite.position.y = 2.2;
    }
  }

  dispose(scene: THREE.Scene) {
    this.clearStunEffect();
    scene.remove(this.group);
    this.body.geometry.dispose();
    (this.body.material as THREE.Material).dispose();
    if (this.propMesh) {
      this.propMesh.geometry.dispose();
      if (Array.isArray(this.propMesh.material)) {
        this.propMesh.material.forEach((m) => m.dispose());
      } else {
        (this.propMesh.material).dispose();
      }
    }
    if (this.hunterModel) {
      this.hunterModel.dispose();
    }
    this.nameSprite.material.dispose();
    (this.nameSprite.material).map?.dispose();
  }
}
