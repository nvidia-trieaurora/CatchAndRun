import {
  PlayerRole,
  SCORE_PROP_KILL,
  SCORE_PROP_SURVIVE_PER_SEC,
} from "@catch-and-run/shared";
import type { GameRoom } from "../rooms/GameRoom";

export class ScoringSystem {
  private room: GameRoom;
  private survivalAccumulator: number = 0;

  constructor(room: GameRoom) {
    this.room = room;
  }

  onPropKilled(hunterSessionId: string) {
    const hunter = this.room.state.players.get(hunterSessionId);
    if (hunter) {
      hunter.score += SCORE_PROP_KILL;
    }
  }

  updateSurvivalScores(dt: number) {
    this.survivalAccumulator += dt / 1000;

    if (this.survivalAccumulator >= 2) {
      const ticks = Math.floor(this.survivalAccumulator / 2);
      this.survivalAccumulator -= ticks * 2;

      this.room.state.players.forEach((player) => {
        if (player.role === PlayerRole.PROP && player.isAlive) {
          player.score += SCORE_PROP_SURVIVE_PER_SEC * ticks;
        }
      });
    }
  }
}
