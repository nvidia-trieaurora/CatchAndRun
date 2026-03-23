import type { ClientConfig } from "../../config/ClientConfig";
import { t, getLang, setLang, onLangChange } from "../../i18n/i18n";

export class SettingsPanel {
  readonly element: HTMLElement;
  private visible = false;
  private unsubLang?: () => void;

  constructor(private config: ClientConfig) {
    this.element = document.createElement("div");
    this.element.className = "settings-panel hidden";
    this.render();

    this.unsubLang = onLangChange(() => {
      if (this.visible) this.render();
    });
  }

  private render() {
    const data = this.config.get();
    const lang = getLang();
    this.element.innerHTML = `
      <h3>${t("settings.title")}</h3>

      <div class="setting-row">
        <label>${t("settings.language")}</label>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-small ${lang === "en" ? "btn-primary" : "btn-secondary"}" id="setting-lang-en">English</button>
          <button class="btn btn-small ${lang === "vi" ? "btn-primary" : "btn-secondary"}" id="setting-lang-vi">Tiếng Việt</button>
        </div>
      </div>

      <div class="setting-row">
        <label>${t("settings.sensitivity")}</label>
        <input type="range" min="0.0005" max="0.005" step="0.0005" value="${data.sensitivity}" id="setting-sens" />
      </div>

      <div class="setting-row">
        <label>${t("settings.master_volume")}</label>
        <input type="range" min="0" max="1" step="0.1" value="${data.masterVolume}" id="setting-vol" />
      </div>

      <div class="setting-row">
        <label>${t("settings.fov")}</label>
        <input type="range" min="60" max="110" step="5" value="${data.fov}" id="setting-fov" />
      </div>

      <button class="btn btn-secondary" id="btn-close-settings">${t("settings.close")}</button>
    `;

    setTimeout(() => {
      this.element.querySelector("#setting-lang-en")!.addEventListener("click", () => {
        setLang("en");
      });

      this.element.querySelector("#setting-lang-vi")!.addEventListener("click", () => {
        setLang("vi");
      });

      this.element.querySelector("#setting-sens")!.addEventListener("input", (e) => {
        this.config.set("sensitivity", parseFloat((e.target as HTMLInputElement).value));
      });

      this.element.querySelector("#setting-vol")!.addEventListener("input", (e) => {
        this.config.set("masterVolume", parseFloat((e.target as HTMLInputElement).value));
      });

      this.element.querySelector("#setting-fov")!.addEventListener("input", (e) => {
        this.config.set("fov", parseInt((e.target as HTMLInputElement).value));
      });

      this.element.querySelector("#btn-close-settings")!.addEventListener("click", () => {
        this.toggle();
      });
    }, 0);
  }

  toggle() {
    this.visible = !this.visible;
    this.element.classList.toggle("hidden", !this.visible);
    if (this.visible) this.render();
  }

  isVisible(): boolean {
    return this.visible;
  }
}
