import type { VoiceMode } from "./VoiceChat";

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
      <button class="voice-btn voice-mic" id="voice-mic" title="Toggle Mic [V]">MIC OFF</button>
      <button class="voice-btn voice-mode" id="voice-mode" title="Voice Mode [B]">ALL</button>
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
    this.micBtn.textContent = enabled ? "MIC ON" : "MIC OFF";
    this.micBtn.classList.toggle("active", enabled);
  }

  updateMode(mode: VoiceMode) {
    const labels: Record<VoiceMode, string> = { all: "ALL", team: "TEAM", mute: "MUTE" };
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
