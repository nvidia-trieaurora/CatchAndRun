import * as THREE from "three";
import { NetworkManager } from "../network/NetworkManager";
import { InputManager } from "../input/InputManager";
import { ClientConfig } from "../config/ClientConfig";
import { UIManager } from "../ui/UIManager";
import { MainMenuUI } from "../ui/screens/MainMenuUI";
import { RoomLobbyUI } from "../ui/screens/RoomLobbyUI";
import { GameHUD } from "../ui/screens/GameHUD";
import { ResultsUI } from "../ui/screens/ResultsUI";
import { SettingsPanel } from "../ui/components/SettingsPanel";
import { Minimap } from "../ui/components/Minimap";
import { buildOldHarborFortniteMap } from "./world/maps/oldHarborFortnite";
import { createFortniteLighting } from "./world/lighting/fortniteLighting";
import { PropRegistry } from "./world/PropRegistry";
import { HunterController } from "./controllers/HunterController";
import { PropController } from "./controllers/PropController";
import { SpectatorController } from "./controllers/SpectatorController";
import { WeaponSystem } from "./systems/WeaponSystem";
import { PropTransformSystem } from "./systems/PropTransformSystem";
import { AudioSystem } from "./systems/AudioSystem";
import { ParticleSystem } from "./systems/ParticleSystem";
import { PlayerEntity } from "./entities/PlayerEntity";
import { loadMemeManifest, preloadMemeTextures } from "./entities/MemeTextureLoader";
import {
  GamePhase,
  PlayerRole,
  ClientMessage,
  ServerMessage,
  WEAPON_MAX_AMMO,
  HUNTER_MAX_HEALTH,
  PROP_MAX_HEALTH,
  CLIENT_SEND_RATE,
  HUNTER_GRENADE_COOLDOWN_MS,
  HUNTER_SCAN_COOLDOWN_MS,
  HUNTER_GRENADE_STUN_MS,
} from "@catch-and-run/shared";
import mapDataJson from "./world/harbor-warehouse.json";

