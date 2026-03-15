import { Schema, type } from "@colyseus/schema";
import { WEAPON_MAX_AMMO } from "@catch-and-run/shared";

export class PlayerSchema extends Schema {
  @type("string") sessionId: string = "";
  @type("string") nickname: string = "";
  @type("string") role: string = "prop";
  @type("number") x: number = 0;
  @type("number") y: number = 1;
  @type("number") z: number = 0;
  @type("number") rotX: number = 0;
  @type("number") rotY: number = 0;
  @type("number") health: number = 100;
  @type("string") currentPropId: string = "";
  @type("boolean") isLocked: boolean = false;
  @type("boolean") isReady: boolean = false;
  @type("boolean") isAlive: boolean = true;
  @type("number") score: number = 0;
  @type("number") ammo: number = WEAPON_MAX_AMMO;
  @type("number") kills: number = 0;
  @type("boolean") isHost: boolean = false;
  @type("string") memeId: string = "default";
  @type("boolean") isSpectator: boolean = false;

  lastFireTime: number = 0;
  lastTransformTime: number = 0;
  lastAbilityTime: number = 0;
  lastScanTime: number = 0;
  lastInputSeq: number = 0;
  lastPositionTime: number = 0;
  transformCount: number = 0;
}
