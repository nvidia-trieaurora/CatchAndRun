export enum ClientMessage {
  PLAYER_INPUT = "playerInput",
  SHOOT = "shoot",
  RELOAD = "reload",
  TRANSFORM_REQUEST = "transformRequest",
  LOCK_POSE = "lockPose",
  USE_ABILITY = "useAbility",
  CHAT = "chat",
  READY_TOGGLE = "readyToggle",
  START_GAME = "startGame",
  SET_CONFIG = "setConfig",
  SELECT_MAP = "selectMap",
  SELECT_MEME = "selectMeme",
  USE_ABILITY_2 = "useAbility2",
  THROW_GRENADE = "throwGrenade",
  SCAN_AREA = "scanArea",
}

export enum ServerMessage {
  HIT_CONFIRMED = "hitConfirmed",
  PLAYER_HIT = "playerHit",
  PLAYER_KILLED = "playerKilled",
  TRANSFORM_RESULT = "transformResult",
  ABILITY_RESULT = "abilityResult",
  RADAR_PING = "radarPing",
  DECOY_SOUND = "decoySound",
  ROUND_RESULTS = "roundResults",
  MATCH_RESULTS = "matchResults",
  ERROR = "error",
  ROOM_LIST = "roomList",
  ROOM_STATE = "roomState",
  SHOT_FIRED = "shotFired",
  SPEED_BOOST = "speedBoost",
  GRENADE_EXPLODE = "grenadeExplode",
  PROP_STUNNED = "propStunned",
  PROP_INVISIBLE = "propInvisible",
  GRENADE_THROWN = "grenadeThrown",
  SCAN_RESULT = "scanResult",
  CHAT_MESSAGE = "chatMessage",
}

export interface PlayerInputData {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  seq: number;
  timestamp: number;
}

export interface ShootData {
  originX: number;
  originY: number;
  originZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  timestamp: number;
}

export interface TransformRequestData {
  propId: string;
}

export interface ChatData {
  message: string;
}

export interface SetConfigData {
  maxPlayers?: number;
  roundTime?: number;
  totalRounds?: number;
  huntersPerPlayers?: number;
}

export interface HitConfirmedData {
  targetSessionId: string;
  damage: number;
  killed: boolean;
}

export interface PlayerHitData {
  attackerSessionId: string;
  damage: number;
  remainingHealth: number;
}

export interface RadarPingData {
  dirX: number;
  dirZ: number;
  distance: number;
}

export interface DecoySoundData {
  x: number;
  y: number;
  z: number;
  sourceSessionId: string;
}

export interface ThrowGrenadeData {
  originX: number;
  originY: number;
  originZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
}
