export enum GamePhase {
  WAITING = "waiting",
  COUNTDOWN = "countdown",
  HIDING = "hiding",
  ACTIVE = "active",
  ROUND_END = "roundEnd",
  MATCH_END = "matchEnd",
}

export enum PlayerRole {
  HUNTER = "hunter",
  PROP = "prop",
  SPECTATOR = "spectator",
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface PropDefinition {
  id: string;
  name: string;
  meshType: "box" | "cylinder" | "sphere" | "custom";
  dimensions: Vector3;
  color: number;
  rarity: "common" | "uncommon" | "rare";
  minScale: number;
  maxScale: number;
  hp?: number;
}

export interface SpawnPoint {
  position: Vector3;
  rotation: number;
  zone: "hunterSpawn" | "warehouse" | "office" | "containerYard";
}

export interface MapData {
  id: string;
  name: string;
  bounds: { min: Vector3; max: Vector3 };
  hunterSpawnPoints: SpawnPoint[];
  propSpawnPoints: SpawnPoint[];
  props: PropDefinition[];
  killZoneY: number;
}

export interface RoomListEntry {
  roomId: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  mapId: string;
  phase: GamePhase;
  isPrivate: boolean;
}
