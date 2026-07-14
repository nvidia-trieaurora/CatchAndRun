/**
 * Synthesized UI sounds (no audio assets). Uses its own lazy AudioContext so
 * sounds work from the main menu, before the in-game AudioSystem exists.
 * The context is created on first user gesture (a click), so autoplay
 * restrictions never block it.
 */

export type UISoundName = "hover" | "click" | "success" | "error" | "tick" | "stinger";

let ctx: AudioContext | null = null;
let enabled = true;
let lastHoverAt = 0;

export function setUISoundsEnabled(v: boolean) {
  enabled = v;
}

export function playUISound(name: UISoundName) {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    GENERATORS[name](ctx);
  } catch { /* best-effort */ }
}

/**
 * Delegated listeners: click/hover sounds for every button in the app.
 * Call once at startup.
 */
export function initUISounds(initiallyEnabled: boolean) {
  enabled = initiallyEnabled;

  document.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button, .meme-item, .room-code-display, summary")) {
      playUISound("click");
    }
  }, true);

  document.addEventListener("mouseover", (e) => {
    if (!(e.target as HTMLElement).closest(".btn")) return;
    const now = performance.now();
    if (now - lastHoverAt < 80) return;
    lastHoverAt = now;
    playUISound("hover");
  }, true);
}

function blip(ctx: AudioContext, freqFrom: number, freqTo: number, duration: number, volume: number, type: OscillatorType = "sine", startAt = 0) {
  const t = ctx.currentTime + startAt;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t);
  if (freqTo !== freqFrom) osc.frequency.exponentialRampToValueAtTime(freqTo, t + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

const GENERATORS: Record<UISoundName, (ctx: AudioContext) => void> = {
  hover: (ctx) => blip(ctx, 500, 550, 0.04, 0.02),
  click: (ctx) => blip(ctx, 650, 850, 0.07, 0.05),
  success: (ctx) => {
    blip(ctx, 520, 520, 0.09, 0.05);
    blip(ctx, 780, 780, 0.14, 0.05, "sine", 0.09);
  },
  error: (ctx) => blip(ctx, 300, 160, 0.2, 0.06, "square"),
  tick: (ctx) => blip(ctx, 1000, 1000, 0.06, 0.07),
  stinger: (ctx) => {
    blip(ctx, 440, 440, 0.1, 0.06, "sawtooth");
    blip(ctx, 554, 554, 0.1, 0.06, "sawtooth", 0.1);
    blip(ctx, 660, 660, 0.22, 0.07, "sawtooth", 0.2);
  },
};
