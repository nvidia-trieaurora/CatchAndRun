import { Schema, type } from "@colyseus/schema";

export class ChatMessage extends Schema {
  @type("string") sender: string = "";
  @type("string") message: string = "";
  @type("number") timestamp: number = 0;
}
