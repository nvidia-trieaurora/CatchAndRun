import { t } from "../../i18n/i18n";

/**
 * Full-screen overlay for round-start role splashes and phase-transition
 * banners. Pointer-events: none — purely visual.
 */
export class AnnouncementBanner {
  readonly element: HTMLElement;
  private hideTimer: number | null = null;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "announce-layer";
  }

  showRoleSplash(role: "hunter" | "prop") {
    const icon = role === "hunter" ? "&#128299;" : "&#128230;";
    const title = role === "hunter" ? t("splash.you_are_hunter") : t("splash.you_are_prop");
    const sub = role === "hunter" ? t("splash.hunter_task") : t("splash.prop_task");
    this.show(`
      <div class="role-splash ${role}">
        <div class="role-splash-icon">${icon}</div>
        <div class="role-splash-title">${title}</div>
        <div class="role-splash-sub">${sub}</div>
      </div>
    `, 3000);
  }

  showBanner(text: string, variant: "danger" | "info" | "success" = "info") {
    this.show(`<div class="phase-banner ${variant}">${text}</div>`, 2200);
  }

  showCountdown(n: number) {
    this.show(`<div class="countdown-number">${n}</div>`, 900);
  }

  private show(html: string, duration: number) {
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.element.innerHTML = html;
    this.element.classList.add("visible");
    this.hideTimer = window.setTimeout(() => {
      this.element.classList.remove("visible");
      this.element.innerHTML = "";
      this.hideTimer = null;
    }, duration);
  }
}
