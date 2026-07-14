import { PROP_TRANSFORM_COOLDOWN_MS } from "@catch-and-run/shared";
import type { GameRoom } from "../rooms/GameRoom";
import type { PlayerSchema } from "../schemas/PlayerSchema";
import { getMapData } from "../data/maps";

interface TransformResult {
  success: boolean;
  propId?: string;
  reason?: string;
}

export class PropTransformValidator {
  private room: GameRoom;
  private validPropIds = new Set<string>();
  private cachedMapId = "";

  constructor(room: GameRoom) {
    this.room = room;
  }

  private ensureMapCache() {
    const mapId = this.room.state.config.mapId;
    if (mapId === this.cachedMapId) return;
    this.cachedMapId = mapId;
    this.validPropIds = new Set(getMapData(mapId).props.map((p) => p.id));
  }

  validate(player: PlayerSchema, propId: string): TransformResult {
    this.ensureMapCache();
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
