import type { VoiceMode } from "./VoiceChat";
import { t } from "../i18n/i18n";

export class VoiceUI {
  readonly element: HTMLElement;
  private micBtn: HTMLElement;
  private modeBtn: HTMLElement;
  private statusEl: HTMLElement;

  onMicToggle: (() => void) | null = null;
  onModeToggle: (() => void) | null = null;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "voice-controls";
    this.element.style.display = "none";
    this.element.innerHTML = `
      <button class="voice-btn voice-mic" id="voice-mic" title="${t("voice.toggle_mic")}">${t("voice.mic_off")}</button>
      <button class="voice-btn voice-mode" id="voice-mode" title="${t("voice.voice_mode")}">${t("voice.mode_all")}</button>
      <span class="voice-status" id="voice-status"></span>
    `;

    document.body.appendChild(this.element);

    this.micBtn = this.element.querySelector("#voice-mic")!;
    this.modeBtn = this.element.querySelector("#voice-mode")!;
    this.statusEl = this.element.querySelector("#voice-status")!;

    this.micBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onMicToggle?.();
    });
    this.modeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onModeToggle?.();
    });
  }

  show() {
    this.element.style.display = "flex";
  }

  hide() {
    this.element.style.display = "none";
  }

  updateMic(enabled: boolean) {
    this.micBtn.textContent = enabled ? t("voice.mic_on") : t("voice.mic_off");
    this.micBtn.classList.toggle("active", enabled);
  }

  updateMode(mode: VoiceMode) {
    const labels: Record<VoiceMode, string> = {
      all: t("voice.mode_all"),
      team: t("voice.mode_team"),
      mute: t("voice.mode_mute"),
    };
    this.modeBtn.textContent = labels[mode];
    this.modeBtn.className = `voice-btn voice-mode mode-${mode}`;
  }

  updateStatus(text: string) {
    this.statusEl.textContent = text;
  }

  dispose() {
    this.element.remove();
  }
}
