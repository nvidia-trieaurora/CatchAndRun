interface SoundMemeEntry {
  id: string;
  name: string;
  file: string;
}

const SOUND_MEMES: SoundMemeEntry[] = [
  { id: "do_anh_bat", name: "Đố anh bắt được em", file: "Do_anh_bat_duoc_em_ban_goc_mp3-www_tiengdong_com.mp3" },
  { id: "ai_ep_may_met_thi_nghi_chi_phien", name: "Chị Phiến ai ép mày mệt", file: "ai_ep_may_met_thi_nghi_chi_phien_ban_goc-www_tiengdong_com.mp3" },
  { id: "que_vl_do_mixi", name: "Quê vl Độ Mixi", file: "meme_que_vl_Do_mixi-www_tiengdong_com.mp3" },
  { id: "ho_hao_2_3_do", name: "Hô hào 2 3 dô uống bia", file: "tieng_ho_hao_2_3_do_2_3_uong_khi_uong_bia_ruou-www_tiengdong_com.mp3" },
];

export class SoundMemePanel {
  readonly element: HTMLElement;
  private gridEl: HTMLElement;
  private visible = false;
  private onSelect: ((soundId: string) => void) | null = null;
  private cooldownUntil = 0;
  private selectedIndex = 0;
  private buttons: HTMLButtonElement[] = [];

  constructor() {
    this.element = document.createElement("div");
    this.element.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.85); border: 2px solid rgba(255,255,255,0.2);
      border-radius: 12px; padding: 16px; z-index: 200;
      min-width: 300px; max-width: 420px; display: none; backdrop-filter: blur(8px);
    `;

    const title = document.createElement("div");
    title.innerHTML = `Sound Meme <span style="opacity:0.5;font-size:0.75rem;">[2] next &middot; [Enter] play &middot; [Esc] close</span>`;
    title.style.cssText = `
      color: #fff; font-size: 0.9rem; font-weight: bold;
      margin-bottom: 12px; text-align: center;
    `;
    this.element.appendChild(title);

    this.gridEl = document.createElement("div");
    this.gridEl.style.cssText = `
      display: flex; flex-direction: column;
      gap: 6px; max-height: 300px; overflow-y: auto;
    `;
    this.element.appendChild(this.gridEl);

    this.buildGrid();
  }

  private buildGrid() {
    this.gridEl.innerHTML = "";
    this.buttons = [];
    for (let i = 0; i < SOUND_MEMES.length; i++) {
      const s = SOUND_MEMES[i];
      const btn = document.createElement("button");
      btn.textContent = s.name;
      btn.dataset.soundId = s.id;
      btn.style.cssText = `
        background: rgba(255,255,255,0.08); color: #fff; border: 2px solid transparent;
        border-radius: 8px; padding: 10px 14px; font-size: 0.85rem; cursor: pointer;
        font-family: inherit; transition: all 0.1s; text-align: left; width: 100%;
      `;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectedIndex = i;
        this.updateHighlight();
        this.confirmSelection();
      });
      this.gridEl.appendChild(btn);
      this.buttons.push(btn);
    }
    this.updateHighlight();
  }

  private updateHighlight() {
    for (let i = 0; i < this.buttons.length; i++) {
      if (i === this.selectedIndex) {
        this.buttons[i].style.background = "rgba(255, 180, 30, 0.25)";
        this.buttons[i].style.borderColor = "rgba(255, 180, 30, 0.8)";
      } else {
        this.buttons[i].style.background = "rgba(255,255,255,0.08)";
        this.buttons[i].style.borderColor = "transparent";
      }
    }
  }

  cycleNext() {
    if (SOUND_MEMES.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % SOUND_MEMES.length;
    this.updateHighlight();
  }

  confirmSelection() {
    if (SOUND_MEMES.length === 0) return;
    const now = Date.now();
    if (now < this.cooldownUntil) return;
    this.cooldownUntil = now + 3000;
    const soundId = SOUND_MEMES[this.selectedIndex].id;
    if (this.onSelect) this.onSelect(soundId);
    this.hide();
    this.showCooldown();
  }

  private showCooldown() {
    for (const btn of this.buttons) {
      btn.style.opacity = "0.4";
      btn.style.pointerEvents = "none";
    }
    setTimeout(() => {
      for (const btn of this.buttons) {
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
      }
    }, 3000);
  }

  setOnSelect(handler: (soundId: string) => void) {
    this.onSelect = handler;
  }

  show() {
    this.visible = true;
    this.element.style.display = "block";
    this.selectedIndex = 0;
    this.updateHighlight();
  }

  hide() {
    this.visible = false;
    this.element.style.display = "none";
  }

  isVisible(): boolean {
    return this.visible;
  }

  getSoundFile(soundId: string): string | null {
    const s = SOUND_MEMES.find((e) => e.id === soundId);
    return s ? `/assets/audio/memes/${s.file}` : null;
  }
}
