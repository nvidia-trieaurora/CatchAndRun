import { Client, Room } from "colyseus.js";
import { DEFAULT_SERVER_PORT } from "@catch-and-run/shared";

export type RoomState = any;

function getServerUrl(): string {
  const envUrl = import.meta.env.VITE_SERVER_URL;
  if (envUrl) return envUrl;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.hostname || "localhost";
  return `${protocol}://${host}:${DEFAULT_SERVER_PORT}`;
}

export class NetworkManager {
  private client: Client;
  private room: Room | null = null;
  private stateChangeCallbacks: ((state: RoomState) => void)[] = [];
  private messageCallbacks = new Map<string, ((data: any) => void)[]>();

  constructor() {
    this.client = new Client(getServerUrl());
  }

  async createRoom(options: {
    nickname: string;
    roomName?: string;
    isPrivate?: boolean;
    maxPlayers?: number;
  }): Promise<Room> {
    this.room = await this.client.create("game_room", options);
    this.setupRoomListeners();
    return this.room;
  }

  async joinRoom(roomId: string, nickname: string): Promise<Room> {
    this.room = await this.client.joinById(roomId, { nickname });
    this.setupRoomListeners();
    return this.room;
  }

  async joinByCode(code: string, nickname: string): Promise<Room> {
    const rooms = await this.getAvailableRooms();
    const match = rooms.find((r: any) => r.metadata?.roomCode === code);
    if (!match) throw new Error("Room not found with that code");
    return this.joinRoom(match.roomId, nickname);
  }

  async quickJoin(nickname: string): Promise<Room> {
    this.room = await this.client.joinOrCreate("game_room", { nickname });
    this.setupRoomListeners();
    return this.room;
  }

  async getAvailableRooms(): Promise<any[]> {
    return this.client.getAvailableRooms("game_room");
  }

  send(type: string, data?: any) {
    this.room?.send(type, data);
  }

  onStateChange(callback: (state: RoomState) => void) {
    this.stateChangeCallbacks.push(callback);
  }

  onMessage(type: string, callback: (data: any) => void) {
    if (!this.messageCallbacks.has(type)) {
      this.messageCallbacks.set(type, []);
    }
    this.messageCallbacks.get(type)!.push(callback);

    if (this.room) {
      this.room.onMessage(type, callback);
    }
  }

  private setupRoomListeners() {
    if (!this.room) return;

    this.room.onStateChange((state) => {
      this.stateChangeCallbacks.forEach((cb) => cb(state));
    });

    this.messageCallbacks.forEach((callbacks, type) => {
      callbacks.forEach((cb) => {
        this.room!.onMessage(type, cb);
      });
    });

    this.room.onLeave((code) => {
      console.log(`Left room with code: ${code}`);
      this.room = null;
    });

    this.room.onError((code, message) => {
      console.error(`Room error ${code}: ${message}`);
    });

    // Process initial state immediately (onStateChange may have already fired)
    if (this.room.state) {
      setTimeout(() => {
        if (this.room?.state) {
          this.stateChangeCallbacks.forEach((cb) => cb(this.room!.state));
        }
      }, 50);
    }
  }

  getRoom(): Room | null {
    return this.room;
  }

  getSessionId(): string {
    return this.room?.sessionId || "";
  }

  leaveRoom() {
    void this.room?.leave();
    this.room = null;
  }

  isConnected(): boolean {
    return this.room !== null;
  }
}
