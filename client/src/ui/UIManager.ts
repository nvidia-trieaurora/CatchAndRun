import { t } from "../i18n/i18n";

const LOADING_TIP_KEYS = [
  "loading.tip_1",
  "loading.tip_2",
  "loading.tip_3",
  "loading.tip_4",
  "loading.tip_5",
] as const;

export class UIManager {
  private root: HTMLElement;
  private screens = new Map<string, HTMLElement>();
  private currentScreen: string = "";
  private loadingEl: HTMLElement | null = null;
  private coldStartTimer: number | null = null;

  constructor() {
    this.root = document.getElementById("ui-root")!;
  }

  showLoading() {
    this.hideLoading();
    const tipKey = LOADING_TIP_KEYS[Math.floor(Math.random() * LOADING_TIP_KEYS.length)];
    const el = document.createElement("div");
    el.className = "loading-overlay";
    el.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-label">${t("loading.connecting")}</div>
      <div class="loading-tip">&#128161; ${t(tipKey)}</div>
      <div class="loading-cold-start" style="display:none;">${t("loading.cold_start")}</div>
    `;
    document.body.appendChild(el);
    this.loadingEl = el;

    // Free-tier server sleeps after idle — warn if connecting takes long
    this.coldStartTimer = window.setTimeout(() => {
      const note = el.querySelector<HTMLElement>(".loading-cold-start");
      if (note) note.style.display = "block";
    }, 8000);
  }

  hideLoading() {
    if (this.coldStartTimer !== null) {
      window.clearTimeout(this.coldStartTimer);
      this.coldStartTimer = null;
    }
    this.loadingEl?.remove();
    this.loadingEl = null;
  }

  registerScreen(name: string, element: HTMLElement) {
    element.classList.add("screen", "hidden");
    this.root.appendChild(element);
    this.screens.set(name, element);
  }

  showScreen(name: string) {
    this.screens.forEach((el, key) => {
      if (key === name) {
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    });
    this.currentScreen = name;
  }

  hideAll() {
    this.screens.forEach((el) => el.classList.add("hidden"));
    this.currentScreen = "";
  }

  getCurrentScreen(): string {
    return this.currentScreen;
  }

  getScreen(name: string): HTMLElement | undefined {
    return this.screens.get(name);
  }

  showNotification(message: string) {
    const el = document.createElement("div");
    el.className = "notification";
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}