export class GameManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;

  private network: NetworkManager;
  private input: InputManager;
  private config: ClientConfig;
  private uiManager: UIManager;

  private mainMenu!: MainMenuUI;
  private roomLobby!: RoomLobbyUI;
  private gameHUD!: GameHUD;
  private resultsUI!: ResultsUI;
  private settingsPanel!: SettingsPanel;

  private propRegistry: PropRegistry;
  private weaponSystem!: WeaponSystem;
  private propTransformSystem!: PropTransformSystem;
  private audioSystem!: AudioSystem;
  private particleSystem!: ParticleSystem;

  private hunterController!: HunterController;
  private propController!: PropController;
  private spectatorController!: SpectatorController;

  private playerEntities = new Map<string, PlayerEntity>();
  private colliders: THREE.Box3[] = [];
  private gateColliderIndex = -1;
  private gateCollider: THREE.Box3 | null = null;
  private gateMesh: THREE.Mesh | null = null;

  private localRole: string = PlayerRole.PROP;
  private localHealth = 100;
  private localAmmo = 12;
  private localIsAlive = true;
  private localPropId = "";
  private localIsLocked = false;
  private lastAbilityTime = 0;
  private fpGun: THREE.Group | null = null;
  private speedBoostEnd = 0;
  private speedBoostSmoke = 0;
  private invisibleEnd = 0;
  private lastAbility2Time = 0;
  private currentPhase: string = GamePhase.WAITING;
  private mapBuilt = false;
  private invisibleProps = new Set<string>();
  private grenadeMode = false;
  private fpGrenade: THREE.Group | null = null;
  private lastGrenadeTime = 0;
  private lastScanTime = 0;

  private inputSeq = 0;
  private lastSendTime = 0;
  private sendInterval = 1000 / CLIENT_SEND_RATE;
  private ferrisWheel: THREE.Group | null = null;
  private minimap: Minimap;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
    this.camera.position.set(0, 10, 20);
    this.scene.add(this.camera);
    this.clock = new THREE.Clock();

    this.network = new NetworkManager();
    this.input = new InputManager(canvas);
    this.config = new ClientConfig();
    this.uiManager = new UIManager();
    this.minimap = new Minimap();
    document.getElementById("ui-root")!.appendChild(this.minimap.element);
    this.propRegistry = new PropRegistry();
    this.propRegistry.loadFromMapData(mapDataJson.props as any);

    void loadMemeManifest().then((memes) => preloadMemeTextures(memes));

    this.setupUI();

    window.addEventListener("resize", () => this.onResize());

    document.addEventListener("click", () => {
      if (this.currentPhase === GamePhase.ACTIVE || this.currentPhase === GamePhase.HIDING) {
        if (!this.input.isPointerLocked() && this.localIsAlive) {
          this.input.requestPointerLock();
        }
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.settingsPanel.isVisible()) {
        this.settingsPanel.toggle();
      } else if (e.key === "Escape" && this.input.isPointerLocked()) {
        this.input.exitPointerLock();
      }
    });

    this.uiManager.showScreen("mainMenu");
    this.animate();
  }

  private setupUI() {
    this.mainMenu = new MainMenuUI({
      onQuickJoin: (nickname) => void this.quickJoin(nickname),
      onCreate: (nickname, roomName, isPrivate) => void this.createRoom(nickname, roomName, isPrivate),
      onJoinCode: (nickname, code) => void this.joinByCode(nickname, code),
    });

    this.roomLobby = new RoomLobbyUI({
      onReady: () => this.network.send(ClientMessage.READY_TOGGLE),
      onStart: () => this.network.send(ClientMessage.START_GAME),
      onLeave: () => this.leaveRoom(),
      onChat: (msg) => this.network.send(ClientMessage.CHAT, { message: msg }),
      onConfigChange: (cfg) => this.network.send(ClientMessage.SET_CONFIG, cfg),
      onSelectMeme: (memeId) => this.network.send(ClientMessage.SELECT_MEME, { memeId }),
    });

    this.gameHUD = new GameHUD();

    this.resultsUI = new ResultsUI(() => {
      this.uiManager.showScreen("roomLobby");
    });

    this.settingsPanel = new SettingsPanel(this.config);
    document.getElementById("ui-root")!.appendChild(this.settingsPanel.element);

    this.uiManager.registerScreen("mainMenu", this.mainMenu.element);
    this.uiManager.registerScreen("roomLobby", this.roomLobby.element);
    this.uiManager.registerScreen("gameHUD", this.gameHUD.element);
    this.uiManager.registerScreen("results", this.resultsUI.element);
  }



  private latestRoomState: any = null;

  private handleRoomStateMessage(data: any) {
    this.latestRoomState = data;

    const newPhase = data.phase as string;
    if (newPhase && newPhase !== this.currentPhase) {
      this.onPhaseChange(this.currentPhase, newPhase);
      this.currentPhase = newPhase;
    }

    // Update local player data
    const selfData = data.players?.find((p: any) => p.sessionId === this.network.getSessionId());
    if (selfData) {
      this.localRole = selfData.role;
      this.localHealth = selfData.health;
      this.localAmmo = selfData.ammo;
      this.localIsAlive = selfData.isAlive;
      this.localIsLocked = selfData.isLocked;

      if (selfData.currentPropId && selfData.currentPropId !== this.localPropId && this.propTransformSystem) {
        this.localPropId = selfData.currentPropId;
        const pos = this.propController?.getPosition() || new THREE.Vector3();
        const mesh = this.propTransformSystem.transform(this.localPropId, pos);
        this.propController?.setPropMesh(mesh);
      }
      if (!selfData.currentPropId) {
        this.localPropId = "";
      }
    }

    // Sync 3D entities for remote players
    if (data.players && this.mapBuilt) {
      const currentIds = new Set<string>();
      for (const p of data.players) {
        currentIds.add(p.sessionId);
        let entity = this.playerEntities.get(p.sessionId);
        if (!entity) {
          const isLocal = p.sessionId === this.network.getSessionId();
          entity = new PlayerEntity(p.sessionId, p.nickname, this.propRegistry, isLocal, p.memeId || "default");
          this.scene.add(entity.group);
          this.playerEntities.set(p.sessionId, entity);
        }
        entity.updateFromServer(p.x, p.y, p.z, p.rotY, p.role, p.currentPropId, p.isAlive, p.memeId);
        if (this.localRole === PlayerRole.HUNTER && this.invisibleProps.has(p.sessionId)) {
          entity.group.visible = false;
        }
        if (this.localRole === PlayerRole.HUNTER && p.role === PlayerRole.PROP) {
          entity.setNameVisible(false);
        } else {
          entity.setNameVisible(true);
        }
      }
      // Remove disconnected players
      for (const [sid, entity] of this.playerEntities) {
        if (!currentIds.has(sid)) {
          entity.dispose(this.scene);
          this.playerEntities.delete(sid);
        }
      }
    }

    // Update lobby UI
    this.gameHUD.updateTimer(data.timer || 0);
    this.gameHUD.updatePhase(data.phase || "waiting");

    if (data.roomCode) {
      this.roomLobby.setRoomCode(data.roomCode);
    }

    if (this.currentPhase === GamePhase.WAITING || this.currentPhase === GamePhase.COUNTDOWN) {
      const lobbyPlayers = (data.players || []).map((p: any) => ({
        sessionId: p.sessionId,
        nickname: p.nickname,
        isReady: p.isReady,
        isHost: p.isHost,
        memeId: p.memeId,
      }));
      this.roomLobby.updatePlayerList(lobbyPlayers, this.network.getSessionId());

      if (selfData) {
        this.roomLobby.setIsHost(selfData.isHost);
        this.roomLobby.setReadyState(selfData.isReady);
      }
    }

    const chatMsgs = (data.chat || []).map((m: any) => ({
      sender: m.sender,
      message: m.message,
    }));
    this.roomLobby.updateChat(chatMsgs);
  }

  private onPhaseChange(oldPhase: string, newPhase: string) {
    switch (newPhase) {
      case GamePhase.COUNTDOWN:
        this.uiManager.showScreen("roomLobby");
        this.uiManager.showNotification("Match starting!");
        this.speak("Game starting. Get ready!");
        break;

      case GamePhase.HIDING:
        this.invisibleProps.clear();
        this.buildMapIfNeeded();
        this.initControllers();
        this.uiManager.showScreen("gameHUD");
        this.gameHUD.updateRole(this.localRole);
        if (this.localRole === PlayerRole.PROP) {
          this.uiManager.showNotification("You are a PROP! HIDE NOW!");
          this.speak("You are a prop! Hide quickly!");
          setTimeout(() => this.input.requestPointerLock(), 500);
        } else {
          this.uiManager.showNotification("You are a HUNTER! Waiting...");
          this.speak("You are a hunter. Wait for the hunt to begin.");
          setTimeout(() => this.input.requestPointerLock(), 500);
        }
        break;

      case GamePhase.ACTIVE:
        this.gameHUD.updateRole(this.localRole);
        // Open the gate -- remove gate collider so hunters can leave
        if (this.gateCollider && this.gateColliderIndex >= 0) {
          const idx = this.colliders.indexOf(this.gateCollider);
          if (idx >= 0) this.colliders.splice(idx, 1);
          this.gateCollider = null;
        }
        if (this.gateMesh) {
          this.gateMesh.visible = false;
          this.gateMesh = null;
        }
        if (this.localRole === PlayerRole.HUNTER) {
          // Sync hunter position from server when released from jail
          const selfNow = this.latestRoomState?.players?.find(
            (p: any) => p.sessionId === this.network.getSessionId()
          );
          if (selfNow) {
            this.hunterController.setPosition(selfNow.x, selfNow.y, selfNow.z);
          } else {
            this.hunterController.setPosition(-36, 0.1, 0);
          }
          this.uiManager.showNotification("HUNT! Find and eliminate all props!");
          this.speak("Gate open! Hunt them down!");
        } else {
          this.speak("Hunters released! Stay hidden!");
        }
        setTimeout(() => this.input.requestPointerLock(), 500);
        break;

      case GamePhase.ROUND_END:
        break;

      case GamePhase.MATCH_END:
        this.input.exitPointerLock();
        break;

      case GamePhase.WAITING:
        this.uiManager.showScreen("roomLobby");
        this.input.exitPointerLock();
        this.clearGameEntities();
        break;
    }
  }

  private buildMapIfNeeded() {
    if (this.mapBuilt) return;
    this.mapBuilt = true;

    createFortniteLighting(this.scene, this.renderer);
    const mapResult = buildOldHarborFortniteMap(this.scene, mapDataJson as any);
    this.colliders = mapResult.colliders;
    this.gateColliderIndex = mapResult.gateColliderIndex;
    this.gateCollider = this.colliders[this.gateColliderIndex] || null;
    this.gateMesh = mapResult.gateMesh;
    this.ferrisWheel = mapResult.ferrisWheel;

    this.weaponSystem = new WeaponSystem(this.scene);
    this.propTransformSystem = new PropTransformSystem(this.scene, this.propRegistry);
    this.audioSystem = new AudioSystem(this.camera);
    this.particleSystem = new ParticleSystem(this.scene);
  }

  private initControllers() {
    this.hunterController = new HunterController(this.camera, this.input, this.config);
    this.propController = new PropController(this.camera, this.input, this.config);
    this.spectatorController = new SpectatorController(this.camera, this.input);

    // Clean up old transform mesh
    this.propTransformSystem?.dispose();

    const selfData = this.latestRoomState?.players?.find(
      (p: any) => p.sessionId === this.network.getSessionId()
    );

    const spawnX = selfData?.x ?? 5;
    const spawnY = selfData?.y ?? 0;
    const spawnZ = selfData?.z ?? 5;

    // Always remove old gun first
    if (this.fpGun) {
      this.camera.remove(this.fpGun);
      this.fpGun = null;
    }

    // Use server role if available (more reliable than localRole which may lag)
    const actualRole = selfData?.role || this.localRole;

    if (actualRole === PlayerRole.HUNTER) {
      this.hunterController.setPosition(spawnX, spawnY, spawnZ);
      this.createFirstPersonGun();
    } else {
      // Extra safety: ensure no gun for prop
      if (this.fpGun) { this.camera.remove(this.fpGun); this.fpGun = null; }
      this.propController.setPosition(spawnX, spawnY, spawnZ);
      const propId = selfData?.currentPropId || this.localPropId || "crate";
      if (propId && this.propTransformSystem) {
        const mesh = this.propTransformSystem.transform(propId, new THREE.Vector3(spawnX, spawnY, spawnZ));
        this.propController.setPropMesh(mesh);
        this.localPropId = propId;
      }
    }
  }

  private createFirstPersonGun() {
    if (this.fpGun) {
      this.camera.remove(this.fpGun);
      this.fpGun = null;
    }

    const g = new THREE.Group();
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.7 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x443322, roughness: 0.9, metalness: 0.05 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.3, metalness: 0.8 });
    const handMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.8 });

    // Right arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.08), handMat);
    arm.position.set(0, -0.12, 0.08);
    g.add(arm);

    // Hand holding gun
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.12), handMat);
    hand.position.set(0, -0.02, 0.02);
    g.add(hand);

    // Gun body (bigger, more visible)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.42), gunMat);
    g.add(body);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.22, 8);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, metalMat);
    barrel.position.set(0, 0.02, -0.30);
    g.add(barrel);

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), gripMat);
    grip.position.set(0, -0.09, 0.08);
    grip.rotation.x = 0.25;
    g.add(grip);

    // Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.10, 0.04), gunMat);
    mag.position.set(0, -0.10, -0.06);
    g.add(mag);

    // Scope rail
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.12), metalMat);
    scope.position.set(0, 0.055, -0.08);
    g.add(scope);

    // Muzzle tip
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.04, 8), metalMat);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.02, -0.42);
    g.add(muzzle);

    // Position: bottom-right of screen, angled slightly
    g.position.set(0.32, -0.28, -0.55);
    g.rotation.set(0, 0.05, 0);

    // Render gun on top of everything -- no wall clipping
    g.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.renderOrder = 999;
        (child.material as THREE.MeshStandardMaterial).depthTest = false;
        (child.material as THREE.MeshStandardMaterial).depthWrite = false;
      }
    });

    this.camera.add(g);
    this.fpGun = g;

    // Camera must be added to scene for children to render
    if (!this.scene.children.includes(this.camera)) {
      this.scene.add(this.camera);
    }
  }

  private async quickJoin(nickname: string) {
    try {
      await this.network.quickJoin(nickname);
      this.attachToRoom();
      this.uiManager.showScreen("roomLobby");
    } catch (e: any) {
      this.uiManager.showNotification(`Failed: ${e.message}`);
    }
  }

  private async createRoom(nickname: string, roomName: string, isPrivate: boolean) {
    try {
      await this.network.createRoom({ nickname, roomName, isPrivate });
      this.attachToRoom();
      this.uiManager.showScreen("roomLobby");
    } catch (e: any) {
      this.uiManager.showNotification(`Failed: ${e.message}`);
    }
  }

  private async joinByCode(nickname: string, code: string) {
    try {
      await this.network.joinByCode(code, nickname);
      this.attachToRoom();
      this.uiManager.showScreen("roomLobby");
    } catch (e: any) {
      this.uiManager.showNotification(`Failed: ${e.message}`);
    }
  }

  private attachToRoom() {
    const room = this.network.getRoom();
    if (!room) return;

    room.onMessage(ServerMessage.ROOM_STATE, (data: any) => {
      this.handleRoomStateMessage(data);
    });

    room.onMessage(ServerMessage.HIT_CONFIRMED, (data: any) => {
      this.audioSystem?.playSound("hit");
      if (data.killed) this.audioSystem?.playSound("kill");
    });

    room.onMessage(ServerMessage.PLAYER_HIT, (data: any) => {
      this.localHealth = data.remainingHealth;
      this.audioSystem?.playSound("hit");
      this.gameHUD.flashDamage();
    });

    room.onMessage(ServerMessage.PLAYER_KILLED, (data: any) => {
      this.gameHUD.addKillfeed(data.killerNickname, data.victimNickname);
      if (data.victimSessionId === this.network.getSessionId()) {
        this.localIsAlive = false;
        this.localRole = PlayerRole.SPECTATOR;
        this.input.exitPointerLock();
        this.exitGrenadeMode();
        if (this.fpGun) {
          this.camera.remove(this.fpGun);
          this.fpGun = null;
        }
      }
    });

    room.onMessage(ServerMessage.TRANSFORM_RESULT, (data: any) => {
      if (data.success && data.propId) {
        this.localPropId = data.propId;
        this.audioSystem?.playSound("ability");
        if (this.propTransformSystem && this.propController) {
          const pos = this.propController.getPosition();
          const mesh = this.propTransformSystem.transform(this.localPropId, pos);
          this.propController.setPropMesh(mesh);
        }
      } else if (!data.success) {
        this.uiManager.showNotification(data.reason || "Transform failed");
      }
    });

    room.onMessage(ServerMessage.RADAR_PING, (data: any) => {
      this.audioSystem?.playSound("radar");
      if (data.distance < 0) {
        this.uiManager.showNotification("Radar: No props nearby");
      } else {
        this.uiManager.showNotification(`Radar: Prop detected ~${Math.round(data.distance)}m`);
      }
    });

    room.onMessage(ServerMessage.DECOY_SOUND, (data: any) => {
      this.audioSystem?.playSpatialSound("decoy", new THREE.Vector3(data.x, data.y, data.z));
    });

    room.onMessage(ServerMessage.ROUND_RESULTS, (data: any) => {
      this.resultsUI.showResults(
        `Round ${data.round} - ${data.winner === "hunters" ? "Hunters Win!" : "Props Win!"}`,
        data.scores
      );
    });

    room.onMessage(ServerMessage.ABILITY_RESULT, (data: any) => {
      if (data.type === "speedBoost") {
        this.speedBoostEnd = Date.now() + (data.duration || 3000);
        this.audioSystem?.playSound("ability");
        this.uiManager.showNotification("SPEED BOOST! [3s]");
      } else if (data.type === "invisibility") {
        this.invisibleEnd = Date.now() + (data.duration || 7000);
        this.audioSystem?.playSound("ability");
        this.uiManager.showNotification("INVISIBLE! [7s]");
      }
    });

    room.onMessage(ServerMessage.GRENADE_THROWN, (data: any) => {
      if (data.throwerSessionId === this.network.getSessionId()) return;
      if (this.particleSystem) {
        const origin = new THREE.Vector3(data.originX, data.originY, data.originZ);
        const dir = new THREE.Vector3(data.dirX, data.dirY, data.dirZ);
        this.particleSystem.spawnGrenade(origin, dir, data.flightTime);
      }
    });

    room.onMessage(ServerMessage.GRENADE_EXPLODE, (data: any) => {
      if (this.particleSystem) {
        this.particleSystem.spawnExplosion(new THREE.Vector3(data.x, (data.y || 0) + 0.3, data.z));
      }
      this.audioSystem?.playSound("kill");
      if (data.stunnedCount > 0) {
        this.uiManager.showNotification(`Grenade stunned ${data.stunnedCount} prop(s)!`);
      }
      if (data.stunnedSessionIds) {
        for (const sid of data.stunnedSessionIds) {
          const entity = this.playerEntities.get(sid);
          if (entity) entity.showStunEffect(HUNTER_GRENADE_STUN_MS);
        }
      }
    });

    room.onMessage(ServerMessage.PROP_STUNNED, (data: any) => {
      const dur = data.duration || HUNTER_GRENADE_STUN_MS;
      this.uiManager.showNotification(`STUNNED! Can't move for ${dur / 1000}s!`);
      this.propController?.setLocked(true);
      setTimeout(() => {
        this.propController?.setLocked(false);
      }, dur);
    });

    room.onMessage(ServerMessage.SCAN_RESULT, (data: any) => {
      if (data.count === 0) {
        this.uiManager.showNotification("Scanner: No props detected nearby");
      } else {
        this.uiManager.showNotification(`Scanner: ${data.count} prop(s) detected!`);
        if (data.detected) {
          this.minimap.addDetectedProps(data.detected);
          for (const d of data.detected) {
            const entity = this.playerEntities.get(d.sessionId);
            if (entity) entity.setHighlighted(true);
          }
        }
      }
    });

    room.onMessage(ServerMessage.PROP_INVISIBLE, (data: any) => {
      const isLocalProp = data.sessionId === this.network.getSessionId();
      const entity = this.playerEntities.get(data.sessionId);

      // Smoke poof effect at prop position when going invisible
      if (data.invisible && entity && this.particleSystem) {
        const pos = entity.group.position.clone();
        pos.y += 0.5;
        for (let i = 0; i < 3; i++) {
          setTimeout(() => this.particleSystem?.spawnImpact(pos.clone().add(
            new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.3, (Math.random() - 0.5) * 0.5)
          ), 8), i * 50);
        }
        this.audioSystem?.playSound("ability");
      }

      if (this.localRole === PlayerRole.HUNTER) {
        if (data.invisible) {
          const sid = data.sessionId;
          setTimeout(() => {
            this.invisibleProps.add(sid);
            const ent = this.playerEntities.get(sid);
            if (ent) ent.group.visible = false;
          }, 200);
        } else {
          this.invisibleProps.delete(data.sessionId);
          if (entity) entity.group.visible = true;
        }
      } else if (isLocalProp) {
        // Local prop: make own transform mesh ghostly (25% opacity)
        const setOpacity = (obj: THREE.Object3D, opacity: number) => {
          obj.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m) => {
                if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshBasicMaterial) {
                  m.transparent = true;
                  m.opacity = opacity;
                  m.needsUpdate = true;
                }
              });
            }
          });
        };

        const localMesh = this.propTransformSystem?.getCurrentMesh();
        if (localMesh) {
          setOpacity(localMesh, data.invisible ? 0.2 : 1.0);
        }

        if (data.invisible) {
          this.uiManager.showNotification("You are INVISIBLE for 7s!");
        }
      } else {
        // Fellow props see ghostly transparent version
        if (entity) {
          entity.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m) => {
                if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshBasicMaterial) {
                  m.transparent = true;
                  m.opacity = data.invisible ? 0.25 : 1.0;
                  m.needsUpdate = true;
                }
              });
            }
          });
        }
      }
    });

    room.onMessage(ServerMessage.SHOT_FIRED, (data: any) => {
      if (data.shooterSessionId === this.network.getSessionId()) return;
      if (this.weaponSystem) {
        const origin = new THREE.Vector3(data.originX, data.originY, data.originZ);
        const dir = new THREE.Vector3(data.dirX, data.dirY, data.dirZ);
        this.weaponSystem.fire(origin, dir);
        this.audioSystem?.playSound("shoot");
      }
    });

    room.onMessage(ServerMessage.SPEED_BOOST, (data: any) => {
      if (this.particleSystem && data.x !== undefined) {
        this.particleSystem.spawnImpact(new THREE.Vector3(data.x, data.y + 0.3, data.z), 8);
      }
    });

    room.onMessage(ServerMessage.MATCH_RESULTS, (data: any) => {
      this.resultsUI.showResults("Match Results", data.scores);
      this.uiManager.showScreen("results");
      this.input.exitPointerLock();
    });
  }

  private leaveRoom() {
    this.network.leaveRoom();
    this.uiManager.showScreen("mainMenu");
    this.input.exitPointerLock();
    this.minimap.hide();
    this.clearGameEntities();
    this.currentPhase = GamePhase.WAITING;
    this.latestRoomState = null;
  }

  private clearGameEntities() {
    this.playerEntities.forEach((entity) => entity.dispose(this.scene));
    this.playerEntities.clear();
    this.invisibleProps.clear();
    this.weaponSystem?.dispose();
    this.propTransformSystem?.dispose();
    this.particleSystem?.dispose();
  }

  private animate() {
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.isGameActive()) {
      this.updateGameplay(dt);
    }

    this.playerEntities.forEach((entity) => entity.updateVisual(dt));

    this.weaponSystem?.update(dt);
    this.particleSystem?.update(dt);
    this.updateGunViewmodel(dt);

    if (this.ferrisWheel) {
      this.ferrisWheel.rotation.z += dt * 0.15;
      this.ferrisWheel.children.forEach((child) => {
        if (child instanceof THREE.Group) {
          child.rotation.z -= dt * 0.15;
        }
      });
    }

    this.renderer.render(this.scene, this.camera);
  }


  private isGameActive(): boolean {
    return (
      this.currentPhase === GamePhase.ACTIVE ||
      this.currentPhase === GamePhase.HIDING
    );
  }

  private updateGameplay(dt: number) {
    if (!this.localIsAlive) {
      this.spectatorController?.update(dt);
      return;
    }

    let pos: THREE.Vector3;

    if (this.localRole === PlayerRole.HUNTER) {
      // Hunter can move during HIDING (inside cage) AND ACTIVE (free roam)
      pos = this.hunterController.update(dt, this.colliders);
      this.handleHunterActions(dt);
      this.updateHunterHUD();
    } else {
      // Apply speed boost if active
      const boosted = Date.now() < this.speedBoostEnd;
      if (boosted) {
        (this.propController as any).speed = 22;
        this.speedBoostSmoke += dt;
        if (this.speedBoostSmoke > 0.08) {
          this.speedBoostSmoke = 0;
          const p = this.propController.getPosition();
          this.particleSystem?.spawnImpact(new THREE.Vector3(p.x, p.y + 0.1, p.z), 3);
        }
      } else {
        (this.propController as any).speed = 13;
      }
      pos = this.propController.update(dt, this.colliders);
      this.handlePropActions();
      this.updatePropHUD();
    }

    this.sendInputToServer(pos!);
  }

  private handleHunterActions(_dt: number) {
    if (this.currentPhase !== GamePhase.ACTIVE) return;

    const state = this.input.getState();

    if (this.grenadeMode) {
      if (state.shoot) {
        const origin = this.hunterController.getPosition();
        const dir = this.hunterController.getForwardDirection();
        this.network.send(ClientMessage.THROW_GRENADE, {
          originX: origin.x, originY: origin.y, originZ: origin.z,
          dirX: dir.x, dirY: dir.y, dirZ: dir.z,
        });
        if (this.particleSystem) {
          this.particleSystem.spawnGrenade(origin.clone(), dir.clone(), 1.2);
        }
        this.audioSystem?.playSound("ability");
        this.exitGrenadeMode();
        this.lastGrenadeTime = Date.now();
      }
      if (this.input.consumeKey("KeyQ")) {
        this.exitGrenadeMode();
      }
      return;
    }

    if (state.shoot && this.weaponSystem.canFire(this.localAmmo)) {
      const origin = this.hunterController.getPosition();
      const dir = this.hunterController.getForwardDirection();
      this.weaponSystem.fire(origin, dir);
      this.audioSystem?.playSound("shoot");
      this.triggerGunRecoil();

      this.network.send(ClientMessage.SHOOT, {
        originX: origin.x,
        originY: origin.y,
        originZ: origin.z,
        dirX: dir.x,
        dirY: dir.y,
        dirZ: dir.z,
        timestamp: Date.now(),
      });
    }

    if (this.input.consumeKey("KeyR") && this.localAmmo < WEAPON_MAX_AMMO) {
      this.weaponSystem.startReload();
      this.audioSystem?.playSound("reload");
      this.network.send(ClientMessage.RELOAD);
    }

    // Q = Equip grenade
    if (this.input.consumeKey("KeyQ")) {
      const cdGrenade = Date.now() - this.lastGrenadeTime;
      if (cdGrenade >= HUNTER_GRENADE_COOLDOWN_MS) {
        this.enterGrenadeMode();
      }
    }

    // E = Scanner
    if (this.input.consumeKey("KeyE")) {
      const cdScan = Date.now() - this.lastScanTime;
      if (cdScan >= HUNTER_SCAN_COOLDOWN_MS) {
        this.network.send(ClientMessage.SCAN_AREA);
        this.lastScanTime = Date.now();
        this.audioSystem?.playSound("radar");
        const pos = this.hunterController.getPosition();
        pos.y -= 1.4;
        this.particleSystem?.spawnScanPulse(pos, 10);
      }
    }
  }

  private enterGrenadeMode() {
    this.grenadeMode = true;
    if (this.fpGun) this.fpGun.visible = false;

    if (this.fpGrenade) {
      this.camera.remove(this.fpGrenade);
      this.fpGrenade = null;
    }

    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3a5a2a, roughness: 0.6, metalness: 0.3,
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), bodyMat);
    g.add(body);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.6 });
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.06, 4), pinMat);
    pin.position.set(0, 0.08, 0);
    g.add(pin);
    const handMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.8 });
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.12), handMat);
    hand.position.set(0, -0.06, 0.02);
    g.add(hand);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), handMat);
    arm.position.set(0, -0.18, 0.06);
    g.add(arm);

    g.position.set(0.25, -0.2, -0.45);
    g.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.renderOrder = 999;
        (child.material as THREE.MeshStandardMaterial).depthTest = false;
        (child.material as THREE.MeshStandardMaterial).depthWrite = false;
      }
    });

    this.camera.add(g);
    this.fpGrenade = g;
  }

  private exitGrenadeMode() {
    this.grenadeMode = false;
    if (this.fpGrenade) {
      this.camera.remove(this.fpGrenade);
      this.fpGrenade = null;
    }
    if (this.fpGun) this.fpGun.visible = true;
  }

  private handlePropActions() {
    if (this.input.consumeKey("KeyE")) {
      const cdSpeed = Date.now() - this.lastAbility2Time;
      if (cdSpeed >= 30000) {
        this.network.send(ClientMessage.USE_ABILITY_2);
        this.lastAbility2Time = Date.now();
      } else {
        const allProps = this.propRegistry.getAll();
        const randomProp = allProps[Math.floor(Math.random() * allProps.length)];
        this.network.send(ClientMessage.TRANSFORM_REQUEST, { propId: randomProp.id });
      }
    }

    if (this.input.consumeKey("KeyF")) {
      this.localIsLocked = !this.localIsLocked;
      this.propController.setLocked(this.localIsLocked);
      this.network.send(ClientMessage.LOCK_POSE);
    }

    if (this.input.consumeKey("KeyQ")) {
      this.network.send(ClientMessage.USE_ABILITY);
      this.lastAbilityTime = Date.now();
    }
  }

  private updateHunterHUD() {
    this.gameHUD.updateHealth(this.localHealth, HUNTER_MAX_HEALTH);
    this.gameHUD.updateAmmo(this.localAmmo, WEAPON_MAX_AMMO, this.weaponSystem?.getIsReloading() || false);
    const cdGrenade = Math.max(0, HUNTER_GRENADE_COOLDOWN_MS - (Date.now() - this.lastGrenadeTime));
    const cdScan = Math.max(0, HUNTER_SCAN_COOLDOWN_MS - (Date.now() - this.lastScanTime));
    this.gameHUD.updateHunterAbilities(cdGrenade, cdScan, this.grenadeMode);
    this.gameHUD.updateDamageOverlay(this.localHealth, HUNTER_MAX_HEALTH, true);

    this.minimap.show();
    const pos = this.hunterController.getPosition();
    const rot = this.hunterController.getRotation();
    this.minimap.updatePlayerPosition(pos.x, pos.z, rot.y);
  }

  private updatePropHUD() {
    this.minimap.hide();
    this.gameHUD.updateHealth(this.localHealth, PROP_MAX_HEALTH);
    const propDef = this.propRegistry.get(this.localPropId);
    this.gameHUD.updatePropInfo(propDef?.name || "", this.localIsLocked);
    const cdInvis = Math.max(0, 120000 - (Date.now() - this.lastAbilityTime));
    const cdSpeed = Math.max(0, 30000 - (Date.now() - this.lastAbility2Time));
    if (cdInvis > 0) {
      this.gameHUD.updateAbility("Invisible", "Q", cdInvis);
    } else if (cdSpeed > 0) {
      this.gameHUD.updateAbility("Speed", "E", cdSpeed);
    } else {
      this.gameHUD.updateAbility("Q:INVIS  E:SPEED", "", 0);
    }
    this.gameHUD.updateDamageOverlay(this.localHealth, PROP_MAX_HEALTH, false);
  }

  private sendInputToServer(position: THREE.Vector3) {
    const now = Date.now();
    if (now - this.lastSendTime < this.sendInterval) return;
    this.lastSendTime = now;

    const rot =
      this.localRole === PlayerRole.HUNTER
        ? this.hunterController.getRotation()
        : this.propController.getRotation();

    // Hunter position is at eye-height; convert to feet for network sync
    const feetY = this.localRole === PlayerRole.HUNTER
      ? position.y - 1.6
      : position.y;

    this.network.send(ClientMessage.PLAYER_INPUT, {
      x: position.x,
      y: feetY,
      z: position.z,
      rotX: rot.x,
      rotY: rot.y,
      seq: ++this.inputSeq,
      timestamp: now,
    });
  }

  private speak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.1;
      u.pitch = 1.0;
      u.volume = 0.7;
      speechSynthesis.speak(u);
    } catch { /* speech synthesis is best-effort */ }
  }

  private gunBobTime = 0;
  private recoilPitch = 0;
  private recoilBack = 0;
  private recoilPitchVel = 0;
  private recoilBackVel = 0;

  triggerGunRecoil() {
    this.recoilPitchVel += 8;
    this.recoilBackVel += 1.5;
  }

  private updateGunViewmodel(dt: number) {
    if (!this.fpGun || this.localRole !== PlayerRole.HUNTER) return;

    const baseX = 0.32, baseY = -0.28, baseZ = -0.55;
    const state = this.input.getState();
    const isMoving = this.input.isPointerLocked() &&
      (state.forward || state.backward || state.left || state.right);

    // Spring-damper recoil (Minecraft-style kick + smooth return)
    const springK = 80;
    const dampK = 12;
    this.recoilPitchVel += (-this.recoilPitch * springK - this.recoilPitchVel * dampK) * dt;
    this.recoilPitch += this.recoilPitchVel * dt;
    this.recoilBackVel += (-this.recoilBack * springK - this.recoilBackVel * dampK) * dt;
    this.recoilBack += this.recoilBackVel * dt;

    let bobX = 0, bobY = 0, bobRotZ = 0;

    if (isMoving) {
      this.gunBobTime += dt * 9;
      bobX = Math.sin(this.gunBobTime) * 0.015;
      bobY = Math.cos(this.gunBobTime * 2) * 0.010;
      bobRotZ = Math.sin(this.gunBobTime) * 0.025;
    } else {
      this.gunBobTime *= 0.9;
      const idle = Date.now() * 0.001;
      bobX = Math.sin(idle * 1.2) * 0.003;
      bobY = Math.sin(idle * 0.8) * 0.002;
      bobRotZ = Math.sin(idle) * 0.005;
    }

    this.fpGun.position.set(
      baseX + bobX,
      baseY + bobY,
      baseZ + this.recoilBack * 0.08
    );
    this.fpGun.rotation.set(
      -this.recoilPitch * 0.03,
      0.05,
      bobRotZ
    );
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
