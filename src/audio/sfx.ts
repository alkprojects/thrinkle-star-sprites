import type { SimEvent } from '../sim/types';

/**
 * Synthesized SFX — no audio assets, everything is WebAudio oscillators/noise.
 * Replace with real samples later by swapping the play* functions.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Must be called from a user gesture before sounds can play. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
  }

  handle(events: SimEvent[]): void {
    if (!this.ctx || this.muted) return;
    let pops = 0;
    for (const e of events) {
      switch (e.type) {
        case 'zako-killed':
          if (pops++ < 4) this.pop(220 + pops * 60);
          break;
        case 'chain':
          this.arpeggio(Math.min(e.size, 8));
          break;
        case 'reflect':
          this.ping();
          break;
        case 'attack-sent':
          if (e.tier === 'extra') this.whoosh(180);
          else if (e.tier === 'boss') this.whoosh(70);
          break;
        case 'player-hit':
          this.thud();
          break;
        case 'charge-fired':
          this.whoosh(e.level === 2 ? 120 : 240);
          break;
        case 'bomb':
          this.boom();
          break;
        case 'fever-start':
          this.jingle([523, 659, 784, 1047]);
          break;
        case 'eliminated':
          this.jingle([392, 330, 262, 196]);
          break;
        case 'over':
          this.jingle([523, 523, 659, 784, 1047, 1319]);
          break;
      }
    }
  }

  private env(duration: number, peak = 0.5): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    g.connect(this.master!);
    return g;
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'square', peak = 0.25, delay = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    g.connect(this.master!);
    o.connect(g);
    o.start(ctx.currentTime + delay);
    o.stop(ctx.currentTime + delay + duration + 0.05);
  }

  private noise(duration: number, peak = 0.3, lowpass = 1200): void {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    src.connect(f);
    f.connect(this.env(duration, peak));
    src.start();
  }

  private pop(freq: number): void {
    this.tone(freq, 0.08, 'triangle', 0.2);
  }

  private arpeggio(steps: number): void {
    for (let i = 0; i < steps; i++) {
      this.tone(330 * Math.pow(1.122, i), 0.07, 'square', 0.15, i * 0.045);
    }
  }

  private ping(): void {
    this.tone(1318, 0.12, 'sine', 0.3);
    this.tone(1976, 0.1, 'sine', 0.15, 0.03);
  }

  private whoosh(low: number): void {
    this.noise(0.25, 0.2, low * 8);
    this.tone(low, 0.22, 'sawtooth', 0.12);
  }

  private thud(): void {
    this.noise(0.18, 0.4, 500);
    this.tone(90, 0.18, 'sine', 0.4);
  }

  private boom(): void {
    this.noise(0.5, 0.5, 700);
    this.tone(60, 0.45, 'sine', 0.4);
  }

  private jingle(freqs: number[]): void {
    freqs.forEach((f, i) => this.tone(f, 0.13, 'square', 0.2, i * 0.09));
  }
}
