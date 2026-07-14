import { t } from "../../i18n/i18n";
import {
  HUNTER_GRENADE_COOLDOWN_MS,
  HUNTER_SCAN_COOLDOWN_MS,
  HUNTER_PHASEWALK_COOLDOWN_MS,
} from "@catch-and-run/shared";

const PROP_INVIS_COOLDOWN_MS = 20000;
const PROP_SPEED_COOLDOWN_MS = 20000;
const HUNTER_BOOST_COOLDOWN_MS = 60000;

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
  private aliveCountEl!: HTMLElement;
  private roundEl!: HTMLElement;
  private scoreboardEl!: HTMLElement;
  private scoreboardBodyEl!: HTMLElement;
  private killfeedEntries: { el: HTMLElement; time: number }[] = [];
  private currentPhase = "";
  private chatOpen = false;
  private scoreboardOpen = false;
  private onChatSend: ((message: string) => void) | null = null;
  private onChatClose: (() => void) | null = null;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "game-hud";
    if (document.body.classList.contains("is-mobile")) {
      this.element.classList.add("mobile");
    }
    this.element.innerHTML = `
      <div class="hud-top">
        <div class="hud-round" id="hud-round"></div>
        <div class="hud-timer" id="hud-timer">5:00</div>
        <div class="hud-phase" id="hud-phase">${t("hud.waiting")}</div>
        <div class="hud-role" id="hud-role"></div>
        <div class="hud-alive-count" id="hud-alive-count"></div>
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
        <input class="hud-chat-input" id="hud-chat-input" type="text" placeholder="${t("hud.chat_placeholder")}" maxlength="120" autocomplete="off" />
      </div>

      <div class="hud-chat-toast" id="hud-chat-toast"></div>

      <div class="hud-soul-mode" id="hud-soul-mode" style="display:none;">
        ${t("hud.soul_mode")}
      </div>

      <div class="hud-controls-hint" id="hud-controls-hint" style="display:none;"></div>

      <div class="hud-scoreboard" id="hud-scoreboard" style="display:none;">
        <div class="hud-scoreboard-title">${t("hud.scoreboard_title")}</div>
        <table class="hud-scoreboard-table">
          <thead>
            <tr>
              <th style="text-align:left;">${t("hud.sb_player")}</th>
              <th>${t("hud.sb_role")}</th>
              <th>${t("hud.sb_score")}</th>
              <th>${t("hud.sb_kills")}</th>
              <th>${t("hud.sb_status")}</th>
            </tr>
          </thead>
          <tbody id="hud-scoreboard-body"></tbody>
        </table>
      </div>
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
      this.chatInputEl = this.element.querySelector("#hud-chat-input")!;
      this.chatToastEl = this.element.querySelector("#hud-chat-toast")!;
      this.soulModeEl = this.element.querySelector("#hud-soul-mode")!;
      this.controlsHintEl = this.element.querySelector("#hud-controls-hint")!;
      this.aliveCountEl = this.element.querySelector("#hud-alive-count")!;
      this.roundEl = this.element.querySelector("#hud-round")!;
      this.scoreboardEl = this.element.querySelector("#hud-scoreboard")!;
      this.scoreboardBodyEl = this.element.querySelector("#hud-scoreboard-body")!;

      this.chatInputEl.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          const msg = this.chatInputEl.value.trim();
          if (msg && this.onChatSend) {
            this.onChatSend(msg);
          }
          this.chatInputEl.value = "";
        } else if (e.key === "Escape") {
          this.chatInputEl.value = "";
          if (this.onChatClose) this.onChatClose();
        }
      });
    }, 0);
  }

  setChatSendHandler(handler: (message: string) => void) {
    this.onChatSend = handler;
  }

  setChatCloseHandler(handler: () => void) {
    this.onChatClose = handler;
  }

  setChatOpen(open: boolean) {
    this.chatOpen = open;
    if (this.chatContainerEl) {
      this.chatContainerEl.style.display = open ? "flex" : "none";
      if (open) {
        this.chatInputEl.focus();
      } else {
        this.chatInputEl.blur();
      }
    }
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
      this.vignetteEl.style.opacity = "0";
      return;
    }
    const hpRatio = Math.max(0, currentHp / maxHp);
    const vignetteOpacity = hpRatio < 0.7 ? (0.7 - hpRatio) * 1.0 : 0;
    this.vignetteEl.style.opacity = String(Math.min(0.7, vignetteOpacity));
  }

  showHitMarker(killed: boolean) {
    const el = document.createElement("div");
    el.className = `hit-marker${killed ? " kill" : ""}`;
    el.innerHTML = `<span></span><span></span>`;
    this.element.appendChild(el);
    setTimeout(() => el.remove(), 350);
  }

  showDamageNumber(damage: number, screenX: number, screenY: number, killed: boolean) {
    const el = document.createElement("div");
    el.className = `damage-number${killed ? " kill" : ""}`;
    el.textContent = killed ? `-${damage} 💀` : `-${damage}`;
    el.style.left = `${screenX + (Math.random() - 0.5) * 30}px`;
    el.style.top = `${screenY - 10}px`;
    this.element.appendChild(el);
    setTimeout(() => el.remove(), 900);
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
    const urgent = this.currentPhase === "active" && seconds > 0 && seconds <= 30;
    this.timerEl.classList.toggle("urgent", urgent);
  }

  updatePhase(phase: string) {
    if (!this.phaseEl || !phase) return;
    this.currentPhase = phase;
    const labels: Record<string, string> = {
      waiting: t("hud.waiting"),
      countdown: t("hud.get_ready"),
      hiding: t("hud.hide"),
      active: t("hud.hunt"),
      roundEnd: t("hud.round_over"),
      matchEnd: t("hud.match_over"),
    };
    this.phaseEl.textContent = labels[phase] || phase.toUpperCase();
  }

  updateRole(role: string) {
    if (!this.roleEl || !role) return;
    if (role === "ghost") {
      this.roleEl.textContent = t("hud.ghost");
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
      this.ammoEl.innerHTML = `<span style="color:#ff9800;">${t("hud.reloading")}</span>`;
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

  private abilityChip(opts: {
    key: string;
    name: string;
    cdMs?: number;
    maxMs?: number;
    count?: string;
    depleted?: boolean;
    activeFx?: boolean;
  }): string {
    const cd = opts.cdMs ?? 0;
    const cooling = cd > 0 && !opts.depleted;
    const stateClass = opts.depleted
      ? "depleted"
      : opts.activeFx
        ? "active-fx"
        : cooling
          ? "cooling"
          : "ready";
    const pct = cooling && opts.maxMs ? Math.min(100, (cd / opts.maxMs) * 100) : 0;
    const ring = cooling
      ? `<div class="ability-chip-ring" style="background:conic-gradient(rgba(0,0,0,0.78) ${pct}%, transparent 0)"></div>
         <div class="ability-chip-cd">${Math.ceil(cd / 1000)}</div>`
      : "";
    const count = opts.count ? `<div class="ability-chip-count">${opts.count}</div>` : "";
    return `
      <div class="ability-chip ${stateClass}">
        <div class="ability-chip-box">
          <div class="ability-chip-key">${opts.key}</div>
          ${ring}
        </div>
        ${count}
        <div class="ability-chip-name">${opts.name}</div>
      </div>
    `;
  }

  updatePropAbilities(invisCd: number, speedCd: number, transformsLeft: number, duplicatesLeft: number) {
    if (!this.abilityEl) return;
    this.abilityEl.innerHTML = `<div class="ability-chips">
      ${this.abilityChip({ key: "Q", name: t("ability.invisible"), cdMs: invisCd, maxMs: PROP_INVIS_COOLDOWN_MS })}
      ${this.abilityChip({ key: "E", name: t("ability.transform"), count: `${transformsLeft}/2`, depleted: transformsLeft <= 0 })}
      ${this.abilityChip({ key: "R", name: t("ability.speed"), cdMs: speedCd, maxMs: PROP_SPEED_COOLDOWN_MS })}
      ${this.abilityChip({ key: "T", name: t("ability.duplicate"), count: `${duplicatesLeft}/4`, depleted: duplicatesLeft <= 0 })}
      ${this.abilityChip({ key: "F", name: t("ability.lock") })}
      ${this.abilityChip({ key: "1", name: t("ability.soul") })}
    </div>`;
  }

  updateHunterAbilities(grenadeCd: number, scanCd: number, grenadeMode: boolean, boostCd = 0, phaseWalkCd = 0, inPhaseWalk = false, grenadesLeft = 3) {
    if (!this.abilityEl) return;
    if (grenadeMode) {
      this.abilityEl.innerHTML = `
        <div class="hud-ability-name" style="color:#ff6b6b;font-weight:bold">${t("ability.grenade_mode")}</div>
      `;
      return;
    }
    this.abilityEl.innerHTML = `<div class="ability-chips">
      ${this.abilityChip({ key: "Q", name: t("ability.grenade"), cdMs: grenadeCd, maxMs: HUNTER_GRENADE_COOLDOWN_MS, count: `${grenadesLeft}/3`, depleted: grenadesLeft <= 0 })}
      ${this.abilityChip({ key: "E", name: t("ability.scanner"), cdMs: scanCd, maxMs: HUNTER_SCAN_COOLDOWN_MS })}
      ${this.abilityChip({ key: "T", name: t("ability.boost"), cdMs: boostCd, maxMs: HUNTER_BOOST_COOLDOWN_MS })}
      ${this.abilityChip({ key: "1", name: t("ability.phase_walk"), cdMs: phaseWalkCd, maxMs: HUNTER_PHASEWALK_COOLDOWN_MS, activeFx: inPhaseWalk })}
    </div>`;
  }

  addKillfeed(killer: string, victim: string) {
    if (!this.killfeedEl) return;
    const el = document.createElement("div");
    el.className = "killfeed-entry";
    el.innerHTML = `<span style="color:#ff6b6b">${killer}</span><span class="killfeed-skull">&#128128;</span><span style="color:#00d4ff">${victim}</span>`;
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
        ${t("prop.disguised_as")}: <strong>${propName}</strong>
        ${isLocked ? ` | <span style='color:#4caf50'>${t("prop.locked")}</span>` : ` | ${t("prop.press_f_lock")}`}
        <br>${t("prop.press_e_transform")}
      `;
    } else {
      this.propInfoEl.style.display = "none";
      this.propInfoEl.textContent = "";
    }
  }

  updateRound(current: number, total: number) {
    if (!this.roundEl) return;
    if (current > 0 && total > 0) {
      this.roundEl.style.display = "block";
      this.roundEl.innerHTML = `${t("hud.round")} <span class="round-current">${current}</span><span class="round-sep">/</span><span class="round-total">${total}</span>`;
    } else {
      this.roundEl.style.display = "none";
    }
  }

  updateAliveCount(aliveProps: number, totalProps: number, aliveHunters: number, totalHunters: number) {
    if (!this.aliveCountEl) return;
    this.aliveCountEl.innerHTML =
      `<span style="color:#00d4ff">${t("hud.props")}: ${aliveProps}/${totalProps}</span>` +
      ` &nbsp; <span style="color:#ff6b6b">${t("hud.hunters")}: ${aliveHunters}/${totalHunters}</span>`;
  }

  setVisible(visible: boolean) {
    this.element.style.display = visible ? "block" : "none";
  }

  showScoreboard(players: ScoreboardPlayer[]) {
    if (!this.scoreboardEl) return;
    this.scoreboardOpen = true;
    this.scoreboardEl.style.display = "block";
    this.renderScoreboard(players);
  }

  hideScoreboard() {
    if (!this.scoreboardEl) return;
    this.scoreboardOpen = false;
    this.scoreboardEl.style.display = "none";
  }

  isScoreboardOpen(): boolean {
    return this.scoreboardOpen;
  }

  updateScoreboard(players: ScoreboardPlayer[]) {
    if (!this.scoreboardOpen) return;
    this.renderScoreboard(players);
  }

  private renderScoreboard(players: ScoreboardPlayer[]) {
    if (!this.scoreboardBodyEl) return;
    const sorted = [...players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.kills - a.kills;
    });
    const rows = sorted.map((p) => {
      const roleColor = p.role === "hunter" ? "#ff6b6b" : p.role === "prop" ? "#00d4ff" : "#aaa";
      const roleLabel = p.role === "hunter" ? t("hud.hunter") : p.role === "prop" ? t("hud.prop") : t("hud.ghost");
      const aliveLabel = p.isAlive
        ? `<span style="color:#4caf50;">${t("hud.alive")}</span>`
        : `<span style="color:#999;">${t("hud.dead")}</span>`;
      const youMark = p.isLocal ? ` <span style="color:#ffd700;">(${t("hud.you")})</span>` : "";
      const nameSafe = String(p.nickname).replace(/[<>&]/g, "");
      return `
        <tr>
          <td style="text-align:left;">${nameSafe}${youMark}</td>
          <td style="color:${roleColor};font-weight:bold;">${roleLabel}</td>
          <td>${p.score}</td>
          <td>${p.kills}</td>
          <td>${aliveLabel}</td>
        </tr>
      `;
    }).join("");
    this.scoreboardBodyEl.innerHTML = rows;
  }
}

export interface ScoreboardPlayer {
  nickname: string;
  role: string;
  score: number;
  kills: number;
  isAlive: boolean;
  isLocal: boolean;
}
