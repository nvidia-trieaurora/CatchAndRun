import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import { PlayerSchema } from "./PlayerSchema";
import { RoomConfigSchema } from "./RoomConfigSchema";
import { ChatMessage } from "./ChatMessage";
import { GamePhase } from "@catch-and-run/shared";

export class GameState extends Schema {
  @type("string") phase: string = GamePhase.WAITING;
  @type("number") timer: number = 0;
  @type("number") currentRound: number = 0;
  @type("number") totalRounds: number = 2;
  @type("string") roomName: string = "";
  @type("string") roomCode: string = "";
  @type("boolean") isPrivate: boolean = false;
  @type("string") hostSessionId: string = "";
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type([ChatMessage]) chat = new ArraySchema<ChatMessage>();
  @type(RoomConfigSchema) config = new RoomConfigSchema();
}
