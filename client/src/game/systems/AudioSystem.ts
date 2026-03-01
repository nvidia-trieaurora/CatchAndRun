import * as THREE from "three";

export class AudioSystem {
  private listener: THREE.AudioListener;
  private ctx: AudioContext;
  private enabled = true;

  constructor(camera: THREE.Camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  playSound(name: string) {
    if (!this.enabled) return;
    try {
      if (this.ctx.state === "suspended") this.ctx.resume();
      const fn = SOUND_GENERATORS[name];
      if (fn) {
        fn(this.ctx);
      }
    } catch {}
  }

  playSpatialSound(name: string, _position: THREE.Vector3) {
    if (!this.enabled) return;
    this.playSound(name);
  }

  dispose() {}
}

const SOUND_GENERATORS: Record<string, (ctx: AudioContext) => void> = {
  shoot: (ctx) => {
    const t = ctx.currentTime;

    // Gunshot: noise burst + low thump
    const bufferSize = ctx.sampleRate * 0.15;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.08));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 3000;
    noiseFilter.Q.value = 0.5;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.15);

    // Low thump
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.3, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);

    // Click
    const click = ctx.createOscillator();
    click.type = "square";
    click.frequency.value = 1200;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.15, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    click.connect(clickGain);
    clickGain.connect(ctx.destination);
    click.start(t);
    click.stop(t + 0.03);
  },

  reload: (ctx) => {
    const t = ctx.currentTime;
    // Magazine click
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 800 + i * 400;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, t + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.15);
      osc.stop(t + i * 0.15 + 0.06);
    }
    // Slide rack
    const slide = ctx.createOscillator();
    slide.type = "sawtooth";
    slide.frequency.setValueAtTime(200, t + 0.5);
    slide.frequency.linearRampToValueAtTime(600, t + 0.6);
    const slideGain = ctx.createGain();
    slideGain.gain.setValueAtTime(0.06, t + 0.5);
    slideGain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    slide.connect(slideGain);
    slideGain.connect(ctx.destination);
    slide.start(t + 0.5);
    slide.stop(t + 0.7);
  },

  hit: (ctx) => {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  },

  kill: (ctx) => {
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 600 - i * 150;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.1, t + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.2);
    }
  },

  ability: (ctx) => {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.linearRampToValueAtTime(800, t + 0.15);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  },

  radar: (ctx) => {
    const t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 1000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, t + i * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.3 + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.3);
      osc.stop(t + i * 0.3 + 0.2);
    }
  },

  decoy: (ctx) => {
    const t = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
  },
};
