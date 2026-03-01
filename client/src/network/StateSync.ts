import type { RoomState } from "./NetworkManager";

type ChangeCallback = (state: RoomState) => void;
type PlayerCallback = (player: any, sessionId: string) => void;

export class StateSync {
  private onPlayerAddCallbacks: PlayerCallback[] = [];
  private onPlayerRemoveCallbacks: PlayerCallback[] = [];
  private onPlayerChangeCallbacks: PlayerCallback[] = [];
  private attached = false;

  onPlayerAdd(cb: PlayerCallback) {
    this.onPlayerAddCallbacks.push(cb);
  }

  onPlayerRemove(cb: PlayerCallback) {
    this.onPlayerRemoveCallbacks.push(cb);
  }

  onPlayerChange(cb: PlayerCallback) {
    this.onPlayerChangeCallbacks.push(cb);
  }

  attachToState(state: RoomState) {
    if (this.attached) return;
    this.attached = true;

    state.players.onAdd((player: any, sessionId: string) => {
      this.onPlayerAddCallbacks.forEach((cb) => cb(player, sessionId));

      player.onChange(() => {
        this.onPlayerChangeCallbacks.forEach((cb) => cb(player, sessionId));
      });
    });

    state.players.onRemove((player: any, sessionId: string) => {
      this.onPlayerRemoveCallbacks.forEach((cb) => cb(player, sessionId));
    });
  }

  detach() {
    this.attached = false;
  }
}
