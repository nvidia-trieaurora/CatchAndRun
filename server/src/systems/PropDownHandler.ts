import {
  GameMode,
  PlayerRole,
  ServerMessage,
  WEAPON_MAX_AMMO,
  INFECTION_CONVERT_HEAL,
} from "@catch-and-run/shared";
import type { PlayerSchema } from "../schemas/PlayerSchema";

/** Structural slice of GameRoom needed to resolve a downed prop. */
export interface PropDownRoom {
  state: {
    config: { gameMode: string };
    players: { forEach(cb: (p: PlayerSchema) => void): void };
  };
  broadcast(type: string, payload: unknown): void;
  scoring: { onPropKilled(hunterSessionId: string): void };
  matchSM: { checkRoundEndCondition(): void };
}

/**
 * A prop reached 0 HP. Classic: they die and spectate. Infection: they
 * convert to a hunter on the spot and join the hunt.
 */
export function handlePropDown(
  room: PropDownRoom,
  killerSessionId: string,
  killer: PlayerSchema,
  victimSessionId: string,
  victim: PlayerSchema
) {
  killer.kills++;
  room.scoring.onPropKilled(killerSessionId);

  if (room.state.config.gameMode === GameMode.INFECTION) {
    victim.role = PlayerRole.HUNTER;
    victim.health = INFECTION_CONVERT_HEAL;
    victim.ammo = WEAPON_MAX_AMMO;
    victim.currentPropId = "";
    victim.isLocked = false;

    let remainingProps = 0;
    room.state.players.forEach((p) => {
      if (p.isAlive && p.role === PlayerRole.PROP) remainingProps++;
    });

    room.broadcast(ServerMessage.PLAYER_INFECTED, {
      victimSessionId,
      killerNickname: killer.nickname,
      victimNickname: victim.nickname,
      remainingProps,
    });
  } else {
    victim.health = 0;
    victim.isAlive = false;
    victim.role = PlayerRole.SPECTATOR;

    room.broadcast(ServerMessage.PLAYER_KILLED, {
      killerSessionId,
      killerNickname: killer.nickname,
      victimSessionId,
      victimNickname: victim.nickname,
    });
  }

  room.matchSM.checkRoundEndCondition();
}
