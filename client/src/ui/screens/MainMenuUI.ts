export interface MainMenuCallbacks {
  onQuickJoin: (nickname: string) => Promise<void>;
  onCreate: (nickname: string, roomName: string, isPrivate: boolean, passcode: string) => Promise<void>;
  onJoinCode: (nickname: string, code: string) => Promise<void>;
  onBrowseRooms: () => Promise<any[]>;
  onJoinRoom: (nickname: string, roomId: string, passcode?: string) => Promise<void>;
}

export class MainMenuUI {
  readonly element: HTMLElement;
  private nicknameInput!: HTMLInputElement;
  private roomNameInput!: HTMLInputElement;
  private codeInput!: HTMLInputElement;
  private privateCheckbox!: HTMLInputElement;
  private passcodeInput!: HTMLInputElement;
  private passcodeGroup!: HTMLElement;
  private roomListEl!: HTMLElement;
  private allButtons: HTMLButtonElement[] = [];
  private busy = false;
  private callbacks!: MainMenuCallbacks;

  constructor(callbacks: MainMenuCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement("div");
    this.element.className = "main-menu";
    this.element.innerHTML = `
      <div class="menu-container">
        <h1 class="game-title">CATCH&RUN</h1>
        <p class="game-subtitle">Prop Hunt Multiplayer</p>

        <div class="input-group">
          <label>Nickname</label>
          <input type="text" id="nickname-input" placeholder="Enter your nickname..." maxlength="20" inputmode="text" />
        </div>

        <button class="btn btn-primary" id="btn-quick-join">Quick Join</button>

        <div class="room-browser">
          <div class="room-browser-header">
            <h3>Available Rooms</h3>
            <button class="btn btn-small btn-secondary" id="btn-refresh-rooms">Refresh</button>
          </div>
          <div class="room-list" id="room-list">
            <div class="room-list-empty">Click Refresh to see rooms</div>
          </div>
        </div>

        <div class="input-group" style="margin-top: 1.5rem;">
          <label>Room Name</label>
          <input type="text" id="room-name-input" placeholder="My Room" maxlength="30" />
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:0.75rem;">
          <input type="checkbox" id="private-check" />
          <label for="private-check" style="font-size:0.9rem;color:#ccc;">Private Room</label>
        </div>

        <div class="input-group" id="passcode-group" style="display:none;margin-bottom:0.75rem;">
          <label>Passcode</label>
          <input type="text" id="passcode-input" placeholder="Enter room passcode..." maxlength="10" style="text-transform:uppercase;letter-spacing:2px;font-family:monospace;" />
        </div>

        <button class="btn btn-secondary" id="btn-create">Create Room</button>

        <div class="join-code-row" style="margin-top: 1rem;">
          <input type="text" id="code-input" placeholder="Room Code" maxlength="6" style="text-transform:uppercase;letter-spacing:2px;font-family:monospace;" />
          <button class="btn btn-secondary btn-small" id="btn-join-code">Join</button>
        </div>
      </div>
    `;

    this.element.addEventListener("click", (e) => e.stopPropagation());

    setTimeout(() => {
      this.nicknameInput = this.element.querySelector("#nickname-input")!;
      this.roomNameInput = this.element.querySelector("#room-name-input")!;
      this.codeInput = this.element.querySelector("#code-input")!;
      this.privateCheckbox = this.element.querySelector("#private-check")!;
      this.passcodeInput = this.element.querySelector("#passcode-input")!;
      this.passcodeGroup = this.element.querySelector("#passcode-group")!;
      this.roomListEl = this.element.querySelector("#room-list")!;

      this.privateCheckbox.addEventListener("change", () => {
        this.passcodeGroup.style.display = this.privateCheckbox.checked ? "block" : "none";
      });

      const saved = localStorage.getItem("catchandrun_nickname");
      if (saved) this.nicknameInput.value = saved;

      this.allButtons = Array.from(this.element.querySelectorAll("button"));

      this.element.querySelector("#btn-quick-join")!.addEventListener("click", () => {
        const nick = this.getNickname();
        if (!nick) return;
        void this.runAction(() => callbacks.onQuickJoin(nick));
      });

      this.element.querySelector("#btn-refresh-rooms")!.addEventListener("click", () => {
        void this.refreshRoomList();
      });

      this.element.querySelector("#btn-create")!.addEventListener("click", () => {
        const nick = this.getNickname();
        if (!nick) return;
        const roomName = this.roomNameInput.value.trim() || "Game Room";
        const isPrivate = this.privateCheckbox.checked;
        const passcode = isPrivate ? this.passcodeInput.value.trim().toUpperCase() : "";
        if (isPrivate && passcode.length < 2) {
          this.passcodeInput.style.borderColor = "#ff4444";
          setTimeout(() => (this.passcodeInput.style.borderColor = "#333"), 1500);
          return;
        }
        void this.runAction(() => callbacks.onCreate(nick, roomName, isPrivate, passcode));
      });

      this.element.querySelector("#btn-join-code")!.addEventListener("click", () => {
        const nick = this.getNickname();
        if (!nick) return;
        const code = this.codeInput.value.trim().toUpperCase();
        if (code.length !== 6) return;
        void this.runAction(() => callbacks.onJoinCode(nick, code));
      });

      void this.refreshRoomList();
    }, 0);
  }

