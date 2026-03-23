import { getMemePreviewDataURL, loadMemeManifest } from "../../game/entities/MemeTextureLoader";
import { t, onLangChange } from "../../i18n/i18n";

export interface RoomLobbyCallbacks {
  onReady: () => void;
  onStart: () => void;
  onLeave: () => void;
  onChat: (message: string) => void;
  onConfigChange: (config: any) => void;
  onSelectMeme: (memeId: string) => void;
}

export class RoomLobbyUI {
  readonly element: HTMLElement;
  private playerListEl!: HTMLElement;
  private chatMessagesEl!: HTMLElement;
  private chatInputEl!: HTMLInputElement;
  private startBtnEl!: HTMLButtonElement;
  private readyBtnEl!: HTMLButtonElement;
  private roomCodeEl!: HTMLElement;
  private memeGridEl!: HTMLElement;
  private selectedMemeId: string = "default";
  private unsubLang?: () => void;

  constructor(private callbacks: RoomLobbyCallbacks) {
    this.element = document.createElement("div");
    this.element.className = "room-lobby";
    this.buildHTML();
    this.bindEvents(callbacks);

    this.unsubLang = onLangChange(() => {
      const chatHistory = this.chatMessagesEl?.innerHTML || "";
      const roomCode = this.roomCodeEl?.textContent || "------";
      this.buildHTML();
      this.bindEvents(callbacks);
      if (this.chatMessagesEl) this.chatMessagesEl.innerHTML = chatHistory;
      if (this.roomCodeEl) this.roomCodeEl.textContent = roomCode;
    });
  }

