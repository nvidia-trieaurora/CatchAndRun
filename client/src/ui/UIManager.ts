export class UIManager {
  private root: HTMLElement;
  private screens = new Map<string, HTMLElement>();
  private currentScreen: string = "";

  constructor() {
    this.root = document.getElementById("ui-root")!;
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
