import { PlayerRole, ServerMessage } from "@catch-and-run/shared";
import type { PlayerSchema } from "../schemas/PlayerSchema";

export interface EnvironmentalEliminationRoom {
  broadcast(type: string, payload: unknown): void;
  matchSM: { checkRoundEndCondition(): void };
}

export function eliminatePlayerInWater(
  room: EnvironmentalEliminationRoom,
  victimSessionId: string,
  victim: PlayerSchema,
) {
  if (!victim.isAlive) return;

  victim.health = 0;
  victim.isAlive = false;
  victim.isLocked = false;
  victim.currentPropId = "";
  victim.role = PlayerRole.SPECTATOR;

  const outwardX = victim.x - 4;
  const outwardZ = victim.z - 2;
  const outwardLength = Math.hypot(outwardX, outwardZ) || 1;
  const cameraDistance = 8;

  room.broadcast(ServerMessage.PLAYER_DROWNED, {
    victimSessionId,
    victimNickname: victim.nickname,
    x: victim.x,
    y: victim.y,
    z: victim.z,
    cinematicMs: 2400,
    cameraX: victim.x + (outwardX / outwardLength) * cameraDistance,
    cameraY: Math.max(4.5, victim.y + 5),
    cameraZ: victim.z + (outwardZ / outwardLength) * cameraDistance,
  });
  room.matchSM.checkRoundEndCondition();
}
