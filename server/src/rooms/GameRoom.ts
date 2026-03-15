import { Room, Client, matchMaker } from "colyseus";
import { GameState } from "../schemas/GameState";
import { PlayerSchema } from "../schemas/PlayerSchema";
import { ChatMessage } from "../schemas/ChatMessage";
import { generateRoomCode } from "../utils/RoomCodeGenerator";
import { MatchStateMachine } from "../systems/MatchStateMachine";
import { HitValidation } from "../systems/HitValidation";
import { PropTransformValidator } from "../systems/PropTransformValidator";
import { AntiCheat } from "../systems/AntiCheat";
import { ScoringSystem } from "../systems/ScoringSystem";
import { RoleAssigner } from "../systems/RoleAssigner";
import { SpawnManager } from "../systems/SpawnManager";
import { SnapshotBuffer } from "../utils/SnapshotBuffer";
import {
  GamePhase,
  PlayerRole,
  ClientMessage,
  ServerMessage,
  type PlayerInputData,
  type ShootData,
  type TransformRequestData,
  type ChatData,
  type SetConfigData,
  type ThrowGrenadeData,
  type PlaySoundMemeData,
  MAX_PLAYERS_PER_ROOM,
  MAX_ROOMS,
  HUNTER_MAX_HEALTH,
  PROP_MAX_HEALTH,
  WEAPON_MAX_AMMO,
  HUNTER_SCAN_COOLDOWN_MS,
  HUNTER_SCAN_RADIUS,
  HUNTER_GRENADE_COOLDOWN_MS,
  HUNTER_GRENADE_RADIUS,
  HUNTER_GRENADE_STUN_MS,
  HUNTER_GRENADE_THROW_SPEED,
  HUNTER_GRENADE_UP_BOOST,
  HUNTER_GRENADE_GRAVITY,
} from "@catch-and-run/shared";
import mapData from "../data/maps/harbor-warehouse.json";

interface RoomCreateOptions {
  roomName?: string;
  isPrivate?: boolean;
  passcode?: string;
  nickname?: string;
  maxPlayers?: number;
}

export class GameRoom extends Room<GameState> {
  private matchSM!: MatchStateMachine;
  private hitValidation!: HitValidation;
  private propValidator!: PropTransformValidator;
  private antiCheat!: AntiCheat;
  private scoring!: ScoringSystem;
  private roleAssigner!: RoleAssigner;
  private spawnManager!: SpawnManager;
  private snapshotBuffer!: SnapshotBuffer;
  private passcode: string = "";

  async onCreate(options: RoomCreateOptions) {
    const existingRooms = await matchMaker.query({ name: "game_room" });
    if (existingRooms.length >= MAX_ROOMS) {
      throw new Error(`Server full: max ${MAX_ROOMS} rooms allowed`);
    }

    const state = new GameState();
    state.roomName = options.roomName || "Game Room";
    state.isPrivate = options.isPrivate || false;
    state.config.maxPlayers = options.maxPlayers || MAX_PLAYERS_PER_ROOM;

    if (state.isPrivate && options.passcode) {
      this.passcode = options.passcode.toUpperCase();
      state.roomCode = this.passcode;
    } else {
      state.roomCode = generateRoomCode();
    }

    this.setState(state);
    this.maxClients = state.config.maxPlayers;

    void this.setMetadata({
      roomName: state.roomName,
      roomCode: state.roomCode,
      mapId: state.config.mapId,
      phase: "waiting",
      isPrivate: state.isPrivate,
    });

    this.snapshotBuffer = new SnapshotBuffer();
    this.matchSM = new MatchStateMachine(this);
    this.hitValidation = new HitValidation(this, this.snapshotBuffer);
    this.propValidator = new PropTransformValidator(this);
    this.antiCheat = new AntiCheat(this);
    this.scoring = new ScoringSystem(this);
    this.roleAssigner = new RoleAssigner();
    this.spawnManager = new SpawnManager(mapData as any);

    this.registerMessages();

    this.setSimulationInterval((dt) => this.update(dt), 1000 / 20);
    this.setPatchRate(1000 / 20);
  }