  async refreshRoomList() {
    if (!this.roomListEl) return;
    this.roomListEl.innerHTML = '<div class="room-list-empty">Loading...</div>';
    try {
      const rooms = await this.callbacks.onBrowseRooms();
      if (rooms.length === 0) {
        this.roomListEl.innerHTML = '<div class="room-list-empty">No rooms available — create one!</div>';
        return;
      }
      this.roomListEl.innerHTML = rooms.map((r: any) => {
        const phase = r.metadata?.phase || "waiting";
        const name = r.metadata?.roomName || "Game Room";
        const players = r.clients ?? 0;
        const max = r.maxClients ?? 8;
        const isPrivate = r.metadata?.isPrivate || false;
        const isWaiting = phase === "waiting" || phase === "countdown";
        const isFull = players >= max;
        const phaseLabel = isWaiting ? "LOBBY" : "IN GAME";
        const phaseClass = isWaiting ? "phase-waiting" : "phase-active";
        const lockIcon = isPrivate ? '<span class="room-lock">&#128274;</span>' : "";
        const btnLabel = isFull ? "Full" : (isWaiting ? "Join" : "Spectate");
        return `
          <div class="room-entry" data-room-id="${r.roomId}" data-private="${isPrivate}">
            <div class="room-entry-info">
              <span class="room-entry-name">${lockIcon}${name}</span>
              <span class="room-entry-players">${players}/${max}</span>
            </div>
            <span class="room-entry-phase ${phaseClass}">${phaseLabel}</span>
            <button class="btn btn-small ${isWaiting ? "btn-primary" : "btn-secondary"} room-join-btn" ${isFull ? "disabled" : ""}>
              ${btnLabel}
            </button>
          </div>
        `;
      }).join("");

      this.roomListEl.querySelectorAll(".room-join-btn:not([disabled])").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const entry = (btn as HTMLElement).closest(".room-entry") as HTMLElement;
          const roomId = entry?.dataset.roomId;
          const isPrivate = entry?.dataset.private === "true";
          if (!roomId) return;
          const nick = this.getNickname();
          if (!nick) return;

          if (isPrivate) {
            this.promptPasscode(nick, roomId);
          } else {
            void this.runAction(() => this.callbacks.onJoinRoom(nick, roomId));
          }
        });
      });
    } catch {
      this.roomListEl.innerHTML = '<div class="room-list-empty">Failed to load rooms</div>';
    }
  }

  private promptPasscode(nickname: string, roomId: string) {
    const existing = document.querySelector(".passcode-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.className = "passcode-modal";
    modal.innerHTML = `
      <div class="passcode-modal-box">
        <h3>&#128274; Private Room</h3>
        <p>Enter passcode to join:</p>
        <input type="text" class="passcode-modal-input" placeholder="PASSCODE" maxlength="10"
               style="text-transform:uppercase;letter-spacing:2px;font-family:monospace;" />
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-primary btn-small passcode-modal-ok">Join</button>
          <button class="btn btn-secondary btn-small passcode-modal-cancel">Cancel</button>
        </div>
        <div class="passcode-modal-error" style="color:#ff4444;font-size:0.8rem;margin-top:8px;display:none;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    const input = modal.querySelector(".passcode-modal-input") as HTMLInputElement;
    const errorEl = modal.querySelector(".passcode-modal-error") as HTMLElement;
    input.focus();

    const doJoin = () => {
      const code = input.value.trim().toUpperCase();
      if (!code) {
        input.style.borderColor = "#ff4444";
        return;
      }
      void this.runAction(async () => {
        try {
          await this.callbacks.onJoinRoom(nickname, roomId, code);
          modal.remove();
        } catch (err: any) {
          errorEl.textContent = err.message || "Invalid passcode";
          errorEl.style.display = "block";
          input.style.borderColor = "#ff4444";
        }
      });
    };

    modal.querySelector(".passcode-modal-ok")!.addEventListener("click", doJoin);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doJoin(); });
    modal.querySelector(".passcode-modal-cancel")!.addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  }

  private getNickname(): string {
    const nick = this.nicknameInput.value.trim();
    if (!nick) {
      this.nicknameInput.style.borderColor = "#ff4444";
      setTimeout(() => (this.nicknameInput.style.borderColor = "#333"), 1500);
      return "";
    }
    localStorage.setItem("catchandrun_nickname", nick);
    return nick;
  }

  private async runAction(action: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.setButtonsDisabled(true);
    try {
      await action();
    } finally {
      this.busy = false;
      this.setButtonsDisabled(false);
    }
  }

  private setButtonsDisabled(disabled: boolean) {
    for (const btn of this.allButtons) {
      btn.disabled = disabled;
      btn.style.opacity = disabled ? "0.5" : "1";
      btn.style.pointerEvents = disabled ? "none" : "auto";
    }
  }
}
