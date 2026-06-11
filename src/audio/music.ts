/**
 * Tiny chiptune sequencer — an original, copyright-safe approximation of Twinkle Star
 * Sprites' "impossibly upbeat" J-pop/disco arcade BGM (see docs/VISUAL_AUDIO_IDENTITY §10).
 * All synthesized in WebAudio: square lead, triangle arpeggio harmony, sawtooth bass,
 * noise drums. A lookahead scheduler queues notes ahead of time so timing is rock-steady.
 *
 * Nothing here samples or transcribes an ADK track — these are original bright-major
 * pentatonic loops written to *feel* like the genre.
 */

export type Track = 'title' | 'battle';

type Step = number; // MIDI note, or 0 for a rest

interface Song {
  bpm: number;
  /** 16th-note grid; all arrays are this length and loop. */
  steps: number;
  lead: Step[];
  bass: Step[];
  /** Arp chord per step (triangle), 0 = rest. */
  arp: Step[];
  kick: number[]; // step indices
  snare: number[];
  hat: number[];
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// --- BATTLE: driving I–V–vi–IV (C–G–Am–F), bright C-major pentatonic lead ---
// 32 steps = 2 bars of 16ths. Each chord lasts 8 steps (half a bar).
const _ = 0;
const BATTLE: Song = {
  bpm: 166,
  steps: 32,
  //        C . . .  . . . .   G . . .  . . . .   Am. . .  . . . .   F . . .  . . . .
  lead: [
    72, _, 76, 79, _, 76, 72, _, 74, _, 79, 74, _, 71, 67, _,
    72, _, 76, 81, _, 79, 76, _, 72, _, 69, 65, _, 67, 72, _,
  ],
  arp: [
    60, 64, 67, 64, 60, 64, 67, 64, 55, 59, 62, 59, 55, 59, 62, 59,
    57, 60, 64, 60, 57, 60, 64, 60, 53, 57, 60, 57, 53, 57, 60, 57,
  ],
  bass: [
    36, _, 48, _, 36, _, 43, _, 43, _, 55, _, 43, _, 50, _,
    45, _, 57, _, 45, _, 52, _, 41, _, 53, _, 41, _, 48, _,
  ],
  kick: [0, 6, 8, 14, 16, 22, 24, 30],
  snare: [4, 12, 20, 28],
  hat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 3, 11, 19, 27],
};

// --- TITLE: gentler I–vi–IV–V (C–Am–F–G), sparse and inviting ---
const TITLE: Song = {
  bpm: 150,
  steps: 32,
  lead: [
    79, _, _, 76, _, 72, _, _, 76, _, _, 74, _, _, _, _,
    72, _, _, 74, _, 76, _, _, 79, _, _, _, 81, _, 79, _,
  ],
  arp: [
    60, 64, 67, 72, 60, 64, 67, 72, 57, 60, 64, 69, 57, 60, 64, 69,
    53, 57, 60, 65, 53, 57, 60, 65, 55, 59, 62, 67, 55, 59, 62, 67,
  ],
  bass: [
    36, _, _, _, 48, _, _, _, 45, _, _, _, 57, _, _, _,
    41, _, _, _, 53, _, _, _, 43, _, _, _, 55, _, 43, _,
  ],
  kick: [0, 8, 16, 24],
  snare: [4, 12, 20, 28],
  hat: [2, 6, 10, 14, 18, 22, 26, 30],
};

const SONGS: Record<Track, Song> = { title: TITLE, battle: BATTLE };

export class Music {
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private song: Song | null = null;
  current: Track | null = null;

  constructor(private ctx: AudioContext, private out: GainNode) {}

  play(track: Track): void {
    if (this.current === track) return;
    this.stop();
    this.song = SONGS[track];
    this.current = track;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.current = null;
    this.song = null;
  }

  private schedule(): void {
    const song = this.song;
    if (!song) return;
    const stepDur = 60 / song.bpm / 4; // 16th note
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(song, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % song.steps;
    }
  }

  private playStep(song: Song, i: number, t: number, stepDur: number): void {
    const lead = song.lead[i];
    if (lead) this.voice(midi(lead), t, stepDur * 1.6, 'square', 0.16, 0.006);
    const arp = song.arp[i];
    if (arp) this.voice(midi(arp), t, stepDur * 0.9, 'triangle', 0.07, 0.004);
    const bass = song.bass[i];
    if (bass) this.voice(midi(bass), t, stepDur * 1.8, 'sawtooth', 0.13, 0.004, 1400);
    if (song.kick.includes(i)) this.kick(t);
    if (song.snare.includes(i)) this.snare(t);
    if (song.hat.includes(i)) this.hat(t);
  }

  private voice(freq: number, t: number, dur: number, type: OscillatorType, peak: number, attack: number, lowpass?: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    let node: AudioNode = o;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      o.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    node.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + 0.18);
  }

  private snare(t: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(t);
    src.stop(t + 0.14);
  }

  private hat(t: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 8000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(t);
    src.stop(t + 0.05);
  }
}

let _noise: AudioBuffer | null = null;
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (_noise && _noise.sampleRate === ctx.sampleRate) return _noise;
  const len = ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  _noise = buf;
  return buf;
}
