export class ResultsUI {
  readonly element: HTMLElement;
  private containerEl!: HTMLElement;

  constructor(private onContinue: () => void) {
    this.element = document.createElement("div");
    this.element.className = "results-screen";
    this.element.innerHTML = `
      <div class="results-container" id="results-container">
        <h2>Match Results</h2>
        <table class="results-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Score</th>
              <th>Kills</th>
            </tr>
          </thead>
          <tbody id="results-body"></tbody>
        </table>
        <button class="btn btn-primary" id="btn-continue">Continue</button>
      </div>
    `;

    this.element.addEventListener("click", (e) => e.stopPropagation());

    setTimeout(() => {
      this.containerEl = this.element.querySelector("#results-container")!;
      this.element.querySelector("#btn-continue")!.addEventListener("click", () => {
        onContinue();
      });
    }, 0);
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
