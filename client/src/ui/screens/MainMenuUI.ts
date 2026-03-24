import { t, getLang, setLang, onLangChange } from "../../i18n/i18n";

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
  private unsubLang?: () => void;

  constructor(callbacks: MainMenuCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement("div");
    this.element.className = "main-menu";
    this.buildHTML();
    this.bindEvents(callbacks);

    this.unsubLang = onLangChange(() => {
      const savedNick = this.nicknameInput?.value || "";
      const savedRoomName = this.roomNameInput?.value || "";
      const savedCode = this.codeInput?.value || "";
      const savedPrivate = this.privateCheckbox?.checked || false;
      const savedPasscode = this.passcodeInput?.value || "";

      this.buildHTML();
      this.bindEvents(callbacks);

      if (savedNick) this.nicknameInput.value = savedNick;
      if (savedRoomName) this.roomNameInput.value = savedRoomName;
      if (savedCode) this.codeInput.value = savedCode;
      this.privateCheckbox.checked = savedPrivate;
      if (savedPrivate) this.passcodeGroup.style.display = "block";
      if (savedPasscode) this.passcodeInput.value = savedPasscode;
    });
  }

  private buildHTML() {
    this.element.innerHTML = `
      <div class="menu-container">
        <div style="text-align:right;margin-bottom:8px;">
          <button class="btn-lang" id="btn-lang">${getLang() === "en" ? "🇻🇳 Tiếng Việt" : "🇬🇧 English"}</button>
        </div>
        <h1 class="game-title">${t("menu.title")}</h1>
        <p class="game-subtitle">${t("menu.subtitle")}</p>

        <div class="input-group">
          <label>${t("menu.nickname")}</label>
          <input type="text" id="nickname-input" placeholder="${t("menu.nickname_placeholder")}" maxlength="20" inputmode="text" />
        </div>

        <button class="btn btn-primary" id="btn-quick-join">${t("menu.quick_join")}</button>

        <div class="room-browser">
          <div class="room-browser-header">
            <h3>${t("menu.available_rooms")}</h3>
            <button class="btn btn-small btn-secondary" id="btn-refresh-rooms">${t("menu.refresh")}</button>
          </div>
          <div class="room-list" id="room-list">
            <div class="room-list-empty">${t("menu.click_refresh")}</div>
          </div>
        </div>

        <div class="input-group" style="margin-top: 1.5rem;">
          <label>${t("menu.room_name")}</label>
          <input type="text" id="room-name-input" placeholder="${t("menu.room_name_placeholder")}" maxlength="30" />
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:0.75rem;">
          <input type="checkbox" id="private-check" />
          <label for="private-check" style="font-size:0.9rem;color:#ccc;">${t("menu.private_room")}</label>
        </div>

        <div class="input-group" id="passcode-group" style="display:none;margin-bottom:0.75rem;">
          <label>${t("menu.passcode")}</label>
          <input type="text" id="passcode-input" placeholder="${t("menu.passcode_placeholder")}" maxlength="10" style="text-transform:uppercase;letter-spacing:2px;font-family:monospace;" />
        </div>

        <button class="btn btn-secondary" id="btn-create">${t("menu.create_room")}</button>

        <div class="join-code-row" style="margin-top: 1rem;">
          <input type="text" id="code-input" placeholder="${t("menu.room_code")}" maxlength="6" style="text-transform:uppercase;letter-spacing:2px;font-family:monospace;" />
          <button class="btn btn-secondary btn-small" id="btn-join-code">${t("menu.join")}</button>
        </div>
      </div>
    `;
  }

  private bindEvents(callbacks: MainMenuCallbacks) {
    setTimeout(() => {
      this.nicknameInput = this.element.querySelector("#nickname-input")!;
      this.roomNameInput = this.element.querySelector("#room-name-input")!;
      this.codeInput = this.element.querySelector("#code-input")!;
      this.privateCheckbox = this.element.querySelector("#private-check")!;
      this.passcodeInput = this.element.querySelector("#passcode-input")!;
      this.passcodeGroup = this.element.querySelector("#passcode-group")!;
      this.roomListEl = this.element.querySelector("#room-list")!;

      this.element.querySelector("#btn-lang")?.addEventListener("click", () => {
        setLang(getLang() === "en" ? "vi" : "en");
      });

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

    this.element.addEventListener("click", (e) => e.stopPropagation());
  }

  async refreshRoomList() {
    if (!this.roomListEl) return;
    this.roomListEl.innerHTML = `<div class="room-list-empty">${t("menu.loading")}</div>`;
    try {
      const rooms = await this.callbacks.onBrowseRooms();
      if (rooms.length === 0) {
        this.roomListEl.innerHTML = `<div class="room-list-empty">${t("menu.no_rooms")}</div>`;
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
        const phaseLabel = isWaiting ? t("menu.lobby") : t("menu.in_game");
        const phaseClass = isWaiting ? "phase-waiting" : "phase-active";
        const lockIcon = isPrivate ? '<span class="room-lock">&#128274;</span>' : "";
        const btnLabel = isFull ? t("menu.full") : (isWaiting ? t("menu.join") : t("menu.spectate"));
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
      this.roomListEl.innerHTML = `<div class="room-list-empty">${t("menu.failed_load")}</div>`;
    }
  }

  private promptPasscode(nickname: string, roomId: string) {
    const existing = document.querySelector(".passcode-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.className = "passcode-modal";
    modal.innerHTML = `
      <div class="passcode-modal-box">
        <h3>&#128274; ${t("menu.private_room_title")}</h3>
        <p>${t("menu.enter_passcode")}</p>
        <input type="text" class="passcode-modal-input" placeholder="${t("menu.passcode_input")}" maxlength="10"
               style="text-transform:uppercase;letter-spacing:2px;font-family:monospace;" />
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-primary btn-small passcode-modal-ok">${t("menu.join")}</button>
          <button class="btn btn-secondary btn-small passcode-modal-cancel">${t("menu.cancel")}</button>
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
          errorEl.textContent = err.message || t("menu.invalid_passcode");
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
