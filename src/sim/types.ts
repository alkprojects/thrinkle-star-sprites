import type { AttackTier } from '../config/balance';

/** Per-tick input for one seat. Humans and AI produce exactly this. */
export interface PlayerInput {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  /** Held = autofire; holding past charge threshold then releasing fires a charge shot. */
  fire: boolean;
  bomb: boolean;
  /** Only used when routing.normalMode === 'manual'. */
  targetToggle: boolean;
}

export const NEUTRAL_INPUT: PlayerInput = {
  moveX: 0, moveY: 0, fire: false, bomb: false, targetToggle: false,
};

export interface Zako {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Sinusoidal sway phase for serpentine patterns; 0 = straight. */
  swayPhase: number;
  swayAmp: number;
}

export interface Shot {
  x: number;
  y: number;
}

/** A piercing charge beam travelling up the field. */
export interface Beam {
  x: number;
  y: number;
  halfWidth: number;
}

export interface Explosion {
  x: number;
  y: number;
  ticksLeft: number;
  chainId: number;
}

/** An attack currently descending in some player's field. */
export interface IncomingAttack {
  id: number;
  tier: AttackTier;
  /** Seat that originally generated the attack (stats, elimination edge cases). */
  originalSender: number;
  /** Seat the attack most recently left (sender or last reflector) — reflections return here. */
  lastSender: number;
  x: number;
  y: number;
  /** Entry x — sway oscillates around this. */
  anchorX: number;
  age: number;
  speed: number;
  reflectCount: number;
  hp: number;
}

/** An attack in flight between fields. */
export interface TransitAttack {
  tier: AttackTier;
  originalSender: number;
  lastSender: number;
  target: number;
  reflectCount: number;
  ticksLeft: number;
  entryX: number;
  speed: number;
}

/** A chain in progress: explosions sharing a chainId, resolved when none remain. */
export interface ActiveChain {
  id: number;
  size: number;
  /** Reflections folded into this chain (attacks caught in explosions). */
  reflectedAttacks: number;
}

export interface PlayerSim {
  seat: number;
  alive: boolean;
  x: number;
  y: number;
  hp: number;
  iframes: number;
  bombs: number;
  shotCooldown: number;
  /** Ticks fire has been held (for charge); -1 when not holding. */
  chargeTicks: number;
  prevFire: boolean;
  prevBomb: boolean;
  prevTargetToggle: boolean;
  feverMeter: number;
  feverTicks: number;
  shots: Shot[];
  beams: Beam[];
  zako: Zako[];
  explosions: Explosion[];
  incoming: IncomingAttack[];
  chains: ActiveChain[];
  /** Routing state */
  roundRobinNext: number;
  lastAttacker: number;
  manualTarget: number;
  stats: {
    chains: number;
    biggestChain: number;
    attacksSent: number;
    reflections: number;
    damageDealt: number;
  };
}

export type MatchPhase = 'playing' | 'over';

/** One tick's worth of notable happenings — consumed by renderer/audio, cleared next tick. */
export type SimEvent =
  | { type: 'zako-killed'; seat: number }
  | { type: 'chain'; seat: number; size: number }
  | { type: 'attack-sent'; tier: AttackTier; from: number; to: number }
  | { type: 'reflect'; seat: number }
  | { type: 'player-hit'; seat: number; source: AttackTier | 'zako' }
  | { type: 'charge-fired'; seat: number; level: 1 | 2 }
  | { type: 'bomb'; seat: number }
  | { type: 'fever-start'; seat: number }
  | { type: 'eliminated'; seat: number }
  | { type: 'over'; winner: number };

export interface SimState {
  tick: number;
  phase: MatchPhase;
  winner: number;
  /** [a,b,c,d] words of the shared sim RNG. */
  rngState: [number, number, number, number];
  /** Separate RNG for wave generation so every field sees the IDENTICAL wave sequence. */
  waveRngState: [number, number, number, number];
  waveTimer: number;
  players: PlayerSim[];
  transit: TransitAttack[];
  nextId: number;
  nextChainId: number;
  events: SimEvent[];
}
