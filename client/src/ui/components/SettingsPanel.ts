import type { ClientConfig } from "../../config/ClientConfig";

export class SettingsPanel {
  readonly element: HTMLElement;
  private visible = false;

  constructor(private config: ClientConfig) {
    this.element = document.createElement("div");
    this.element.className = "settings-panel hidden";
    this.render();
  }

  private render() {
    const data = this.config.get();
    this.element.innerHTML = `
      <h3>Settings</h3>

      <div class="setting-row">
        <label>Sensitivity</label>
        <input type="range" min="0.0005" max="0.005" step="0.0005" value="${data.sensitivity}" id="setting-sens" />
      </div>

      <div class="setting-row">
        <label>Master Volume</label>
        <input type="range" min="0" max="1" step="0.1" value="${data.masterVolume}" id="setting-vol" />
      </div>

      <div class="setting-row">
        <label>FOV</label>
        <input type="range" min="60" max="110" step="5" value="${data.fov}" id="setting-fov" />
      </div>

      <button class="btn btn-secondary" id="btn-close-settings">Close</button>
    `;

    setTimeout(() => {
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
