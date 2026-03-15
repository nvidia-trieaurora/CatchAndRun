export class GameHUD {
  readonly element: HTMLElement;
  private timerEl!: HTMLElement;
  private phaseEl!: HTMLElement;
  private roleEl!: HTMLElement;
  private healthFillEl!: HTMLElement;
  private ammoEl!: HTMLElement;
  private abilityEl!: HTMLElement;
  private killfeedEl!: HTMLElement;
  private propInfoEl!: HTMLElement;
  private crosshairEl!: HTMLElement;
  private vignetteEl!: HTMLElement;
  private flashEl!: HTMLElement;
  private chatContainerEl!: HTMLElement;
  private chatMessagesEl!: HTMLElement;
  private chatInputEl!: HTMLInputElement;
  private chatToastEl!: HTMLElement;
  private soulModeEl!: HTMLElement;
  private controlsHintEl!: HTMLElement;
  private killfeedEntries: { el: HTMLElement; time: number }[] = [];
  private chatOpen = false;
  private onChatSend: ((message: string) => void) | null = null;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "game-hud";
    if (document.body.classList.contains("is-mobile")) {
      this.element.classList.add("mobile");
    }
    this.element.innerHTML = `
      <div class="hud-top">
        <div class="hud-timer" id="hud-timer">5:00</div>
        <div class="hud-phase" id="hud-phase">WAITING</div>
        <div class="hud-role" id="hud-role"></div>
      </div>

      <div class="hud-bottom-left">
        <div class="hud-health-bar">
          <div class="hud-health-fill" id="hud-health-fill" style="width:100%"></div>
        </div>
        <div class="hud-ammo" id="hud-ammo"></div>
      </div>

      <div class="hud-bottom-right">
        <div class="hud-ability" id="hud-ability"></div>
      </div>

      <div class="crosshair" id="hud-crosshair"><div class="crosshair-dot"></div></div>

      <div class="hud-killfeed" id="hud-killfeed"></div>

      <div class="hud-prop-info" id="hud-prop-info"></div>

      <div class="damage-vignette" id="damage-vignette"></div>
      <div class="damage-flash" id="damage-flash"></div>

      <div class="hud-chat-container" id="hud-chat-container" style="display:none;">
        <div class="hud-chat-messages" id="hud-chat-messages"></div>
        <input class="hud-chat-input" id="hud-chat-input" type="text" placeholder="Type a message... (Tab to close)" maxlength="120" autocomplete="off" />
      </div>

      <div class="hud-chat-toast" id="hud-chat-toast"></div>

      <div class="hud-soul-mode" id="hud-soul-mode" style="display:none;">
        SOUL MODE - Press 1 to return
      </div>

      <div class="hud-controls-hint" id="hud-controls-hint" style="display:none;"></div>
    `;

    setTimeout(() => {
      this.timerEl = this.element.querySelector("#hud-timer")!;
      this.phaseEl = this.element.querySelector("#hud-phase")!;
      this.roleEl = this.element.querySelector("#hud-role")!;
      this.healthFillEl = this.element.querySelector("#hud-health-fill")!;
      this.ammoEl = this.element.querySelector("#hud-ammo")!;
      this.abilityEl = this.element.querySelector("#hud-ability")!;
      this.killfeedEl = this.element.querySelector("#hud-killfeed")!;
      this.propInfoEl = this.element.querySelector("#hud-prop-info")!;
      this.crosshairEl = this.element.querySelector("#hud-crosshair")!;
      this.vignetteEl = this.element.querySelector("#damage-vignette")!;
      this.flashEl = this.element.querySelector("#damage-flash")!;
      this.chatContainerEl = this.element.querySelector("#hud-chat-container")!;
      this.chatMessagesEl = this.element.querySelector("#hud-chat-messages")!;
      this.chatInputEl = this.element.querySelector("#hud-chat-input")! as HTMLInputElement;
      this.chatToastEl = this.element.querySelector("#hud-chat-toast")!;
      this.soulModeEl = this.element.querySelector("#hud-soul-mode")!;
      this.controlsHintEl = this.element.querySelector("#hud-controls-hint")!;

      this.chatInputEl.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          const msg = this.chatInputEl.value.trim();
          if (msg && this.onChatSend) {
            this.onChatSend(msg);
          }
          this.chatInputEl.value = "";
        }
      });
    }, 0);
  }

  setChatSendHandler(handler: (message: string) => void) {
    this.onChatSend = handler;
  }

  toggleChat(): boolean {
    this.chatOpen = !this.chatOpen;
    if (this.chatContainerEl) {
      this.chatContainerEl.style.display = this.chatOpen ? "flex" : "none";
      if (this.chatOpen) {
        this.chatInputEl.focus();
      } else {
        this.chatInputEl.blur();
      }
    }
    return this.chatOpen;
  }

  isChatOpen(): boolean {
    return this.chatOpen;
  }

  addChatMessage(sender: string, message: string) {
    if (!this.chatMessagesEl) return;
    const el = document.createElement("div");
    el.className = "hud-chat-msg";
    el.innerHTML = `<strong>${sender}:</strong> ${message}`;
    this.chatMessagesEl.appendChild(el);
    this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
    while (this.chatMessagesEl.children.length > 50) {
      this.chatMessagesEl.removeChild(this.chatMessagesEl.firstChild!);
    }

    if (!this.chatOpen && this.chatToastEl) {
      const toast = document.createElement("div");
      toast.className = "hud-chat-toast-msg";
      toast.innerHTML = `<strong>${sender}:</strong> ${message}`;
      this.chatToastEl.appendChild(toast);
      setTimeout(() => {
        toast.classList.add("hud-chat-toast-fade");
        setTimeout(() => toast.remove(), 600);
      }, 3000);
      while (this.chatToastEl.children.length > 5) {
        this.chatToastEl.removeChild(this.chatToastEl.firstChild!);
      }
    }
  }

  setSoulModeVisible(visible: boolean) {
    if (this.soulModeEl) {
      this.soulModeEl.style.display = visible ? "block" : "none";
    }
  }

  updateDamageOverlay(currentHp: number, maxHp: number, isHunter: boolean) {
    if (!this.vignetteEl) return;
    if (isHunter) {
      // Hunter never shows damage vignette
      this.vignetteEl.style.opacity = "0";
      return;
    }
    // Prop: show red vignette when below 70% HP
    const hpRatio = Math.max(0, currentHp / maxHp);
    const vignetteOpacity = hpRatio < 0.7 ? (0.7 - hpRatio) * 1.0 : 0;
    this.vignetteEl.style.opacity = String(Math.min(0.7, vignetteOpacity));
  }

  flashDamage() {
    if (!this.flashEl) return;
    this.flashEl.style.opacity = "0.4";
    setTimeout(() => {
      if (this.flashEl) this.flashEl.style.opacity = "0";
    }, 150);
  }

  updateTimer(seconds: number) {
    if (!this.timerEl) return;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    this.timerEl.textContent = `${m}:${s.toString().padStart(2, "0")}`;
  }

  updatePhase(phase: string) {
    if (!this.phaseEl || !phase) return;
    const labels: Record<string, string> = {
      waiting: "WAITING",
      countdown: "GET READY",
      hiding: "HIDE!",
      active: "HUNT!",
      roundEnd: "ROUND OVER",
      matchEnd: "MATCH OVER",
    };
    this.phaseEl.textContent = labels[phase] || phase.toUpperCase();
  }

  updateRole(role: string) {
    if (!this.roleEl || !role) return;
    if (role === "ghost") {
      this.roleEl.textContent = "GHOST";
      this.roleEl.className = "hud-role ghost";
    } else {
      this.roleEl.textContent = role.toUpperCase();
      this.roleEl.className = `hud-role ${role}`;
    }
    this.crosshairEl.style.display = role === "hunter" ? "block" : "none";
    this.ammoEl.style.display = role === "hunter" ? "block" : "none";
    if (this.controlsHintEl) {
      this.controlsHintEl.style.display = "none";
    }
  }

  updateHealth(current: number, max: number) {
    if (!this.healthFillEl) return;
    const pct = Math.max(0, Math.min(100, (current / max) * 100));

    this.healthFillEl.style.width = `${pct}%`;
    this.healthFillEl.style.transition = "width 0.2s ease-out";

    if (pct < 30) {
      this.healthFillEl.style.background = "linear-gradient(90deg, #f44336, #ff5722)";
    } else if (pct < 60) {
      this.healthFillEl.style.background = "linear-gradient(90deg, #ff9800, #ffeb3b)";
    } else {
      this.healthFillEl.style.background = "linear-gradient(90deg, #4caf50, #8bc34a)";
    }
  }

  updateAmmo(current: number, max: number, reloading: boolean) {
    if (!this.ammoEl) return;
    if (reloading) {
      this.ammoEl.innerHTML = `<span style="color:#ff9800;">RELOADING...</span>`;
    } else {
      this.ammoEl.innerHTML = `${current} <span>/ ${max}</span>`;
    }
  }

  updateAbility(name: string, key: string, cooldownRemaining: number) {
    if (!this.abilityEl) return;
    if (cooldownRemaining > 0) {
      this.abilityEl.innerHTML = `
        <div class="hud-ability-name">${name}</div>
        <div class="hud-ability-cd">${Math.ceil(cooldownRemaining / 1000)}s</div>
      `;
    } else {
      this.abilityEl.innerHTML = `
        <div class="hud-ability-name">${name}</div>
        <div class="hud-ability-key">[${key}]</div>
      `;
    }
  }

  updateHunterAbilities(grenadeCd: number, scanCd: number, grenadeMode: boolean, boostCd = 0) {
    if (!this.abilityEl) return;
    if (grenadeMode) {
      this.abilityEl.innerHTML = `
        <div class="hud-ability-name" style="color:#ff6b6b;font-weight:bold">CLICK to throw | Q cancel</div>
      `;
      return;
    }
    let html = "";
    if (grenadeCd > 0) {
      html += `<div class="hud-ability-name">GRENADE <span style="color:#ff9800">[Q] ${Math.ceil(grenadeCd / 1000)}s</span></div>`;
    } else {
      html += `<div class="hud-ability-name">GRENADE <span style="color:#4caf50">[Q]</span></div>`;
    }
    if (scanCd > 0) {
      html += `<div class="hud-ability-name">SCANNER <span style="color:#ff9800">[E] ${Math.ceil(scanCd / 1000)}s</span></div>`;
    } else {
      html += `<div class="hud-ability-name">SCANNER <span style="color:#00d4ff">[E]</span></div>`;
    }
    if (boostCd > 0) {
      html += `<div class="hud-ability-name">BOOST <span style="color:#ff9800">[T] ${Math.ceil(boostCd / 1000)}s</span></div>`;
    } else {
      html += `<div class="hud-ability-name">BOOST <span style="color:#ffdd44">[T]</span></div>`;
    }
    this.abilityEl.innerHTML = html;
  }

  addKillfeed(killer: string, victim: string) {
    if (!this.killfeedEl) return;
    const el = document.createElement("div");
    el.className = "killfeed-entry";
    el.innerHTML = `<span style="color:#ff6b6b">${killer}</span> eliminated <span style="color:#00d4ff">${victim}</span>`;
    this.killfeedEl.appendChild(el);
    this.killfeedEntries.push({ el, time: Date.now() });

    setTimeout(() => {
      el.remove();
      this.killfeedEntries = this.killfeedEntries.filter((e) => e.el !== el);
    }, 5000);
  }

  updatePropInfo(propName: string, isLocked: boolean) {
    if (!this.propInfoEl) return;
    if (propName) {
      this.propInfoEl.style.display = "block";
      this.propInfoEl.innerHTML = `
        Disguised as: <strong>${propName}</strong>
        ${isLocked ? " | <span style='color:#4caf50'>LOCKED</span>" : " | Press F to Lock"}
        <br>Press E near objects to transform
      `;
    } else {
      this.propInfoEl.style.display = "none";
      this.propInfoEl.textContent = "";
    }
  }

  setVisible(visible: boolean) {
    this.element.style.display = visible ? "block" : "none";
  }
}
