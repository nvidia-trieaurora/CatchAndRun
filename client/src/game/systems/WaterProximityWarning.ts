import * as THREE from "three";

export type WaterWarningLevel = "safe" | "warning" | "critical" | "drowning";

const HARBOR_LAND = {
  minX: -55,
  maxX: 63,
  minZ: -43,
  maxZ: 47,
};

export function getWaterWarningLevel(
  mapId: string,
  position: Pick<THREE.Vector3, "x" | "z">,
): WaterWarningLevel {
  if (mapId !== "harbor-warehouse") return "safe";

  const distance = Math.min(
    position.x - HARBOR_LAND.minX,
    HARBOR_LAND.maxX - position.x,
    position.z - HARBOR_LAND.minZ,
    HARBOR_LAND.maxZ - position.z,
  );
  if (distance <= 1.2) return "critical";
  if (distance <= 3.2) return "warning";
  return "safe";
}

export function formatDrowningCountdown(secondsLeft: number): string {
  return `IN THE WATER — CLIMB OUT! ${Math.max(0, secondsLeft).toFixed(1)} s`;
}

export class WaterProximityWarning {
  readonly element: HTMLElement;
  private level: WaterWarningLevel = "safe";
  private countdown = "";

  constructor(parent: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "water-proximity-warning";
    this.element.setAttribute("role", "status");
    this.element.setAttribute("aria-live", "polite");
    parent.appendChild(this.element);
    this.render();
  }

  /** Shore warnings while the player is on land. */
  update(mapId: string, position: Pick<THREE.Vector3, "x" | "z">) {
    const next = getWaterWarningLevel(mapId, position);
    const changed = next !== this.level;
    this.level = next;
    if (changed) this.render();
    return { level: next, changed };
  }

  /** The body is under the surface: show how long is left to climb out. */
  showDrowning(secondsLeft: number) {
    const text = formatDrowningCountdown(secondsLeft);
    if (this.level === "drowning" && text === this.countdown) return;
    this.level = "drowning";
    this.countdown = text;
    this.render();
  }

  hide() {
    if (this.level === "safe") return;
    this.level = "safe";
    this.countdown = "";
    this.render();
  }

  getLevel(): WaterWarningLevel {
    return this.level;
  }

  private render() {
    this.element.dataset.level = this.level;
    this.element.textContent = this.level === "drowning"
      ? this.countdown
      : this.level === "critical"
        ? "EDGE! FALLING IN STARTS A 3 S DROWNING CLOCK"
        : this.level === "warning"
          ? "WARNING: WATER AHEAD — YOU HAVE 3 S TO CLIMB OUT"
          : "";
  }
}