  private registerMessages() {
    this.onMessage(ClientMessage.PLAYER_INPUT, (client, data: PlayerInputData) => {
      this.handlePlayerInput(client, data);
    });

    this.onMessage(ClientMessage.SHOOT, (client, data: ShootData) => {
      this.handleShoot(client, data);
    });

    this.onMessage(ClientMessage.RELOAD, (client) => {
      this.handleReload(client);
    });

    this.onMessage(ClientMessage.TRANSFORM_REQUEST, (client, data: TransformRequestData) => {
      this.handleTransformRequest(client, data);
    });

    this.onMessage(ClientMessage.LOCK_POSE, (client) => {
      this.handleLockPose(client);
    });

    this.onMessage(ClientMessage.USE_ABILITY, (client) => {
      this.handleUseAbility(client);
    });

    this.onMessage(ClientMessage.CHAT, (client, data: ChatData) => {
      this.handleChat(client, data);
    });

    this.onMessage(ClientMessage.READY_TOGGLE, (client) => {
      this.handleReadyToggle(client);
    });

    this.onMessage(ClientMessage.START_GAME, (client) => {
      this.handleStartGame(client);
    });

    this.onMessage(ClientMessage.SET_CONFIG, (client, data: SetConfigData) => {
      this.handleSetConfig(client, data);
    });

    this.onMessage(ClientMessage.SELECT_MEME, (client, data: { memeId: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (player && data.memeId) {
        player.memeId = data.memeId;
      }
    });

    this.onMessage(ClientMessage.USE_ABILITY_2, (client) => {
      this.handleUseAbility2(client);
    });

    this.onMessage(ClientMessage.THROW_GRENADE, (client, data: ThrowGrenadeData) => {
      this.handleThrowGrenade(client, data);
    });

    this.onMessage(ClientMessage.SCAN_AREA, (client) => {
      this.handleScanArea(client);
    });

    this.onMessage(ClientMessage.PLAY_SOUND_MEME, (client, data: PlaySoundMemeData) => {
      this.handleSoundMeme(client, data);
    });
  }

  onAuth(_client: Client, options: { nickname?: string; passcode?: string }) {
    if (this.state.isPrivate && this.passcode) {
      if (!options.passcode || options.passcode !== this.passcode) {
        throw new Error("Invalid passcode");
      }
    }
    return true;
  }

  onJoin(client: Client, options: { nickname?: string; passcode?: string }) {
    const player = new PlayerSchema();
    player.sessionId = client.sessionId;
    player.nickname = options.nickname || `Player${Math.floor(Math.random() * 1000)}`;

    if (this.state.players.size === 0) {
      player.isHost = true;
      this.state.hostSessionId = client.sessionId;
    }

    const isGameRunning = this.state.phase !== GamePhase.WAITING && this.state.phase !== GamePhase.COUNTDOWN;
    if (isGameRunning) {
      player.isSpectator = true;
      player.role = PlayerRole.SPECTATOR;
      player.isAlive = false;
      player.isReady = true;
    }

    this.state.players.set(client.sessionId, player);

    const sysMsg = new ChatMessage();
    sysMsg.sender = "System";
    sysMsg.message = isGameRunning
      ? `${player.nickname} joined as spectator (will play next round)`
      : `${player.nickname} joined the room`;
    sysMsg.timestamp = Date.now();
    this.state.chat.push(sysMsg);

    this.broadcastRoomState();
  }

  onLeave(client: Client, _consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const nickname = player.nickname;
    const wasHost = player.isHost;

    this.state.players.delete(client.sessionId);

    if (wasHost && this.state.players.size > 0) {
      const newHostId = Array.from(this.state.players.keys())[0];
      const newHost = this.state.players.get(newHostId)!;
      newHost.isHost = true;
      this.state.hostSessionId = newHostId;
    }

    const sysMsg = new ChatMessage();
    sysMsg.sender = "System";
    sysMsg.message = `${nickname} left the room`;
    sysMsg.timestamp = Date.now();
    this.state.chat.push(sysMsg);

    if (this.state.phase === GamePhase.ACTIVE || this.state.phase === GamePhase.HIDING) {
      this.matchSM.checkRoundEndCondition();
    }

    if (this.state.players.size === 0) {
      void this.disconnect();
    }
  }

  private update(dt: number) {
    this.matchSM.update(dt);

    if (this.state.phase === GamePhase.ACTIVE) {
      this.scoring.updateSurvivalScores(dt);
      this.saveSnapshot();
    }

    this.broadcastRoomState();
  }

  public broadcastRoomState() {
    const players: any[] = [];
    this.state.players.forEach((p, sid) => {
      players.push({
        sessionId: sid,
        nickname: p.nickname,
        role: p.role,
        x: p.x, y: p.y, z: p.z,
        rotX: p.rotX, rotY: p.rotY,
        health: p.health,
        currentPropId: p.currentPropId,
        isLocked: p.isLocked,
        isReady: p.isReady,
        isAlive: p.isAlive,
        score: p.score,
        ammo: p.ammo,
        kills: p.kills,
        isHost: p.isHost,
        memeId: p.memeId,
        isSpectator: p.isSpectator,
      });
    });

    const chat: any[] = [];
    this.state.chat.forEach((m) => {
      chat.push({ sender: m.sender, message: m.message, timestamp: m.timestamp });
    });

    this.broadcast(ServerMessage.ROOM_STATE, {
      phase: this.state.phase,
      timer: this.state.timer,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      roomName: this.state.roomName,
      roomCode: this.state.roomCode,
      isPrivate: this.state.isPrivate,
      hostSessionId: this.state.hostSessionId,
      players,
      chat,
    });
  }

  private saveSnapshot() {
    const positions = new Map<string, { x: number; y: number; z: number }>();
    this.state.players.forEach((player, sessionId) => {
      if (player.isAlive) {
        positions.set(sessionId, { x: player.x, y: player.y, z: player.z });
      }
    });
    this.snapshotBuffer.push(Date.now(), positions);
  }

  private handlePlayerInput(client: Client, data: PlayerInputData) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isAlive) return;

