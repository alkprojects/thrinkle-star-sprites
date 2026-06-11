import type { SimEvent } from '../sim/types';
import { Music, type Track } from './music';

/**
 * Synthesized audio — no samples, everything is WebAudio oscillators/noise (so the repo
 * stays asset-free and copyright-safe). Bright, punchy, "16-bit arcade" SFX plus an
 * original chiptune BGM (see music.ts), tuned to evoke Twinkle Star Sprites without
 * sampling any ADK sound. See docs/VISUAL_AUDIO_IDENTITY §10–11.
 */
type Scene = 'title' | 'battle' | 'gameover';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private music: Music | null = null;
  private desired: Scene = 'title';
  muted = false;

  /** Desired BGM scene. Takes effect immediately if unlocked, else on the next unlock(). */
  setScene(scene: Scene): void {
    this.desired = scene;
    this.applyScene();
  }

  private applyScene(): void {
    if (!this.music || this.muted) return;
    const track: Track = this.desired === 'battle' ? 'battle' : 'title';
    this.music.play(track);
  }

  /** Must be called from a user gesture before sounds can play. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      this.applyScene();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.7;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.42;
    this.musicBus.connect(this.master);

    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.music = new Music(ctx, this.musicBus);
    this.applyScene();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    if (this.muted) this.music?.stop();
    else this.applyScene();
  }

  handle(events: SimEvent[]): void {
    if (!this.ctx || this.muted) return;
    let pops = 0;
    for (const e of events) {
      switch (e.type) {
        case 'zako-killed':
          if (pops++ < 5) this.pop(330 + pops * 70);
          break;
        case 'chain':
          this.chain(Math.min(e.size, 12));
          break;
        case 'reflect':
          this.bell();
          break;
        case 'attack-sent':
          if (e.tier === 'extra') this.whoosh(200);
          else if (e.tier === 'boss') this.bossRumble();
          break;
        case 'player-hit':
          this.thud();
          break;
        case 'charge-fired':
          this.chargeShot(e.level);
          break;
        case 'bomb':
          this.bomb();
          break;
        case 'fever-start':
          this.fever();
          break;
        case 'eliminated':
          this.jingle([392, 330, 262, 196], 'square');
          break;
        case 'over':
          this.jingle([523, 659, 784, 1047, 1319], 'square');
          break;
      }
    }
  }

  // --- helpers -------------------------------------------------------------

  private tone(freq: number, dur: number, type: OscillatorType = 'square', peak = 0.25, delay = 0, bend?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(20, bend), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus!);
    o.start(t);
    o.stop(t + dur + 0.04);
  }

  private noise(dur: number, peak: number, type: BiquadFilterType, cutoff: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus!);
    src.start(t);
    src.stop(t + dur + 0.04);
  }

  /** Two-operator FM bell: a modulator detunes a sine carrier — bright crystalline ping. */
  private fmBell(freq: number, dur: number, modRatio: number, modDepth: number, peak: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, t);
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(freq * modRatio, t);
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * modDepth, t);
    modGain.gain.exponentialRampToValueAtTime(1, t + dur);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    carrier.connect(g);
    g.connect(this.sfxBus!);
    mod.start(t);
    carrier.start(t);
    mod.stop(t + dur + 0.04);
    carrier.stop(t + dur + 0.04);
  }

  private pop(freq: number): void {
    this.tone(freq, 0.06, 'triangle', 0.18, 0, freq * 0.7);
  }

  private chain(steps: number): void {
    // ascending major-ish arpeggio, climbing pitch + volume per link
    for (let i = 0; i < steps; i++) {
      this.tone(392 * Math.pow(1.0905, i), 0.07, 'square', 0.1 + i * 0.012, i * 0.04);
    }
  }

  private bell(): void {
    this.fmBell(1320, 0.22, 2.0, 1.4, 0.3);
    this.fmBell(1980, 0.16, 3.0, 0.9, 0.12, 0.02);
  }

  private whoosh(low: number): void {
    this.noise(0.26, 0.18, 'lowpass', low * 8);
    this.tone(low, 0.24, 'sawtooth', 0.12, 0, low * 0.5);
  }

  private bossRumble(): void {
    this.tone(70, 0.5, 'sine', 0.4, 0, 48);
    this.tone(110, 0.5, 'sawtooth', 0.12, 0, 70);
    this.noise(0.4, 0.12, 'lowpass', 600);
  }

  private thud(): void {
    this.noise(0.18, 0.4, 'lowpass', 500);
    this.tone(120, 0.18, 'sine', 0.4, 0, 60);
  }

  private chargeShot(level: 1 | 2): void {
    const base = level === 2 ? 180 : 300;
    this.tone(base, 0.28, 'sawtooth', 0.22, 0, base * 6);
    this.noise(0.2, 0.16, 'highpass', 1200);
  }

  private bomb(): void {
    this.fmBell(1500, 0.5, 1.5, 2.5, 0.35);
    this.tone(1500, 0.5, 'sawtooth', 0.18, 0, 300);
    this.noise(0.6, 0.4, 'lowpass', 900);
  }

  private fever(): void {
    // celebratory ascending fanfare + a bright shimmer
    this.jingle([523, 659, 784, 1047], 'square', 0.07);
    this.fmBell(1568, 0.4, 2.0, 1.2, 0.2, 0.1);
  }

  private jingle(freqs: number[], type: OscillatorType, gap = 0.09): void {
    freqs.forEach((f, i) => this.tone(f, 0.14, type, 0.2, i * gap));
  }
}
