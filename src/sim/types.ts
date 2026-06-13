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
  /** Durability tier = remaining HP (§3.1): purple 5 → red 1; color is a direct readout.
   *  Optional so hand-built test fixtures default to a 1-hit (red) zako. */
  hp?: number;
  maxHp?: number;
}

export interface Shot {
  x: number;
  y: number;
}

/** A fever orb crossing a field (§6.1): only a chain explosion or a bomb detonates it,
 *  which grants that player fever. Shots pass through; if it exits the bottom it's gone. */
export interface Orb {
  id: number;
  x: number;
  y: number;
  vy: number;
  age: number;
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
  /** Blast strength — HP removed from a caught zako (scales with the source zako's size). */
  power: number;
  /** Effective blast radius (bigger for bigger source zako). */
  radius: number;
  /** Zako ids this explosion has already damaged, so a lingering blast hits each once
   *  (array, not a Set, so sim state stays JSON-serialisable for replays/netplay). */
  hitIds: number[];
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
  /** Starting HP = the fireball's SIZE tier (2 small … 5 biggest); set at arrival.
   *  Optional so hand-built test fixtures can omit it. */
  maxHp?: number;
  /** Flight pattern (§3.4): 0 parabola, 1 diagonal-bounce, 2 stop-and-track. Undefined →
   *  the legacy sinusoidal sway (used by hand-built test fixtures). */
  pattern?: number;
  /** Horizontal velocity for the parabola/diagonal patterns. */
  vx?: number;
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
  /** Size/HP for normals & reverses (combo-depth tier); defaulted by tier when absent. */
  hp?: number;
  /** Flight pattern stamped at send time (§3.4); cycles per formation. */
  pattern?: number;
}

/** Death, the reaper, patrolling one player's field (GAME_MECHANICS.md §7). */
export interface DeathReaper {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Heading components (unit-ish); pursuit steers these with a limited turn rate. */
  vx: number;
  vy: number;
  speed: number;
  age: number;
  /** true = the time-triggered Death (respawns endlessly); false = the inactivity Death
   *  (despawns permanently after one kill). */
  permanent: boolean;
}

/** A chain in progress: explosions sharing a chainId, resolved when none remain. */
export interface ActiveChain {
  id: number;
  size: number;
  /** Reflections folded into this chain (attacks caught in explosions). */
  reflectedAttacks: number;
  /** REVERSE attacks caught by this chain's explosions — >= bossFromReversesInCombo
   *  of these sends a Boss instead of their individual Extras (original ladder rule). */
  reversesCaught: number;
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
  /** Ticks of post-zako-collision dizzy debuff remaining (reduced move + shot speed). */
  dizzyTicks: number;
  /** Charge-meter economy (0..1): fills from kills, spent by Lv2/MAX charge releases. */
  chargeMeter: number;
  // --- Per-character stats, baked at createSim from the seat's CharacterDef ---
  moveSpeed: number;
  shotSpeed: number;
  shotReload: number;
  chargeLv1: number;
  chargeLv2: number;
  chargeMax: number;
  beamDamage: number;
  exCount: number;
  bossHp: number;
  // --- Death (the reaper) on this field ---
  death: DeathReaper | null;
  deathCount: number;     // appearances so far (drives HP + speed growth)
  deathArmTimer: number;  // ticks until Death may (re)spawn; >0 = waiting, 0 = ready
  lastShotTick: number;   // last tick a shot was fired (for the inactivity Death trigger)
  inactivityDeathDone: boolean; // the one-shot inactivity Death has already been used
  shots: Shot[];
  beams: Beam[];
  zako: Zako[];
  orbs: Orb[];
  orbTimer: number;       // ticks until the next fever orb crosses this field
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
  | { type: 'charge-fired'; seat: number; level: 1 | 2 | 3 }
  | { type: 'charge-special'; seat: number; tier: AttackTier; count: number }
  | { type: 'boss-reversed'; seat: number }
  | { type: 'bomb'; seat: number }
  | { type: 'fever-start'; seat: number }
  | { type: 'orb-spawn'; seat: number }
  | { type: 'death-spawn'; seat: number; count: number }
  | { type: 'death-killed'; seat: number }
  | { type: 'death-ko'; seat: number }
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
  /** Current fireball flight pattern (§3.4), advances each wave (formation change). */
  attackPattern: number;
  events: SimEvent[];
}
