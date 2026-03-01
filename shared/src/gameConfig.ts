import * as C from "./constants";

export interface GameConfig {
  maxPlayers: number;
  minPlayersToStart: number;
  countdownDuration: number;
  hidePhaseDuration: number;
  activePhaseDuration: number;
  roundEndDuration: number;
  matchEndDuration: number;
  totalRounds: number;
  huntersPerPlayers: number;
  hunterMaxHealth: number;
  propMaxHealth: number;
  hunterSpeed: number;
  propSpeed: number;
  weaponDamage: number;
  weaponFireRateMs: number;
  weaponMaxAmmo: number;
  weaponReloadTimeMs: number;
  weaponRange: number;
  missPenaltyHp: number;
  propTransformCooldownMs: number;
  propTransformMaxDistance: number;
  hunterRadarCooldownMs: number;
  hunterRadarRange: number;
  propDecoyCooldownMs: number;
  propDecoyRange: number;
  tickRate: number;
  aoiRadius: number;
}

export function getDefaultConfig(): GameConfig {
  return {
    maxPlayers: C.MAX_PLAYERS_PER_ROOM,
    minPlayersToStart: C.MIN_PLAYERS_TO_START,
    countdownDuration: C.COUNTDOWN_DURATION,
    hidePhaseDuration: C.HIDE_PHASE_DURATION,
    activePhaseDuration: C.ACTIVE_PHASE_DURATION,
    roundEndDuration: C.ROUND_END_DURATION,
    matchEndDuration: C.MATCH_END_DURATION,
    totalRounds: C.DEFAULT_TOTAL_ROUNDS,
    huntersPerPlayers: C.HUNTERS_PER_PLAYERS,
    hunterMaxHealth: C.HUNTER_MAX_HEALTH,
    propMaxHealth: C.PROP_MAX_HEALTH,
    hunterSpeed: C.HUNTER_SPEED,
    propSpeed: C.PROP_SPEED,
    weaponDamage: C.WEAPON_DAMAGE,
    weaponFireRateMs: C.WEAPON_FIRE_RATE_MS,
    weaponMaxAmmo: C.WEAPON_MAX_AMMO,
    weaponReloadTimeMs: C.WEAPON_RELOAD_TIME_MS,
    weaponRange: C.WEAPON_RANGE,
    missPenaltyHp: C.MISS_PENALTY_HP,
    propTransformCooldownMs: C.PROP_TRANSFORM_COOLDOWN_MS,
    propTransformMaxDistance: C.PROP_TRANSFORM_MAX_DISTANCE,
    hunterRadarCooldownMs: C.HUNTER_RADAR_COOLDOWN_MS,
    hunterRadarRange: C.HUNTER_RADAR_RANGE,
    propDecoyCooldownMs: C.PROP_DECOY_COOLDOWN_MS,
    propDecoyRange: C.PROP_DECOY_RANGE,
    tickRate: C.SERVER_TICK_RATE,
    aoiRadius: C.AOI_RADIUS,
  };
}
