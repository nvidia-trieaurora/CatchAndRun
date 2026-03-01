import {
  HUNTER_SPEED,
  PROP_SPEED,
  ANTI_CHEAT_SPEED_TOLERANCE,
  ANTI_CHEAT_MIN_FIRE_INTERVAL_MS,
  PlayerRole,
} from "@catch-and-run/shared";
import type { GameRoom } from "../rooms/GameRoom";
import type { PlayerSchema } from "../schemas/PlayerSchema";
import type { PlayerInputData } from "@catch-and-run/shared";
import mapData from "../data/maps/harbor-warehouse.json";

export class AntiCheat {
  private room: GameRoom;

  constructor(room: GameRoom) {
    this.room = room;
  }

  validateMovement(player: PlayerSchema, input: PlayerInputData): boolean {
    if (!this.checkBounds(input.x, input.y, input.z)) {
      return false;
    }

    if (player.lastPositionTime > 0) {
      const dt = (Date.now() - player.lastPositionTime) / 1000;
      if (dt > 0) {
        const dx = input.x - player.x;
        const dy = input.y - player.y;
        const dz = input.z - player.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const maxSpeed =
          player.role === PlayerRole.HUNTER ? HUNTER_SPEED : PROP_SPEED;
        const maxDist = maxSpeed * ANTI_CHEAT_SPEED_TOLERANCE * dt;

        if (dist > maxDist + 1) {
          return false;
        }
      }
    }

    return true;
  }

  validateFireRate(player: PlayerSchema): boolean {
    const now = Date.now();
    if (now - player.lastFireTime < ANTI_CHEAT_MIN_FIRE_INTERVAL_MS) {
      return false;
    }
    return true;
  }

  private checkBounds(x: number, y: number, z: number): boolean {
    const bounds = mapData.bounds;
    return (
      x >= bounds.min.x &&
      x <= bounds.max.x &&
      y >= mapData.killZoneY &&
      y <= bounds.max.y &&
      z >= bounds.min.z &&
      z <= bounds.max.z
    );
  }
}
