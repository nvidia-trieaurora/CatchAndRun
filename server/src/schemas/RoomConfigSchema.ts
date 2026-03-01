import { Schema, type } from "@colyseus/schema";
import {
  MAX_PLAYERS_PER_ROOM,
  ACTIVE_PHASE_DURATION,
  DEFAULT_TOTAL_ROUNDS,
  HUNTERS_PER_PLAYERS,
} from "@catch-and-run/shared";

export class RoomConfigSchema extends Schema {
  @type("number") maxPlayers: number = MAX_PLAYERS_PER_ROOM;
  @type("number") roundTime: number = ACTIVE_PHASE_DURATION;
  @type("number") totalRounds: number = DEFAULT_TOTAL_ROUNDS;
  @type("number") huntersPerPlayers: number = HUNTERS_PER_PLAYERS;
  @type("string") mapId: string = "harbor-warehouse";
}
