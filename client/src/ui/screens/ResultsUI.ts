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
      <div class="results-container" id="results-container">
        <h2>${t("results.title")}</h2>
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

    const tbody = this.containerEl.querySelector("#results-body")!;
    tbody.innerHTML = scores
      .map(
        (s, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${s.nickname}</td>
          <td>${s.score}</td>
          <td>${s.kills}</td>
        </tr>
      `
      )
      .join("");
  }
}