    // During HIDING, hunters can move but only inside the jail (-49 to -35 on X, -7 to 7 on Z)
    if (this.state.phase === GamePhase.HIDING && player.role === PlayerRole.HUNTER) {
      data.x = Math.max(-48, Math.min(-36, data.x));
      data.z = Math.max(-6, Math.min(6, data.z));
      data.y = Math.max(0, Math.min(3, data.y));
    }

    if (this.state.phase !== GamePhase.ACTIVE && this.state.phase !== GamePhase.HIDING) return;

    if (player.isLocked && player.role === PlayerRole.PROP) return;

    if (!this.antiCheat.validateMovement(player, data)) return;

    player.x = data.x;
    player.y = data.y;
    player.z = data.z;
    player.rotX = data.rotX;
    player.rotY = data.rotY;
    player.lastInputSeq = data.seq;
    player.lastPositionTime = Date.now();
  }

  private handleShoot(client: Client, data: ShootData) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isAlive) return;
    if (player.role !== PlayerRole.HUNTER) return;
    if (this.state.phase !== GamePhase.ACTIVE) return;

    if (!this.antiCheat.validateFireRate(player)) return;

    if (player.ammo <= 0) return;

    player.ammo--;
    player.lastFireTime = Date.now();

    // Broadcast shot to ALL clients so everyone sees the tracer
    this.broadcast(ServerMessage.SHOT_FIRED, {
      shooterSessionId: client.sessionId,
      originX: data.originX, originY: data.originY, originZ: data.originZ,
      dirX: data.dirX, dirY: data.dirY, dirZ: data.dirZ,
    });

    const hitResult = this.hitValidation.processShot(client.sessionId, data);

    if (hitResult.hitPlayerSessionId) {
      const target = this.state.players.get(hitResult.hitPlayerSessionId);
      if (target && target.isAlive && target.role === PlayerRole.PROP) {
        target.health -= hitResult.damage;
        const killed = target.health <= 0;
        if (killed) {
          target.health = 0;
          target.isAlive = false;
          target.role = PlayerRole.SPECTATOR;
          player.kills++;
          this.scoring.onPropKilled(client.sessionId);
        }

        client.send(ServerMessage.HIT_CONFIRMED, {
          targetSessionId: hitResult.hitPlayerSessionId,
          damage: hitResult.damage,
          killed,
        });

        const targetClient = this.clients.find(
          (c) => c.sessionId === hitResult.hitPlayerSessionId
        );
        targetClient?.send(ServerMessage.PLAYER_HIT, {
          attackerSessionId: client.sessionId,
          damage: hitResult.damage,
          remainingHealth: target.health,
        });

        if (killed) {
          this.broadcast(ServerMessage.PLAYER_KILLED, {
            killerSessionId: client.sessionId,
            killerNickname: player.nickname,
            victimSessionId: hitResult.hitPlayerSessionId,
            victimNickname: target.nickname,
          });
          this.matchSM.checkRoundEndCondition();
        }
      }
    } else if (hitResult.hitEnvironment) {
      player.health -= this.state.config.maxPlayers > 0 ? 5 : 5;
      if (player.health <= 0) player.health = 1;
    }
  }

  private handleReload(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isAlive) return;
    if (player.role !== PlayerRole.HUNTER) return;
    player.ammo = WEAPON_MAX_AMMO;
  }

  private handleTransformRequest(client: Client, data: TransformRequestData) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isAlive) return;
    if (player.role !== PlayerRole.PROP) return;
    if (this.state.phase !== GamePhase.ACTIVE && this.state.phase !== GamePhase.HIDING) return;

    const result = this.propValidator.validate(player, data.propId);
    client.send(ServerMessage.TRANSFORM_RESULT, result);

    if (result.success) {
      player.currentPropId = data.propId;
      player.lastTransformTime = Date.now();
      player.transformCount++;
      const propDef = (mapData as any).props.find((p: any) => p.id === data.propId);
      if (propDef?.hp) {
        player.health = propDef.hp;
      }
    }
  }

  private handleLockPose(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isAlive) return;
    if (player.role !== PlayerRole.PROP) return;
    player.isLocked = !player.isLocked;
  }

  private lastAbility2Time = new Map<string, number>();

  private handleUseAbility(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isAlive) return;
    if (this.state.phase !== GamePhase.ACTIVE) return;

    const now = Date.now();

    if (player.role === PlayerRole.PROP) {
      // Q = Invisibility: become invisible for 5s, cooldown 120s
      const cd = 120000;
      if (now - player.lastAbilityTime < cd) return;
      player.lastAbilityTime = now;

      this.broadcast(ServerMessage.PROP_INVISIBLE, {
        sessionId: client.sessionId,
        duration: 7000,
        invisible: true,
      });

      setTimeout(() => {
        this.broadcast(ServerMessage.PROP_INVISIBLE, {
          sessionId: client.sessionId,
          duration: 0,
          invisible: false,
        });
      }, 7000);

      client.send(ServerMessage.ABILITY_RESULT, {
        type: "invisibility",
        duration: 7000,
      });
    }
  }

  private handleThrowGrenade(client: Client, data: ThrowGrenadeData) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isAlive) return;
    if (player.role !== PlayerRole.HUNTER) return;
    if (this.state.phase !== GamePhase.ACTIVE) return;

    const now = Date.now();
    if (now - player.lastAbilityTime < HUNTER_GRENADE_COOLDOWN_MS) return;
    player.lastAbilityTime = now;

    const hLen = Math.sqrt(data.dirX * data.dirX + data.dirZ * data.dirZ) || 0.01;
    const hdx = data.dirX / hLen;
    const hdz = data.dirZ / hLen;

    const vx = hdx * HUNTER_GRENADE_THROW_SPEED;
    const vz = hdz * HUNTER_GRENADE_THROW_SPEED;
    const vy = HUNTER_GRENADE_UP_BOOST + Math.max(0, data.dirY) * 5;

    // Solve for time when grenade hits ground (y=0)
    // 0 = originY + vy*t + 0.5*g*t^2
    const a = 0.5 * HUNTER_GRENADE_GRAVITY;
    const b = vy;
    const c = data.originY;
    const disc = b * b - 4 * a * c;
    const flightTime = disc > 0
      ? (-b - Math.sqrt(disc)) / (2 * a)
      : 1.0;
    const clampedTime = Math.max(0.3, Math.min(flightTime, 2.0));

    const landX = data.originX + vx * clampedTime;
    const landZ = data.originZ + vz * clampedTime;

    this.broadcast(ServerMessage.GRENADE_THROWN, {
      originX: data.originX, originY: data.originY, originZ: data.originZ,
      dirX: data.dirX, dirY: data.dirY, dirZ: data.dirZ,
      landX, landZ, flightTime: clampedTime,
      throwerSessionId: client.sessionId,
    });

    const flightMs = Math.round(clampedTime * 1000);
    setTimeout(() => {
      if (this.state.phase !== GamePhase.ACTIVE) return;

      const stunnedPlayers: string[] = [];
      this.state.players.forEach((other, sid) => {
        if (other.role !== PlayerRole.PROP || !other.isAlive) return;
        const dx = other.x - landX;
        const dz = other.z - landZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= HUNTER_GRENADE_RADIUS) {
          stunnedPlayers.push(sid);
          other.isLocked = true;
          setTimeout(() => {
            const p = this.state.players.get(sid);
            if (p) p.isLocked = false;
          }, HUNTER_GRENADE_STUN_MS);
        }
      });

      this.broadcast(ServerMessage.GRENADE_EXPLODE, {
        x: landX, y: 0, z: landZ,
        stunnedCount: stunnedPlayers.length,
        stunnedSessionIds: stunnedPlayers,
      });

      stunnedPlayers.forEach((sid) => {
        const cl = this.clients.find((c) => c.sessionId === sid);
        cl?.send(ServerMessage.PROP_STUNNED, { duration: HUNTER_GRENADE_STUN_MS });
      });
    }, flightMs);
  }

  private handleScanArea(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isAlive) return;
    if (player.role !== PlayerRole.HUNTER) return;
    if (this.state.phase !== GamePhase.ACTIVE) return;

    const now = Date.now();
    if (now - player.lastScanTime < HUNTER_SCAN_COOLDOWN_MS) return;
    player.lastScanTime = now;

    const detected: { sessionId: string; x: number; y: number; z: number }[] = [];
    this.state.players.forEach((other, sid) => {
      if (other.role !== PlayerRole.PROP || !other.isAlive) return;
      const dx = other.x - player.x;
      const dy = other.y - player.y;
      const dz = other.z - player.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist <= HUNTER_SCAN_RADIUS) {
        detected.push({ sessionId: sid, x: other.x, y: other.y, z: other.z });
      }
    });

    client.send(ServerMessage.SCAN_RESULT, {
      count: detected.length,
      detected,
    });

    // Notify all props that hunter used scan
    this.state.players.forEach((other, sid) => {
      if (other.role === PlayerRole.PROP && other.isAlive) {
        const propClient = this.clients.find((c) => c.sessionId === sid);
        if (propClient) {
          propClient.send(ServerMessage.SCAN_RESULT, {
            warning: true,
            hunterName: player.nickname,
          });
        }
      }
    });
  }

  private handleUseAbility2(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isAlive) return;
    if (this.state.phase !== GamePhase.ACTIVE && this.state.phase !== GamePhase.HIDING) return;
    if (player.role !== PlayerRole.PROP) return;

    const now = Date.now();
    const lastUse = this.lastAbility2Time.get(client.sessionId) || 0;
    const cd = 30000;
    if (now - lastUse < cd) return;
    this.lastAbility2Time.set(client.sessionId, now);

    this.broadcast(ServerMessage.SPEED_BOOST, {
      sessionId: client.sessionId,
      x: player.x, y: player.y, z: player.z,
    });

    client.send(ServerMessage.ABILITY_RESULT, {
      type: "speedBoost",
      duration: 3000,
    });
  }

  private handleChat(client: Client, data: ChatData) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!data.message || data.message.trim().length === 0) return;

    const trimmed = data.message.trim().substring(0, 200);

    const msg = new ChatMessage();
    msg.sender = player.nickname;
    msg.message = trimmed;
    msg.timestamp = Date.now();
    this.state.chat.push(msg);

    while (this.state.chat.length > 50) {
      this.state.chat.shift();
    }

    this.broadcast(ServerMessage.CHAT_MESSAGE, {
      sender: player.nickname,
      message: trimmed,
    });
  }

  private handleReadyToggle(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (this.state.phase !== GamePhase.WAITING) return;
    player.isReady = !player.isReady;
  }

  private handleStartGame(client: Client) {
    if (client.sessionId !== this.state.hostSessionId) return;
    if (this.state.phase !== GamePhase.WAITING) return;
    if (this.state.players.size < 2) return;

    void this.setMetadata({
      roomName: this.state.roomName,
      roomCode: this.state.roomCode,
      mapId: this.state.config.mapId,
      phase: "active",
      isPrivate: this.state.isPrivate,
    });
    this.matchSM.startMatch();
  }

  private handleSetConfig(client: Client, data: SetConfigData) {
    if (client.sessionId !== this.state.hostSessionId) return;
    if (this.state.phase !== GamePhase.WAITING) return;

    if (data.maxPlayers !== undefined) {
      this.state.config.maxPlayers = Math.min(Math.max(data.maxPlayers, 2), MAX_PLAYERS_PER_ROOM);
      this.maxClients = this.state.config.maxPlayers;
    }
    if (data.roundTime !== undefined) {
      this.state.config.roundTime = Math.min(Math.max(data.roundTime, 60), 600);
    }
    if (data.totalRounds !== undefined) {
      this.state.config.totalRounds = Math.min(Math.max(data.totalRounds, 1), 10);
    }
    if (data.huntersPerPlayers !== undefined) {
      this.state.config.huntersPerPlayers = Math.min(Math.max(data.huntersPerPlayers, 2), 8);
    }
  }

  private lastSoundMemeTime = new Map<string, number>();

  private handleSoundMeme(client: Client, data: PlaySoundMemeData) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isAlive) return;
    if (this.state.phase !== GamePhase.ACTIVE && this.state.phase !== GamePhase.HIDING) return;

    const now = Date.now();
    const lastTime = this.lastSoundMemeTime.get(client.sessionId) || 0;
    if (now - lastTime < 3000) return;
    this.lastSoundMemeTime.set(client.sessionId, now);

    const mapCX = ((-55) + 63) / 2;
    const mapCZ = ((-43) + 47) / 2;
    let zone = "A";
    if (player.x >= mapCX && player.z < mapCZ) zone = "B";
    else if (player.x < mapCX && player.z >= mapCZ) zone = "C";
    else if (player.x >= mapCX && player.z >= mapCZ) zone = "D";

    this.broadcast(ServerMessage.SOUND_MEME_PLAYED, {
      soundId: data.soundId,
      x: player.x,
      z: player.z,
      zone,
      senderSessionId: client.sessionId,
    });
  }

  public initRound() {
    // Clear spectator flag so mid-game joiners participate in this round
    this.state.players.forEach((player) => {
      player.isSpectator = false;
    });

    const playerIds = Array.from(this.state.players.keys());
    const roles = this.roleAssigner.assignRoles(
      playerIds,
      this.state.config.huntersPerPlayers
    );

    roles.forEach((role, sessionId) => {
      const player = this.state.players.get(sessionId)!;
      player.role = role;
      player.isAlive = true;
      player.isLocked = false;
      player.lastFireTime = 0;
      player.lastTransformTime = 0;
      player.lastAbilityTime = 0;

      if (role === PlayerRole.HUNTER) {
        player.health = HUNTER_MAX_HEALTH;
        player.ammo = WEAPON_MAX_AMMO;
        player.currentPropId = "";
        const spawn = this.spawnManager.getHunterSpawn();
        player.x = spawn.position.x;
        player.y = spawn.position.y;
        player.z = spawn.position.z;
        player.rotY = spawn.rotation;
      } else {
        const randomProp = (mapData as any).props[Math.floor(Math.random() * (mapData as any).props.length)];
        player.health = randomProp.hp || PROP_MAX_HEALTH;
        player.ammo = 0;
        player.currentPropId = randomProp.id;
        player.transformCount = 0;
        const spawn = this.spawnManager.getPropSpawn();
        player.x = spawn.position.x;
        player.y = spawn.position.y;
        player.z = spawn.position.z;
        player.rotY = spawn.rotation;
      }
    });
  }
}
