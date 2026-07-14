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
      <div class="lobby-wrapper">
        <div class="lobby-header">
          <h2>${t("lobby.title")}</h2>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="lobby-mode-badge" id="lobby-mode-badge">${t("mode.classic")}</div>
            <div class="room-code-display" id="room-code" title="${t("lobby.click_copy")}">------</div>
          </div>
        </div>

        <div class="lobby-body">
          <div class="lobby-col lobby-col-left">
            <div class="lobby-panel player-list" id="player-list-panel">
              <h3>${t("lobby.players")}</h3>
              <div id="player-list"></div>
            </div>
            <div class="lobby-panel chat-box">
              <h3>${t("lobby.chat")}</h3>
              <div class="chat-messages" id="chat-messages"></div>
              <div class="chat-input-row">
                <input type="text" id="chat-input" placeholder="${t("lobby.chat_placeholder")}" maxlength="200" />
                <button id="btn-chat-send">${t("lobby.send")}</button>
              </div>
            </div>
          </div>

          <div class="lobby-col lobby-col-right">
            <div class="lobby-panel meme-section">
              <h3>${t("lobby.choose_meme")}</h3>
              <div class="meme-grid" id="meme-grid"></div>
            </div>

            <div class="lobby-panel lobby-settings" id="lobby-settings" style="display:none;">
              <h3>GAME SETTINGS</h3>
              <div class="setting-item">
                <label>${t("mode.label")}</label>
                <div class="setting-control mode-toggle">
                  <button class="mode-btn active" data-mode="classic" id="mode-btn-classic">${t("mode.classic")}</button>
                  <button class="mode-btn" data-mode="infection" id="mode-btn-infection">${t("mode.infection")}</button>
                </div>
              </div>
              <div class="mode-desc" id="mode-desc"></div>
              <div class="setting-item">
                <label>${t("map.label")}</label>
                <div class="setting-control mode-toggle">
                  <button class="map-btn active" data-map="harbor-warehouse">${t("map.harbor")}</button>
                  <button class="map-btn" data-map="school">${t("map.school")}</button>
                </div>
              </div>
              <div class="setting-item">
                <label>Max Players</label>
                <div class="setting-control">
                  <button class="setting-btn" data-setting="maxPlayers" data-dir="-1">-</button>
                  <span id="cfg-maxPlayers">10</span>
                  <button class="setting-btn" data-setting="maxPlayers" data-dir="1">+</button>
                </div>
              </div>
              <div class="setting-item">
                <label>Rounds</label>
                <div class="setting-control">
                  <button class="setting-btn" data-setting="totalRounds" data-dir="-1">-</button>
                  <span id="cfg-totalRounds">5</span>
                  <button class="setting-btn" data-setting="totalRounds" data-dir="1">+</button>
                </div>
              </div>
              <div class="setting-item">
                <label>Round Time</label>
                <div class="setting-control">
                  <button class="setting-btn" data-setting="roundTime" data-dir="-30">-</button>
                  <span id="cfg-roundTime">4:00</span>
                  <button class="setting-btn" data-setting="roundTime" data-dir="30">+</button>
                </div>
              </div>
            </div>

            <div class="lobby-actions">
              <button class="btn btn-primary" id="btn-ready">${t("lobby.ready")}</button>
              <button class="btn btn-primary" id="btn-start" style="display:none;">${t("lobby.start_game")}</button>
              <button class="btn btn-danger" id="btn-leave">${t("lobby.leave_room")}</button>
            </div>
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

      this.element.querySelectorAll(".mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mode = (btn as HTMLElement).dataset.mode!;
          callbacks.onConfigChange({ gameMode: mode });
          this.setModeDisplay(mode);
        });
      });

      this.element.querySelectorAll(".map-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mapId = (btn as HTMLElement).dataset.map!;
          callbacks.onConfigChange({ mapId });
          this.setMapDisplay(mapId);
        });
      });

      const cfgState = { maxPlayers: 10, totalRounds: 5, roundTime: 240 };
      this.element.querySelectorAll(".setting-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const setting = (btn as HTMLElement).dataset.setting!;
          const dir = Number((btn as HTMLElement).dataset.dir!);
          if (setting === "maxPlayers") {
            cfgState.maxPlayers = Math.min(10, Math.max(5, cfgState.maxPlayers + dir));
            const el = this.element.querySelector("#cfg-maxPlayers");
            if (el) el.textContent = String(cfgState.maxPlayers);
            callbacks.onConfigChange({ maxPlayers: cfgState.maxPlayers });
          } else if (setting === "totalRounds") {
            cfgState.totalRounds = Math.min(10, Math.max(1, cfgState.totalRounds + dir));
            const el = this.element.querySelector("#cfg-totalRounds");
            if (el) el.textContent = String(cfgState.totalRounds);
            callbacks.onConfigChange({ totalRounds: cfgState.totalRounds });
          } else if (setting === "roundTime") {
            cfgState.roundTime = Math.min(600, Math.max(60, cfgState.roundTime + dir));
            const el = this.element.querySelector("#cfg-roundTime");
            if (el) el.textContent = `${Math.floor(cfgState.roundTime / 60)}:${String(cfgState.roundTime % 60).padStart(2, "0")}`;
            callbacks.onConfigChange({ roundTime: cfgState.roundTime });
          }
        });
      });

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

      this.roomCodeEl.addEventListener("click", () => {
        const code = this.roomCodeEl.textContent?.trim();
        if (!code || code === "------" || this.roomCodeEl.classList.contains("copied")) return;

        const showFeedback = () => {
          this.roomCodeEl.classList.add("copied");
          this.roomCodeEl.textContent = `✓ ${t("lobby.copied")}`;
          setTimeout(() => {
            this.roomCodeEl.classList.remove("copied");
            this.roomCodeEl.textContent = code;
          }, 1200);
        };

        const fallbackCopy = () => {
          const ta = document.createElement("textarea");
          ta.value = code;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          // eslint-disable-next-line @typescript-eslint/no-deprecated -- deliberate fallback when Clipboard API is unavailable
          document.execCommand("copy");
          ta.remove();
          showFeedback();
        };

        if (navigator.clipboard) {
          navigator.clipboard.writeText(code).then(showFeedback).catch(fallbackCopy);
        } else {
          fallbackCopy();
        }
      });

      void this.loadMemeGrid();
    }, 0);
  }

  private async loadMemeGrid() {
    const memes = await loadMemeManifest();
    if (!this.memeGridEl) return;

    this.memeGridEl.innerHTML = memes.map((m) => {
      const preview = `/assets/memes/${m.file}`;
      const isSelected = m.id === this.selectedMemeId;
      return `
        <div class="meme-item ${isSelected ? "selected" : ""}" data-meme-id="${m.id}">
          <img src="${preview}" alt="${m.name}" style="object-fit:cover;" />
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

  private static nicknameHue(nickname: string): number {
    let hash = 0;
    for (let i = 0; i < nickname.length; i++) {
      hash = (hash * 31 + nickname.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 360;
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
        const hue = RoomLobbyUI.nicknameHue(p.nickname);
        const avatar = memePreview
          ? `<img class="player-meme-icon" src="${memePreview}" style="border:2px solid hsl(${hue}, 80%, 55%);" />`
          : `<span class="player-avatar-dot" style="background:hsl(${hue}, 80%, 55%);">${p.nickname.charAt(0).toUpperCase()}</span>`;
        return `
          <div class="player-entry ${isSelf ? "self" : ""}">
            <span class="player-info">
              ${avatar}
              ${p.nickname}
              ${p.isHost ? `<span class="host-badge">${t("lobby.host")}</span>` : ""}
            </span>
            <span class="ready-status ${p.isReady ? "ready" : "not-ready"}">
              <span class="ready-dot"></span>${p.isReady ? t("lobby.player_ready") : t("lobby.player_not_ready")}
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

  private currentMode = "classic";
  private currentMapId = "harbor-warehouse";

  /** Syncs mode badge, toggle highlights, and description from server config. */
  updateConfig(cfg: { gameMode?: string; mapId?: string }) {
    if (cfg.gameMode && cfg.gameMode !== this.currentMode) {
      this.setModeDisplay(cfg.gameMode);
    }
    if (cfg.mapId && cfg.mapId !== this.currentMapId) {
      this.setMapDisplay(cfg.mapId);
    }
  }

  private setMapDisplay(mapId: string) {
    this.currentMapId = mapId;
    this.element.querySelectorAll(".map-btn").forEach((btn) => {
      btn.classList.toggle("active", (btn as HTMLElement).dataset.map === mapId);
    });
  }

  private setModeDisplay(mode: string) {
    this.currentMode = mode;
    const badge = this.element.querySelector("#lobby-mode-badge");
    if (badge) {
      badge.textContent = mode === "infection" ? `🧟 ${t("mode.infection")}` : t("mode.classic");
      badge.classList.toggle("infection", mode === "infection");
    }
    this.element.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.classList.toggle("active", (btn as HTMLElement).dataset.mode === mode);
    });
    const desc = this.element.querySelector("#mode-desc");
    if (desc) {
      desc.textContent = mode === "infection" ? t("mode.infection_desc") : "";
    }
  }

  getCurrentMode(): string {
    return this.currentMode;
  }

  setRoomCode(code: string) {
    if (!this.roomCodeEl) return;
    // Don't stomp the "Copied!" feedback — state sync calls this at 20Hz
    if (this.roomCodeEl.classList.contains("copied")) return;
    this.roomCodeEl.textContent = code;
  }

  setIsHost(isHost: boolean) {
    if (!this.startBtnEl) return;
    this.startBtnEl.style.display = isHost ? "block" : "none";
    const settingsEl = this.element.querySelector("#lobby-settings") as HTMLElement;
    if (settingsEl) settingsEl.style.display = isHost ? "block" : "none";
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
