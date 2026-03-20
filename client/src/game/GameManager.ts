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
import { SoundMemePanel } from "../ui/components/SoundMemePanel";
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
import { isMobile } from "../input/MobileDetect";
import { TouchInputProvider } from "../input/TouchInputProvider";
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
  HUNTER_PHASEWALK_DURATION_MS,
  HUNTER_PHASEWALK_COOLDOWN_MS,
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
  private musicBtn: HTMLButtonElement | null = null;
  private soundMemePanel!: SoundMemePanel;
  private memeAudioCache = new Map<string, AudioBuffer>();
  private currentMemeAudio: HTMLAudioElement | null = null;

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
  private localAmmo = WEAPON_MAX_AMMO;
  private localIsAlive = true;
  private localPropId = "";
  private localIsLocked = false;
  private lastAbilityTime = 0;
  private fpGun: THREE.Group | null = null;
  private speedBoostEnd = 0;
  private speedBoostSmoke = 0;
  private invisibleEnd = 0;
  private lastAbility2Time = 0;
  private hunterBoostEnd = 0;
  private lastHunterBoostTime = 0;
  private phaseWalkEnd = 0;
  private lastPhaseWalkTime = 0;
  private phaseWalkColliders: THREE.Box3[] = [];
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
  private ferrisCabinColliders: THREE.Box3[] = [];
  private ferrisR = 8.5;
  private ferrisHubY = 12;
  private ferrisX = -10;
  private ferrisZ = 34;
  private ferrisNumCabins = 8;
  private ferrisCabW = 1.8;
  private ferrisCabH = 2.2;
  private ferrisCabD = 1.4;
  private minimap: Minimap;
  private touchInput: TouchInputProvider | null = null;
  private mobile: boolean;

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

    this.mobile = isMobile();
    if (this.mobile) {
      this.input.isMobileMode = true;
      this.touchInput = new TouchInputProvider(this.input);
      document.body.classList.add("is-mobile");
      // Request fullscreen on first touch for better mobile UX
      document.addEventListener("touchstart", () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        }
      }, { once: true });
    }

    void loadMemeManifest().then((memes) => preloadMemeTextures(memes));

    this.setupUI();
    this.setupChat();
    this.setupMusicToggle();
    this.setupSoundMemePanel();

    window.addEventListener("resize", () => this.onResize());

    window.addEventListener("beforeunload", (e) => {
      if (this.isGameActive()) {
        e.preventDefault();
        e.returnValue = "";
      }
    });

    if (!this.mobile) {
      document.addEventListener("click", () => {
        if (this.currentPhase === GamePhase.ACTIVE || this.currentPhase === GamePhase.HIDING) {
          if (!this.input.isPointerLocked() && this.localIsAlive) {
            this.input.requestPointerLock();
          }
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.input.isPointerLocked()) {
          this.input.exitPointerLock();
        }
      });
    }

    this.uiManager.showScreen("mainMenu");
    this.animate();
  }

  private setupUI() {
    this.mainMenu = new MainMenuUI({
      onQuickJoin: (nickname) => this.quickJoin(nickname),
      onCreate: (nickname, roomName, isPrivate, passcode) => this.createRoom(nickname, roomName, isPrivate, passcode),
      onJoinCode: (nickname, code) => this.joinByCode(nickname, code),
      onBrowseRooms: () => this.network.getAvailableRooms(),
      onJoinRoom: (nickname, roomId, passcode) => this.joinRoomById(nickname, roomId, passcode),
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

    // Update local player data BEFORE phase change so role is correct for notifications
    const selfData = data.players?.find((p: any) => p.sessionId === this.network.getSessionId());
    if (selfData) {
      this.localRole = selfData.role;
      this.localHealth = selfData.health;
      this.localAmmo = selfData.ammo;
      this.localIsAlive = selfData.isAlive;
      this.localIsLocked = selfData.isLocked;
    }

    // Detect mid-game spectator join (first state received while game active)
    if (selfData?.isSpectator && !this.mapBuilt) {
      this.enterMidGameSpectator(data);
    }

    const newPhase = data.phase as string;
    if (newPhase && newPhase !== this.currentPhase) {
      this.onPhaseChange(this.currentPhase, newPhase);
      this.currentPhase = newPhase;
    }

    if (selfData) {

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
        entity.updateFromServer(p.x, p.y, p.z, p.rotY, p.role, p.currentPropId, p.isAlive, p.memeId, p.rotX);
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

    // Update alive count
    if (data.players) {
      let aliveProps = 0, totalProps = 0, aliveHunters = 0, totalHunters = 0;
      for (const p of data.players) {
        if (p.role === "prop") {
          totalProps++;
          if (p.isAlive) aliveProps++;
        } else if (p.role === "hunter") {
          totalHunters++;
          if (p.isAlive) aliveHunters++;
        }
      }
      this.gameHUD.updateAliveCount(aliveProps, totalProps, aliveHunters, totalHunters);
    }

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

      const allReady = lobbyPlayers.length > 0 && lobbyPlayers.every((p: any) => p.isReady);
      this.roomLobby.updateStartButton(allReady, lobbyPlayers.length);

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
        this.localTransformCount = 0;
        this.buildMapIfNeeded();
        this.initControllers();
        this.setHudButtonsVisible(true);
        this.uiManager.showScreen("gameHUD");
        this.gameHUD.updateRole(this.localRole);
        if (this.touchInput) {
          this.touchInput.show();
          this.touchInput.setRole(this.localRole === PlayerRole.HUNTER ? "hunter" : "prop");
        }
        if (this.localRole === PlayerRole.PROP) {
          this.uiManager.showNotification("You are a PROP! HIDE NOW!");
          this.speak("You are a prop! Hide quickly!");
          if (!this.mobile) setTimeout(() => this.input.requestPointerLock(), 500);
        } else {
          if (this.mobile) {
            this.uiManager.showNotification("You are a HUNTER! Tap buttons to Shoot/Reload/Grenade/Scanner");
          } else {
            this.uiManager.showNotification("You are a HUNTER! Controls: LMB Shoot | R Reload | Q Grenade | E Scanner");
          }
          this.speak("You are a hunter. Wait for the hunt to begin.");
          if (!this.mobile) setTimeout(() => this.input.requestPointerLock(), 500);
        }
        break;

      case GamePhase.ACTIVE:
        // Solo explore or normal game — build map if needed
        if (!this.mapBuilt) {
          this.buildMapIfNeeded();
          this.initControllers();
          this.setHudButtonsVisible(true);
          this.uiManager.showScreen("gameHUD");
        }
        this.gameHUD.updateRole(this.localRole);
        if (this.touchInput) {
          this.touchInput.show();
          this.touchInput.setRole(this.localRole === PlayerRole.HUNTER ? "hunter" : "prop");
        }
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
          const selfNow = this.latestRoomState?.players?.find(
            (p: any) => p.sessionId === this.network.getSessionId()
          );
          if (selfNow) {
            this.hunterController.setPosition(selfNow.x, selfNow.y, selfNow.z);
          } else {
            this.hunterController.setPosition(-36, 0.1, 0);
          }
          if (this.mobile) {
            this.uiManager.showNotification("HUNT! Use buttons to Shoot/Grenade/Scanner");
          } else {
            this.uiManager.showNotification("HUNT! LMB:Shoot | R:Reload | Q:Grenade | E:Scanner (full map)");
          }
          this.speak("Gate open! Hunt them down!");
        } else {
          this.speak("Hunters released! Stay hidden!");
        }
        if (!this.mobile) setTimeout(() => this.input.requestPointerLock(), 500);
        break;

      case GamePhase.ROUND_END:
        this.minimap.hide();
        break;

      case GamePhase.MATCH_END:
        if (!this.mobile) this.input.exitPointerLock();
        this.minimap.hide();
        this.touchInput?.hide();
        break;

      case GamePhase.WAITING:
        this.uiManager.showScreen("roomLobby");
        if (!this.mobile) this.input.exitPointerLock();
        this.setHudButtonsVisible(false);
        this.clearGameEntities();
        this.touchInput?.hide();
        break;
    }
  }

  private enterMidGameSpectator(data: any) {
    this.buildMapIfNeeded();
    this.initControllers();
    this.currentPhase = data.phase;
    this.localRole = PlayerRole.SPECTATOR;
    this.localIsAlive = false;

    // Remove gate so spectator can see freely (gate is already open in ACTIVE)
    if (this.gateCollider && this.gateColliderIndex >= 0) {
      const idx = this.colliders.indexOf(this.gateCollider);
      if (idx >= 0) this.colliders.splice(idx, 1);
      this.gateCollider = null;
    }
    if (this.gateMesh) {
      this.gateMesh.visible = false;
      this.gateMesh = null;
    }

    this.spectatorController.setPosition(0, 15, 20);
    this.uiManager.showScreen("gameHUD");
    this.gameHUD.updateRole("ghost");
    this.gameHUD.updatePhase(data.phase);
    this.uiManager.showNotification("Spectating — you will play next round!");

    if (this.touchInput) {
      this.touchInput.show();
      this.touchInput.setRole("spectator");
    }
    if (!this.mobile) {
      setTimeout(() => this.input.requestPointerLock(), 500);
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

    // Store cabin collider references for dynamic updates (5 per cabin)
    this.ferrisCabinColliders = [];
    const fwNumCabs = this.ferrisNumCabins;
    const collidersPerCabin = 5;
    const collidersLen = this.colliders.length;
    for (let i = 0; i < fwNumCabs * collidersPerCabin; i++) {
      const idx = collidersLen - fwNumCabs * collidersPerCabin + i;
      if (idx >= 0 && idx < this.colliders.length) {
        this.ferrisCabinColliders.push(this.colliders[idx]);
      }
    }

    this.weaponSystem = new WeaponSystem(this.scene);
    this.propTransformSystem = new PropTransformSystem(this.scene, this.propRegistry);
    this.audioSystem = new AudioSystem(this.camera);
    // Music OFF by default
    if (this.musicBtn) this.musicBtn.textContent = "[M] ♪ OFF";
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

    const spawnX = selfData?.x ?? -42;
    const spawnY = selfData?.y ?? 0.5;
    const spawnZ = selfData?.z ?? 0;

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

    // Muzzle flash group (hidden by default, shown on fire)
    const mFlashGroup = new THREE.Group();
    mFlashGroup.position.set(0, 0.02, -0.46);
    mFlashGroup.visible = false;
    const flashGeo = new THREE.PlaneGeometry(0.15, 0.15);
    const flashMat2 = new THREE.MeshBasicMaterial({
      color: 0xffaa22, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      depthTest: false, depthWrite: false,
    });
    const mf1 = new THREE.Mesh(flashGeo, flashMat2);
    mf1.renderOrder = 1000;
    mFlashGroup.add(mf1);
    const mf2 = new THREE.Mesh(flashGeo.clone(), flashMat2.clone());
    mf2.rotation.z = Math.PI / 2;
    mf2.renderOrder = 1000;
    mFlashGroup.add(mf2);
    g.add(mFlashGroup);
    this.fpMuzzleFlash = mFlashGroup as unknown as THREE.Mesh;

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

  private async createRoom(nickname: string, roomName: string, isPrivate: boolean, passcode?: string) {
    try {
      await this.network.createRoom({ nickname, roomName, isPrivate, passcode });
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

  private async joinRoomById(nickname: string, roomId: string, passcode?: string) {
    try {
      await this.network.joinRoom(roomId, nickname, passcode);
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
      if (this.propController?.isInSoulMode()) {
        this.propController.exitSoulMode();
      }
    });

    room.onMessage(ServerMessage.PLAYER_KILLED, (data: any) => {
      this.gameHUD.addKillfeed(data.killerNickname, data.victimNickname);
      if (data.victimSessionId === this.network.getSessionId()) {
        // Get position before changing role
        const wasHunter = this.localRole === PlayerRole.HUNTER;
        const pos = wasHunter
          ? this.hunterController.getPosition()
          : this.propController.getPosition();

        if (this.propController?.isInSoulMode()) {
          this.propController.exitSoulMode();
        }
        this.gameHUD.setSoulModeVisible(false);

        this.localIsAlive = false;
        this.localRole = PlayerRole.SPECTATOR;
        this.exitGrenadeMode();
        if (this.fpGun) {
          this.camera.remove(this.fpGun);
          this.fpGun = null;
        }
        this.gameHUD.updateRole("ghost");
        this.touchInput?.setRole("spectator");
        this.spectatorController.setPosition(pos.x, pos.y + 2, pos.z);
      }
    });

    room.onMessage(ServerMessage.TRANSFORM_RESULT, (data: any) => {
      if (data.success && data.propId) {
        this.localPropId = data.propId;
        this.localTransformCount++;
        this.audioSystem?.playSound("ability");
        if (this.propTransformSystem && this.propController) {
          const pos = this.propController.getPosition();
          const mesh = this.propTransformSystem.transform(this.localPropId, pos);
          this.propController.setPropMesh(mesh);
        }
        const propDef = this.propRegistry.get(this.localPropId);
        if (propDef) {
          this.uiManager.showNotification(`Transformed into ${propDef.name}! (${this.localTransformCount}/2)`);
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
      if (data.warning) {
        this.uiManager.showNotification(`WARNING: Hunter ${data.hunterName} used FULL MAP SCAN!`);
        this.audioSystem?.playSound("radar");
        return;
      }
      if (data.count === 0) {
        this.uiManager.showNotification("Scanner: No props found on the map");
      } else {
        this.uiManager.showNotification(`Scanner: ${data.count} prop(s) detected on map!`);
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
      if (!this.mobile) this.input.exitPointerLock();
      this.touchInput?.hide();
    });

    room.onMessage(ServerMessage.CHAT_MESSAGE, (data: any) => {
      this.gameHUD.addChatMessage(data.sender, data.message);
    });

    room.onMessage(ServerMessage.SOUND_MEME_PLAYED, (data: any) => {
      this.handleSoundMemePlayed(data);
    });
  }

  private setupChat() {
    this.input.setTabToggleHandler(() => {
      const isOpen = this.gameHUD.toggleChat();
      this.input.setChatActive(isOpen);
    });

    this.gameHUD.setChatSendHandler((message: string) => {
      this.network.send(ClientMessage.CHAT, { message });
    });
  }

  private infoPanel: HTMLElement | null = null;
  private infoBtn: HTMLButtonElement | null = null;

  private isInGamePhase(): boolean {
    return this.currentPhase === GamePhase.HIDING
      || this.currentPhase === GamePhase.ACTIVE
      || this.currentPhase === GamePhase.ROUND_END
      || this.currentPhase === GamePhase.MATCH_END;
  }

  setHudButtonsVisible(visible: boolean) {
    const display = visible ? "block" : "none";
    if (this.musicBtn) this.musicBtn.style.display = display;
    if (this.infoBtn) this.infoBtn.style.display = display;
    if (!visible && this.infoPanel) this.infoPanel.style.display = "none";
  }

  private setupMusicToggle() {
    const btn = document.createElement("button");
    btn.id = "music-toggle";
    btn.textContent = "[M] ♪ OFF";
    btn.style.cssText = `
      position: fixed; top: 16px; left: 16px; z-index: 100;
      background: rgba(0,0,0,0.5); color: #fff; border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px; padding: 6px 10px; font-size: 0.75rem; cursor: pointer;
      font-family: inherit; backdrop-filter: blur(4px); pointer-events: none;
      display: none;
    `;
    document.body.appendChild(btn);
    this.musicBtn = btn;

    const infoBtn = document.createElement("button");
    infoBtn.id = "info-toggle";
    infoBtn.textContent = "[I] ?";
    infoBtn.style.cssText = `
      position: fixed; top: 16px; left: 110px; z-index: 100;
      background: rgba(0,0,0,0.5); color: #fff; border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px; padding: 6px 10px; font-size: 0.75rem;
      font-family: inherit; backdrop-filter: blur(4px); pointer-events: none;
      display: none;
    `;
    document.body.appendChild(infoBtn);
    this.infoBtn = infoBtn;

    const panel = document.createElement("div");
    panel.style.cssText = `
      position: fixed; top: 50px; left: 16px; z-index: 100;
      background: rgba(0,0,0,0.88); color: #ddd; border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px; padding: 14px 18px; font-size: 0.78rem; line-height: 1.7;
      max-width: 330px; display: none; backdrop-filter: blur(6px);
    `;
    panel.innerHTML = `
      <div style="color:#fff;font-weight:bold;margin-bottom:8px;font-size:0.9rem;">Controls</div>
      <div style="color:#4fc3f7;font-weight:bold;margin-bottom:4px;">Hunter</div>
      <b>LMB</b> Shoot &bull; <b>R</b> Reload &bull; <b>Q</b> Grenade<br>
      <b>E</b> Scanner &bull; <b>T</b> Speed Boost &bull; <b>1</b> Phase-Walk<br>
      <b>WASD</b> Move &bull; <b>Space</b> Jump &bull; <b>Shift</b> Crouch<br>
      <div style="color:#66bb6a;font-weight:bold;margin:6px 0 4px;">Prop</div>
      <b>WASD</b> Move &bull; <b>Space</b> Jump &bull; <b>E</b> Transform (2x max)<br>
      <b>F</b> Lock &bull; <b>Q</b> Invisible &bull; <b>R</b> Speed<br>
      <b>1</b> Soul Mode<br>
      <div style="color:#fff;font-weight:bold;margin:6px 0 4px;">General</div>
      <b>Tab</b> Open/Close Chat<br>
      <b>2</b> Open Sound Meme &rarr; <b>2</b> cycle &rarr; <b>Enter</b> play<br>
      <b>M</b> Toggle Music &bull; <b>I</b> Toggle Help<br>
      <b>Esc</b> Release mouse
    `;
    document.body.appendChild(panel);
    this.infoPanel = panel;

    document.addEventListener("keydown", (e) => {
      if (!this.isInGamePhase()) return;

      if (e.code === "KeyM") {
        e.preventDefault();
        if (this.audioSystem) {
          const playing = this.audioSystem.toggleBGM();
          if (this.musicBtn) this.musicBtn.textContent = playing ? "[M] ♪ ON" : "[M] ♪ OFF";
        }
      }
      if (e.code === "KeyI") {
        e.preventDefault();
        if (this.infoPanel) {
          this.infoPanel.style.display = this.infoPanel.style.display === "none" ? "block" : "none";
        }
      }
    });
  }

  private handleSoundMemePlayed(data: { soundId: string; x: number; z: number; zone: string; senderSessionId: string }) {
    const filePath = this.soundMemePanel.getSoundFile(data.soundId);
    if (!filePath) return;

    const myPos = this.localRole === PlayerRole.HUNTER
      ? this.hunterController?.getPosition()
      : this.propController?.getPosition();

    let volume = 1.0;
    if (myPos && data.senderSessionId !== this.network.getSessionId()) {
      const dx = data.x - myPos.x;
      const dz = data.z - myPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      volume = Math.max(0, 1 - dist / 50);
    }

    if (volume > 0.01) {
      if (this.currentMemeAudio) {
        this.currentMemeAudio.pause();
        this.currentMemeAudio.currentTime = 0;
        this.currentMemeAudio = null;
      }
      const audio = new Audio(filePath);
      audio.volume = Math.min(1, volume * 0.7);
      audio.play().catch(() => {});
      this.currentMemeAudio = audio;
      audio.addEventListener("ended", () => {
        if (this.currentMemeAudio === audio) this.currentMemeAudio = null;
      });
    }

    if (this.localRole === PlayerRole.HUNTER) {
      this.minimap.addSoundPing(data.x, data.z, data.zone);
    }
  }

  private setupSoundMemePanel() {
    this.soundMemePanel = new SoundMemePanel();
    document.getElementById("ui-root")!.appendChild(this.soundMemePanel.element);

    this.soundMemePanel.setOnSelect((soundId) => {
      const pos = this.localRole === PlayerRole.HUNTER
        ? this.hunterController?.getPosition()
        : this.propController?.getPosition();
      if (!pos) return;
      this.network.send(ClientMessage.PLAY_SOUND_MEME, { soundId, x: pos.x, z: pos.z });
    });

    document.addEventListener("keydown", (e) => {
      if (this.currentPhase !== GamePhase.ACTIVE && this.currentPhase !== GamePhase.HIDING) return;

      if (e.code === "Digit2") {
        e.preventDefault();
        if (this.soundMemePanel.isVisible()) {
          this.soundMemePanel.cycleNext();
        } else {
          this.soundMemePanel.show();
        }
      }

      if (e.code === "Enter" && this.soundMemePanel.isVisible()) {
        e.preventDefault();
        this.soundMemePanel.confirmSelection();
      }
    });
  }

  private leaveRoom() {
    this.network.leaveRoom();
    this.uiManager.showScreen("mainMenu");
    if (!this.mobile) this.input.exitPointerLock();
    this.minimap.hide();
    this.touchInput?.hide();
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

    // Update ferris wheel BEFORE gameplay so colliders are current for physics
    if (this.ferrisWheel) {
      this.updateFerrisWheel(dt);
    }

    if (this.isGameActive()) {
      this.updateGameplay(dt);
    }

    this.playerEntities.forEach((entity) => entity.updateVisual(dt));

    this.weaponSystem?.update(dt);
    this.particleSystem?.update(dt);
    this.updateGunViewmodel(dt);

    this.renderer.render(this.scene, this.camera);
  }

  private prevCabinPositions: { x: number; y: number }[] = [];

  private updateFerrisWheel(dt: number) {
    if (!this.ferrisWheel) return;

    this.ferrisWheel.rotation.z += dt * 0.08;
    // Counter-rotate hinge groups inside mount groups so cabins stay upright
    // Hierarchy: wheelPivot -> mount (Group) -> hinge (Group, child[1]) -> cabin meshes
    this.ferrisWheel.children.forEach((child) => {
      if (child instanceof THREE.Group) {
        child.children.forEach((sub) => {
          if (sub instanceof THREE.Group) {
            sub.rotation.z = -this.ferrisWheel!.rotation.z;
          }
        });
      }
    });

    const angle = this.ferrisWheel.rotation.z;
    const playerPos = this.localIsAlive
      ? (this.localRole === PlayerRole.HUNTER ? this.hunterController?.getPosition() : this.propController?.getPosition())
      : null;

    for (let i = 0; i < this.ferrisNumCabins; i++) {
      const cabAngle = (i / this.ferrisNumCabins) * Math.PI * 2 + angle;
      const cx = this.ferrisX + Math.cos(cabAngle) * this.ferrisR;
      const cy = this.ferrisHubY + Math.sin(cabAngle) * this.ferrisR;

      const prevPos = this.prevCabinPositions[i];
      const base = i * 5;
      const hw = this.ferrisCabW / 2, hh = this.ferrisCabH / 2, hd = this.ferrisCabD / 2;

      // Floor (thick)
      if (this.ferrisCabinColliders[base]) {
        this.ferrisCabinColliders[base].min.set(cx - hw, cy - hh - 0.2, this.ferrisZ - hd);
        this.ferrisCabinColliders[base].max.set(cx + hw, cy - hh + 0.15, this.ferrisZ + hd);
      }
      // Roof (thick slab so jumping can't skip through)
      if (this.ferrisCabinColliders[base + 1]) {
        this.ferrisCabinColliders[base + 1].min.set(cx - hw - 0.15, cy + hh - 0.15, this.ferrisZ - hd - 0.15);
        this.ferrisCabinColliders[base + 1].max.set(cx + hw + 0.15, cy + hh + 0.5, this.ferrisZ + hd + 0.15);
      }
      // Back wall (thicker to prevent pass-through)
      if (this.ferrisCabinColliders[base + 2]) {
        this.ferrisCabinColliders[base + 2].min.set(cx - hw - 0.1, cy - hh, this.ferrisZ - hd - 0.3);
        this.ferrisCabinColliders[base + 2].max.set(cx + hw + 0.1, cy + hh, this.ferrisZ - hd + 0.15);
      }
      // Left wall
      if (this.ferrisCabinColliders[base + 3]) {
        this.ferrisCabinColliders[base + 3].min.set(cx - hw - 0.3, cy - hh, this.ferrisZ - hd);
        this.ferrisCabinColliders[base + 3].max.set(cx - hw + 0.15, cy + hh, this.ferrisZ + hd);
      }
      // Right wall
      if (this.ferrisCabinColliders[base + 4]) {
        this.ferrisCabinColliders[base + 4].min.set(cx + hw - 0.15, cy - hh, this.ferrisZ - hd);
        this.ferrisCabinColliders[base + 4].max.set(cx + hw + 0.3, cy + hh, this.ferrisZ + hd);
      }

      // Platform carry: if player is standing on this cabin floor, move them with it
      if (prevPos && playerPos && this.ferrisCabinColliders[base]) {
        const floorBox = this.ferrisCabinColliders[base];
        const px = playerPos.x, pz = playerPos.z;
        const py = playerPos.y - (this.localRole === PlayerRole.HUNTER ? 1.6 : 0);
        if (px > floorBox.min.x && px < floorBox.max.x &&
            pz > floorBox.min.z && pz < floorBox.max.z &&
            Math.abs(py - floorBox.max.y) < 0.3) {
          const dx = cx - prevPos.x;
          const dy = cy - prevPos.y;
          if (this.localRole === PlayerRole.HUNTER) {
            this.hunterController.translatePosition(dx, dy);
          } else {
            this.propController.translatePosition(dx, dy);
          }
        }
      }

      this.prevCabinPositions[i] = { x: cx, y: cy };
    }
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

    // Build collider list with other player bodies so they can't walk through each other
    const allColliders = [...this.colliders];
    const myId = this.network.getSessionId();
    this.playerEntities.forEach((entity, sid) => {
      if (sid === myId) return;
      if (!entity.group.visible) return;
      const ep = entity.group.position;
      allColliders.push(new THREE.Box3(
        new THREE.Vector3(ep.x - 0.35, ep.y, ep.z - 0.35),
        new THREE.Vector3(ep.x + 0.35, ep.y + 1.6, ep.z + 0.35)
      ));
    });

    let pos: THREE.Vector3;

    if (this.localRole === PlayerRole.HUNTER) {
      const hunterBoosted = Date.now() < this.hunterBoostEnd;
      if (hunterBoosted) {
        (this.hunterController as any).speed = 20;
        (this.hunterController as any).jumpSpeed = 18;
      } else {
        (this.hunterController as any).speed = 10;
        (this.hunterController as any).jumpSpeed = 13;
      }

      const now = Date.now();
      const inPhaseWalk = now < this.phaseWalkEnd;
      if (inPhaseWalk) {
        // During phase-walk: no colliders (walk through walls), slight transparency
        pos = this.hunterController.update(dt, []);
      } else {
        // Phase-walk just ended: push hunter out of any solid they're stuck in
        if (this.phaseWalkColliders.length > 0) {
          this.pushHunterOutOfWalls(allColliders);
          this.phaseWalkColliders = [];
        }
        pos = this.hunterController.update(dt, allColliders);
      }
      this.handleHunterActions(dt);
      this.updateHunterHUD();
    } else {
      // Apply speed boost if active
      const boosted = Date.now() < this.speedBoostEnd;
      if (boosted) {
        (this.propController as any).speed = 14;
        this.speedBoostSmoke += dt;
        if (this.speedBoostSmoke > 0.08) {
          this.speedBoostSmoke = 0;
          const p = this.propController.getPosition();
          this.particleSystem?.spawnImpact(new THREE.Vector3(p.x, p.y + 0.1, p.z), 3);
        }
      } else {
        (this.propController as any).speed = 9;
      }
      pos = this.propController.update(dt, allColliders);
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
      this.startReloadAnimation();
    }

    // Q = Equip grenade
    if (this.input.consumeKey("KeyQ")) {
      const cdGrenade = Date.now() - this.lastGrenadeTime;
      if (cdGrenade >= HUNTER_GRENADE_COOLDOWN_MS) {
        this.enterGrenadeMode();
      }
    }

    // T = Hunter Speed Boost + High Jump (60s cooldown, 5s duration)
    if (this.input.consumeKey("KeyT")) {
      const cdBoost = Date.now() - this.lastHunterBoostTime;
      if (cdBoost >= 60000) {
        this.lastHunterBoostTime = Date.now();
        this.hunterBoostEnd = Date.now() + 5000;
        this.audioSystem?.playSound("ability");
        this.uiManager.showNotification("HUNTER BOOST! Speed + Jump [5s]");
      }
    }

    // 1 = Phase-Walk (walk through walls, 5s duration, 40s cooldown)
    if (this.input.consumeKey("Digit1")) {
      const now = Date.now();
      const cdPhase = now - this.lastPhaseWalkTime;
      if (cdPhase >= HUNTER_PHASEWALK_COOLDOWN_MS && now >= this.phaseWalkEnd) {
        this.lastPhaseWalkTime = now;
        this.phaseWalkEnd = now + HUNTER_PHASEWALK_DURATION_MS;
        this.phaseWalkColliders = [...this.colliders];
        this.audioSystem?.playSound("ability");
        this.uiManager.showNotification("PHASE-WALK! Walking through walls [5s]");
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

  private localTransformCount = 0;

  private handlePropActions() {
    // E = Transform into random prop (max 2 times), weighted by rarity
    if (this.input.consumeKey("KeyE")) {
      if (this.localTransformCount >= 2) {
        this.uiManager.showNotification("Max transforms reached (2/2)!");
      } else {
        const picked = this.pickWeightedProp();
        if (picked) {
          this.network.send(ClientMessage.TRANSFORM_REQUEST, { propId: picked.id });
        }
      }
    }

    // R = Speed Boost
    if (this.input.consumeKey("KeyR")) {
      const cdSpeed = Date.now() - this.lastAbility2Time;
      if (cdSpeed >= 30000) {
        this.network.send(ClientMessage.USE_ABILITY_2);
        this.lastAbility2Time = Date.now();
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

  private static RARITY_WEIGHTS: Record<string, number> = {
    common: 70,
    uncommon: 25,
    rare: 5,
  };

  private pickWeightedProp() {
    const allProps = this.propRegistry.getAll();
    const eligible = allProps.filter(p => p.id !== this.localPropId);
    if (eligible.length === 0) return allProps[0];

    const weights = eligible.map(p => GameManager.RARITY_WEIGHTS[p.rarity] ?? 70);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalWeight;
    for (let i = 0; i < eligible.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return eligible[i];
    }
    return eligible[eligible.length - 1];
  }

  private pushHunterOutOfWalls(colliders: THREE.Box3[]) {
    const pos = this.hunterController.getPosition();
    const radius = 0.4;
    const feetY = pos.y - 1.6;
    const playerBox = new THREE.Box3(
      new THREE.Vector3(pos.x - radius, feetY, pos.z - radius),
      new THREE.Vector3(pos.x + radius, feetY + 1.8, pos.z + radius)
    );

    for (const c of colliders) {
      if (!playerBox.intersectsBox(c)) continue;
      const overlapX = Math.min(playerBox.max.x - c.min.x, c.max.x - playerBox.min.x);
      const overlapZ = Math.min(playerBox.max.z - c.min.z, c.max.z - playerBox.min.z);
      if (overlapX < overlapZ) {
        const pushDir = pos.x < (c.min.x + c.max.x) / 2 ? -1 : 1;
        this.hunterController.setPosition(pos.x + pushDir * (overlapX + 0.2), pos.y, pos.z);
      } else {
        const pushDir = pos.z < (c.min.z + c.max.z) / 2 ? -1 : 1;
        this.hunterController.setPosition(pos.x, pos.y, pos.z + pushDir * (overlapZ + 0.2));
      }
      return;
    }
  }

  private updateHunterHUD() {
    this.gameHUD.updateHealth(this.localHealth, HUNTER_MAX_HEALTH);
    this.gameHUD.updateAmmo(this.localAmmo, WEAPON_MAX_AMMO, this.weaponSystem?.getIsReloading() || false);
    const cdGrenade = Math.max(0, HUNTER_GRENADE_COOLDOWN_MS - (Date.now() - this.lastGrenadeTime));
    const cdScan = Math.max(0, HUNTER_SCAN_COOLDOWN_MS - (Date.now() - this.lastScanTime));
    const cdBoost = Math.max(0, 60000 - (Date.now() - this.lastHunterBoostTime));
    const cdPhaseWalk = Math.max(0, HUNTER_PHASEWALK_COOLDOWN_MS - (Date.now() - this.lastPhaseWalkTime));
    const inPhaseWalk = Date.now() < this.phaseWalkEnd;
    this.gameHUD.updateHunterAbilities(cdGrenade, cdScan, this.grenadeMode, cdBoost, cdPhaseWalk, inPhaseWalk);
    this.gameHUD.updateDamageOverlay(this.localHealth, HUNTER_MAX_HEALTH, true);
    this.gameHUD.updatePropInfo("", false);
    this.gameHUD.setSoulModeVisible(false);

    this.minimap.show();
    const pos = this.hunterController.getPosition();
    const rot = this.hunterController.getRotation();
    this.minimap.updatePlayerPosition(pos.x, pos.z, rot.y);
  }

  private updatePropHUD() {
    this.minimap.hide();
    const propDef = this.propRegistry.get(this.localPropId);
    const maxHp = (propDef as any)?.hp || PROP_MAX_HEALTH;
    this.gameHUD.updateHealth(this.localHealth, maxHp);
    this.gameHUD.updatePropInfo(propDef?.name || "", this.localIsLocked);
    const cdInvis = Math.max(0, 120000 - (Date.now() - this.lastAbilityTime));
    const cdSpeed = Math.max(0, 30000 - (Date.now() - this.lastAbility2Time));
    if (cdInvis > 0) {
      this.gameHUD.updateAbility("Invisible", "Q", cdInvis);
    } else if (cdSpeed > 0) {
      this.gameHUD.updateAbility("Speed", "R", cdSpeed);
    } else {
      this.gameHUD.updateAbility("Q:INVIS E:TRANS R:SPEED", "", 0);
    }
    this.gameHUD.updateDamageOverlay(this.localHealth, maxHp, false);
    this.gameHUD.setSoulModeVisible(this.propController.isInSoulMode());
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
  private reloadAnim = 0;
  private isReloadingAnim = false;
  private muzzleFlashTimer = 0;
  private fpMuzzleFlash: THREE.Mesh | null = null;

  triggerGunRecoil() {
    this.recoilPitchVel += 8;
    this.recoilBackVel += 1.5;
    this.muzzleFlashTimer = 0.05;
    if (this.fpMuzzleFlash) {
      this.fpMuzzleFlash.visible = true;
      const s = 0.7 + Math.random() * 0.6;
      this.fpMuzzleFlash.rotation.z = Math.random() * Math.PI;
      this.fpMuzzleFlash.scale.set(s, s, s);
    }
  }

  startReloadAnimation() {
    this.isReloadingAnim = true;
    this.reloadAnim = 0;
  }

  private updateGunViewmodel(dt: number) {
    if (!this.fpGun || this.localRole !== PlayerRole.HUNTER) return;

    const baseX = 0.32, baseY = -0.28, baseZ = -0.55;
    const state = this.input.getState();
    const isMoving = this.input.isPointerLocked() &&
      (state.forward || state.backward || state.left || state.right);

    // Spring-damper recoil
    const springK = 80;
    const dampK = 12;
    this.recoilPitchVel += (-this.recoilPitch * springK - this.recoilPitchVel * dampK) * dt;
    this.recoilPitch += this.recoilPitchVel * dt;
    this.recoilBackVel += (-this.recoilBack * springK - this.recoilBackVel * dampK) * dt;
    this.recoilBack += this.recoilBackVel * dt;

    // Muzzle flash timer
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0 && this.fpMuzzleFlash) {
        this.fpMuzzleFlash.visible = false;
      }
    }

    let bobX = 0, bobY = 0, bobRotZ = 0;
    let reloadOffsetY = 0, reloadOffsetZ = 0, reloadRotX = 0;

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

    // Reload animation (2s total: drop down -> pull mag -> push mag -> raise up)
    if (this.isReloadingAnim) {
      this.reloadAnim += dt;
      const t = this.reloadAnim / 2.0;
      if (t < 0.25) {
        const p = t / 0.25;
        reloadOffsetY = -0.2 * p;
        reloadRotX = 0.4 * p;
      } else if (t < 0.5) {
        reloadOffsetY = -0.2;
        reloadRotX = 0.4;
        reloadOffsetZ = 0.05 * Math.sin((t - 0.25) / 0.25 * Math.PI);
      } else if (t < 0.75) {
        reloadOffsetY = -0.2;
        reloadRotX = 0.4;
        reloadOffsetZ = -0.03 * Math.sin((t - 0.5) / 0.25 * Math.PI);
      } else if (t < 1.0) {
        const p = 1 - (t - 0.75) / 0.25;
        reloadOffsetY = -0.2 * p;
        reloadRotX = 0.4 * p;
      } else {
        this.isReloadingAnim = false;
        this.reloadAnim = 0;
      }
    }

    this.fpGun.position.set(
      baseX + bobX,
      baseY + bobY + reloadOffsetY,
      baseZ + this.recoilBack * 0.08 + reloadOffsetZ
    );
    this.fpGun.rotation.set(
      -this.recoilPitch * 0.03 + reloadRotX,
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
