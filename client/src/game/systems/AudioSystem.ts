import * as THREE from "three";

const BGM_PATH = "/assets/audio/starostin-comedy-quirky-sneaky-music-261165.mp3";
const SHOOT_PATH = "/assets/audio/pistol-shot-233473.mp3";
const RELOAD_PATH = "/assets/audio/reload-gun.mp3";
const BGM_VOLUME = 0.08;
const SFX_VOLUME = 0.4;

export class AudioSystem {
  private listener: THREE.AudioListener;
  private ctx: AudioContext;
  private enabled = true;
  private bgm: HTMLAudioElement | null = null;
  private bgmPlaying = false;
  private shootBuffer: AudioBuffer | null = null;
  private reloadBuffer: AudioBuffer | null = null;
  private shootLoading = false;

  constructor(camera: THREE.Camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    void this.preloadShootSound();
  }

  private async preloadShootSound() {
    if (this.shootLoading) return;
    this.shootLoading = true;
    try {
      const [shootResp, reloadResp] = await Promise.all([
        fetch(SHOOT_PATH), fetch(RELOAD_PATH),
      ]);
      const [shootBuf, reloadBuf] = await Promise.all([
        shootResp.arrayBuffer(), reloadResp.arrayBuffer(),
      ]);
      this.shootBuffer = await this.ctx.decodeAudioData(shootBuf);
      this.reloadBuffer = await this.ctx.decodeAudioData(reloadBuf);
    } catch {
      this.shootBuffer = null;
      this.reloadBuffer = null;
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stopBGM();
  }

  startBGM() {
    if (this.bgmPlaying) return;
    if (!this.bgm) {
      this.bgm = new Audio(BGM_PATH);
      this.bgm.loop = true;
      this.bgm.volume = BGM_VOLUME;
    }
    this.bgm.play().catch(() => {});
    this.bgmPlaying = true;
  }

  stopBGM() {
    if (this.bgm) {
      this.bgm.pause();
      this.bgm.currentTime = 0;
    }
    this.bgmPlaying = false;
  }

  toggleBGM(): boolean {
    if (this.bgmPlaying) {
      this.stopBGM();
      return false;
    } else {
      this.startBGM();
      return true;
    }
  }

  isBGMPlaying(): boolean {
    return this.bgmPlaying;
  }

  setBGMVolume(vol: number) {
    if (this.bgm) this.bgm.volume = Math.max(0, Math.min(1, vol));
  }

  playSound(name: string) {
    if (!this.enabled) return;
    try {
      if (this.ctx.state === "suspended") void this.ctx.resume();

      if (name === "shoot" && this.shootBuffer) {
        this.playBuffer(this.shootBuffer, SFX_VOLUME);
        return;
      }
      if (name === "reload" && this.reloadBuffer) {
        this.playBuffer(this.reloadBuffer, SFX_VOLUME * 0.8);
        return;
      }

      const fn = SOUND_GENERATORS[name];
      if (fn) fn(this.ctx);
    } catch { /* best-effort */ }
  }

  private playBuffer(buffer: AudioBuffer, volume: number) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
  }

  playSpatialSound(name: string, _position: THREE.Vector3) {
    if (!this.enabled) return;
    this.playSound(name);
  }

  dispose() {
    this.stopBGM();
    this.bgm = null;
  }
}

const SOUND_GENERATORS: Record<string, (ctx: AudioContext) => void> = {
  reload: (ctx) => {
    const t = ctx.currentTime;
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
