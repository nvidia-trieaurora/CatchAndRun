export interface MainMenuCallbacks {
  onQuickJoin: (nickname: string) => void;
  onCreate: (nickname: string, roomName: string, isPrivate: boolean) => void;
  onJoinCode: (nickname: string, code: string) => void;
}

export class MainMenuUI {
  readonly element: HTMLElement;
  private nicknameInput!: HTMLInputElement;
  private roomNameInput!: HTMLInputElement;
  private codeInput!: HTMLInputElement;
  private privateCheckbox!: HTMLInputElement;

  constructor(callbacks: MainMenuCallbacks) {
    this.element = document.createElement("div");
    this.element.className = "main-menu";
    this.element.innerHTML = `
      <div class="menu-container">
        <h1 class="game-title">CATCH&RUN</h1>
        <p class="game-subtitle">Prop Hunt Multiplayer</p>

        <div class="input-group">
          <label>Nickname</label>
          <input type="text" id="nickname-input" placeholder="Enter your nickname..." maxlength="20" />
        </div>

        <button class="btn btn-primary" id="btn-quick-join">Quick Join</button>

        <div class="input-group" style="margin-top: 1.5rem;">
          <label>Room Name</label>
          <input type="text" id="room-name-input" placeholder="My Room" maxlength="30" />
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:0.75rem;">
          <input type="checkbox" id="private-check" />
          <label for="private-check" style="font-size:0.9rem;color:#ccc;">Private Room</label>
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

      const saved = localStorage.getItem("catchandrun_nickname");
      if (saved) this.nicknameInput.value = saved;

      this.element.querySelector("#btn-quick-join")!.addEventListener("click", () => {
        const nick = this.getNickname();
        if (!nick) return;
        callbacks.onQuickJoin(nick);
      });

      this.element.querySelector("#btn-create")!.addEventListener("click", () => {
        const nick = this.getNickname();
        if (!nick) return;
        const roomName = this.roomNameInput.value.trim() || "Game Room";
        callbacks.onCreate(nick, roomName, this.privateCheckbox.checked);
      });

      this.element.querySelector("#btn-join-code")!.addEventListener("click", () => {
        const nick = this.getNickname();
        if (!nick) return;
        const code = this.codeInput.value.trim().toUpperCase();
        if (code.length !== 6) return;
        callbacks.onJoinCode(nick, code);
      });
    }, 0);
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
}
