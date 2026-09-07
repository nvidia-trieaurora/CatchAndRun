import * as THREE from "three";

export type WaterWarningLevel = "safe" | "warning" | "critical";

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

export class WaterProximityWarning {
  readonly element: HTMLElement;
  private level: WaterWarningLevel = "safe";

  constructor(parent: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "water-proximity-warning";
    this.element.setAttribute("role", "status");
    this.element.setAttribute("aria-live", "polite");
    parent.appendChild(this.element);
    this.render();
  }

  update(mapId: string, position: Pick<THREE.Vector3, "x" | "z">) {
    const next = getWaterWarningLevel(mapId, position);
    const changed = next !== this.level;
    this.level = next;
    if (changed) this.render();
    return { level: next, changed };
  }

  hide() {
    if (this.level === "safe") return;
    this.level = "safe";
    this.render();
  }

  private render() {
    this.element.dataset.level = this.level;
    this.element.textContent = this.level === "critical"
      ? "DANGER: WATER IS LETHAL — MOVE BACK"
      : this.level === "warning"
        ? "WARNING: JUMPING INTO THE WATER WILL KILL YOU"
        : "";
  }
}
