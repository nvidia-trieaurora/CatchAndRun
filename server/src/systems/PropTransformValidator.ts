import { PROP_TRANSFORM_COOLDOWN_MS } from "@catch-and-run/shared";
import type { GameRoom } from "../rooms/GameRoom";
import type { PlayerSchema } from "../schemas/PlayerSchema";
import mapData from "../data/maps/harbor-warehouse.json";

interface TransformResult {
  success: boolean;
  propId?: string;
  reason?: string;
}

export class PropTransformValidator {
  private room: GameRoom;
  private validPropIds: Set<string>;

  constructor(room: GameRoom) {
    this.room = room;
    this.validPropIds = new Set(mapData.props.map((p) => p.id));
  }

  validate(player: PlayerSchema, propId: string): TransformResult {
    if (!this.validPropIds.has(propId)) {
      return { success: false, reason: "Invalid prop ID" };
    }

    if (player.transformCount >= 2) {
      return { success: false, reason: "Max transforms reached (2/2)" };
    }

    const now = Date.now();
    if (now - player.lastTransformTime < PROP_TRANSFORM_COOLDOWN_MS) {
      const remaining = Math.ceil(
        (PROP_TRANSFORM_COOLDOWN_MS - (now - player.lastTransformTime)) / 1000
      );
      return { success: false, reason: `Cooldown: ${remaining}s remaining` };
    }

    if (player.currentPropId === propId) {
      return { success: false, reason: "Already transformed into this prop" };
    }

    return { success: true, propId };
  }
}