  private buildHTML() {
    this.element.innerHTML = `
      <div class="lobby-container">
        <div class="lobby-header">
          <h2>${t("lobby.title")}</h2>
          <div class="room-code-display" id="room-code">------</div>
        </div>

        <div class="player-list" id="player-list-panel">
          <h3>${t("lobby.players")}</h3>
          <div id="player-list"></div>
        </div>

        <div class="lobby-sidebar">
          <div class="meme-section">
            <h3>${t("lobby.choose_meme")}</h3>
            <div class="meme-grid" id="meme-grid"></div>
          </div>

          <div class="chat-box">
            <h3>${t("lobby.chat")}</h3>
            <div class="chat-messages" id="chat-messages"></div>
            <div class="chat-input-row">
              <input type="text" id="chat-input" placeholder="${t("lobby.chat_placeholder")}" maxlength="200" />
              <button id="btn-chat-send">${t("lobby.send")}</button>
            </div>
          </div>

          <div class="lobby-actions">
            <button class="btn btn-primary" id="btn-ready">${t("lobby.ready")}</button>
            <button class="btn btn-primary" id="btn-start" style="display:none;">${t("lobby.start_game")}</button>
            <button class="btn btn-danger" id="btn-leave">${t("lobby.leave_room")}</button>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(callbacks: RoomLobbyCallbacks) {
    this.element.addEventListener("click", (e) => e.stopPropagation());

    setTimeout(() => {
      this.playerListEl = this.element.querySelector("#player-list")!;
      this.chatMessagesEl = this.element.querySelector("#chat-messages")!;
      this.chatInputEl = this.element.querySelector("#chat-input")!;
      this.startBtnEl = this.element.querySelector("#btn-start")!;
      this.readyBtnEl = this.element.querySelector("#btn-ready")!;
      this.roomCodeEl = this.element.querySelector("#room-code")!;
      this.memeGridEl = this.element.querySelector("#meme-grid")!;

      this.element.querySelector("#btn-ready")!.addEventListener("click", () => {
        callbacks.onReady();
      });

      this.element.querySelector("#btn-start")!.addEventListener("click", () => {
        if (this.startBtnEl.disabled) return;
        this.startBtnEl.disabled = true;
        this.startBtnEl.textContent = t("lobby.starting");
        this.startBtnEl.style.opacity = "0.5";
        callbacks.onStart();
        setTimeout(() => {
          if (this.startBtnEl) {
            this.startBtnEl.disabled = false;
            this.startBtnEl.textContent = t("lobby.start_game");
            this.startBtnEl.style.opacity = "1";
          }
        }, 3000);
      });

      this.element.querySelector("#btn-leave")!.addEventListener("click", () => {
        callbacks.onLeave();
      });

      this.element.querySelector("#btn-chat-send")!.addEventListener("click", () => {
        this.sendChat();
      });

      this.chatInputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.sendChat();
      });

      void this.loadMemeGrid();
    }, 0);
  }

  private async loadMemeGrid() {
    const memes = await loadMemeManifest();
    if (!this.memeGridEl) return;

    this.memeGridEl.innerHTML = memes.map((m) => {
      const preview = getMemePreviewDataURL(m.id, m.name);
      const isSelected = m.id === this.selectedMemeId;
      return `
        <div class="meme-item ${isSelected ? "selected" : ""}" data-meme-id="${m.id}">
          <img src="${preview}" alt="${m.name}" />
          <span class="meme-name">${m.name}</span>
        </div>
      `;
    }).join("");

    this.memeGridEl.querySelectorAll(".meme-item").forEach((el) => {
      el.addEventListener("click", () => {
        const id = (el as HTMLElement).dataset.memeId!;
        this.selectMeme(id);
      });
    });
  }

  private selectMeme(memeId: string) {
    this.selectedMemeId = memeId;
    this.callbacks.onSelectMeme(memeId);

    this.memeGridEl?.querySelectorAll(".meme-item").forEach((el) => {
      el.classList.toggle("selected", (el as HTMLElement).dataset.memeId === memeId);
    });
  }

  getSelectedMemeId(): string {
    return this.selectedMemeId;
  }

  private sendChat() {
    const msg = this.chatInputEl.value.trim();
    if (!msg) return;
    this.callbacks.onChat(msg);
    this.chatInputEl.value = "";
  }

  updatePlayerList(players: { sessionId: string; nickname: string; isReady: boolean; isHost: boolean; memeId?: string }[], selfSessionId: string) {
    if (!this.playerListEl) return;
    this.playerListEl.innerHTML = players
      .map((p) => {
        const isSelf = p.sessionId === selfSessionId;
        const memePreview = p.memeId ? getMemePreviewDataURL(p.memeId, "") : "";
        return `
          <div class="player-entry ${isSelf ? "self" : ""}">
            <span class="player-info">
              ${memePreview ? `<img class="player-meme-icon" src="${memePreview}" />` : ""}
              ${p.nickname}
              ${p.isHost ? `<span class="host-badge">${t("lobby.host")}</span>` : ""}
            </span>
            <span class="ready-status ${p.isReady ? "ready" : "not-ready"}">
              ${p.isReady ? t("lobby.player_ready") : t("lobby.player_not_ready")}
            </span>
          </div>
        `;
      })
      .join("");
  }

  updateChat(messages: { sender: string; message: string }[]) {
    if (!this.chatMessagesEl) return;
    this.chatMessagesEl.innerHTML = messages
      .map((m) => {
        if (m.sender === "System") {
          return `<div class="msg-system">${m.message}</div>`;
        }
        return `<div><span class="msg-sender">${m.sender}:</span> ${m.message}</div>`;
      })
      .join("");
    this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
  }

  setRoomCode(code: string) {
    if (!this.roomCodeEl) return;
    this.roomCodeEl.textContent = code;
  }

  setIsHost(isHost: boolean) {
    if (!this.startBtnEl) return;
    this.startBtnEl.style.display = isHost ? "block" : "none";
  }

  updateStartButton(allReady: boolean, playerCount: number) {
    if (!this.startBtnEl) return;
    if (!allReady || playerCount < 1) {
      this.startBtnEl.disabled = true;
      this.startBtnEl.style.opacity = "0.4";
      this.startBtnEl.title = t("lobby.all_must_ready");
    } else {
      this.startBtnEl.disabled = false;
      this.startBtnEl.style.opacity = "1";
      this.startBtnEl.title = "";
    }
  }

  setReadyState(isReady: boolean) {
    if (!this.readyBtnEl) return;
    this.readyBtnEl.textContent = isReady ? t("lobby.unready") : t("lobby.ready");
    this.readyBtnEl.className = isReady ? "btn btn-secondary" : "btn btn-primary";
  }
}
