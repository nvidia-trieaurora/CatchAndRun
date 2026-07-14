import { t, onLangChange } from "../../i18n/i18n";

export class ResultsUI {
  readonly element: HTMLElement;
  private containerEl!: HTMLElement;
  private unsubLang?: () => void;

  constructor(private onContinue: () => void) {
    this.element = document.createElement("div");
    this.element.className = "results-screen";
    this.buildHTML();
    this.bindEvents();

    this.unsubLang = onLangChange(() => {
      this.buildHTML();
      this.bindEvents();
    });
  }

  private buildHTML() {
    this.element.innerHTML = `
      <div class="results-confetti" id="results-confetti"></div>
      <div class="results-container" id="results-container">
        <h2>${t("results.title")}</h2>
        <div class="results-podium" id="results-podium"></div>
        <table class="results-table">
          <thead>
            <tr>
              <th>${t("results.rank")}</th>
              <th>${t("results.player")}</th>
              <th>${t("results.score")}</th>
              <th>${t("results.kills")}</th>
            </tr>
          </thead>
          <tbody id="results-body"></tbody>
        </table>
        <button class="btn btn-primary" id="btn-continue">${t("results.continue")}</button>
      </div>
    `;
  }

  private bindEvents() {
    setTimeout(() => {
      this.containerEl = this.element.querySelector("#results-container")!;
      this.element.querySelector("#btn-continue")!.addEventListener("click", () => {
        this.onContinue();
      });
    }, 0);

    this.element.addEventListener("click", (e) => e.stopPropagation());
  }

  showResults(
    title: string,
    scores: { nickname: string; score: number; kills: number }[]
  ) {
    const h2 = this.containerEl.querySelector("h2")!;
    h2.textContent = title;

    // Podium for top 3 — rendered in visual order: 2nd, 1st, 3rd
    const podiumEl = this.containerEl.querySelector("#results-podium")!;
    const medals = ["🥇", "🥈", "🥉"];
    const top3 = scores.slice(0, 3);
    const visualOrder = [1, 0, 2].filter((i) => i < top3.length);
    podiumEl.innerHTML = visualOrder
      .map((rank) => {
        const s = top3[rank];
        return `
          <div class="podium-slot rank-${rank + 1}">
            <div class="podium-medal">${medals[rank]}</div>
            <div class="podium-name">${s.nickname}</div>
            <div class="podium-score">${s.score}</div>
            <div class="podium-block"></div>
          </div>
        `;
      })
      .join("");

    // Remaining players in the table, rows animated in one by one
    const tbody = this.containerEl.querySelector("#results-body")!;
    tbody.innerHTML = scores
      .slice(3)
      .map(
        (s, i) => `
        <tr class="results-row" style="animation-delay:${0.6 + i * 0.1}s">
          <td>${i + 4}</td>
          <td>${s.nickname}</td>
          <td>${s.score}</td>
          <td>${s.kills}</td>
        </tr>
      `
      )
      .join("");

    this.spawnConfetti();
  }

  private spawnConfetti() {
    const confettiEl = this.element.querySelector("#results-confetti");
    if (!confettiEl) return;
    const colors = ["#00d4ff", "#7b2ff7", "#ffd700", "#ff5555", "#4caf50", "#ff9800"];
    confettiEl.innerHTML = Array.from({ length: 40 }, (_, i) => {
      const color = colors[i % colors.length];
      const left = Math.random() * 100;
      const delay = Math.random() * 2;
      const duration = 2.5 + Math.random() * 2;
      const size = 6 + Math.random() * 6;
      return `<span class="confetti-piece" style="
        left:${left}%;
        background:${color};
        width:${size}px;
        height:${size * 0.6}px;
        animation-delay:${delay}s;
        animation-duration:${duration}s;
      "></span>`;
    }).join("");
  }
}
