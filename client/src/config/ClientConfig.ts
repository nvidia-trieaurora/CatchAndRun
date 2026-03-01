export interface ClientConfigData {
  sensitivity: number;
  masterVolume: number;
  sfxVolume: number;
  graphicsQuality: "low" | "medium" | "high";
  fov: number;
}

const STORAGE_KEY = "catchandrun_config";

const defaults: ClientConfigData = {
  sensitivity: 0.002,
  masterVolume: 0.8,
  sfxVolume: 0.7,
  graphicsQuality: "medium",
  fov: 75,
};

export class ClientConfig {
  private data: ClientConfigData;

  constructor() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        this.data = { ...defaults, ...JSON.parse(stored) };
      } catch {
        this.data = { ...defaults };
      }
    } else {
      this.data = { ...defaults };
    }
  }

  get(): ClientConfigData {
    return { ...this.data };
  }

  set<K extends keyof ClientConfigData>(key: K, value: ClientConfigData[K]) {
    this.data[key] = value;
    this.save();
  }

  private save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }
}
