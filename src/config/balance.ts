/**
 * EVERY gameplay number and rule variant lives here. Sim code never hardcodes a tunable.
 *
 * Numbers follow docs/GAME_MECHANICS.md (the verified original-game reference) unless
 * marked 3P-ADAPT (deliberate 3-player change, see docs/ADAPTATION.md) or
 * PROVISIONAL (original value unknown — needs playtest/emulator verification,
 * see docs/FIDELITY_GAPS.md). Distances in field units (160×224), times in ticks (60/s).
 */

/** Who chain-generated Normal Attacks are sent to. Owner default: 'both'. */
export type RoutingMode = 'both' | 'round-robin' | 'retaliation' | 'manual' | 'leader';

/** How healing from one player's mishap is shared among the other players. */
export type LifeStealSplit = 'divided' | 'each';

export type AttackTier = 'normal' | 'reverse' | 'extra' | 'boss';

export interface BalanceConfig {
  field: { width: number; height: number };
  player: {
    speed: number;            // units/tick; diagonals NOT normalized in the original (√2 faster)
    radius: number;           // collision radius
    maxHp: number;            // hearts — original: 5
    iframesTicks: number;     // post-attack-hit invincibility — original: ~58 frames
    bombs: number;            // per-round bomb stock — original: 2
  };
  shot: {
    cooldownTicks: number;    // autofire rate while held (original limits to 2 shots on screen)
    speed: number;
    chargeTicksLv1: number;   // hold duration for level-1 charge
    chargeTicksLv2: number;   // hold duration for level-2 charge (wider blast)
    chargeWidthLv1: number;   // beam half-width
    chargeWidthLv2: number;
    beamSpeedScale: number;   // beam speed = shot speed * this
    beamDamage: number;       // hp removed per beam touch on a destructible attack
  };
  waves: {
    /** Ticks between wave spawns; identical wave sequence on every field (fairness, as in the original). */
    intervalTicks: number;
    intervalMinTicks: number; // interval shrinks over the match toward this
    rampPerSecond: number;    // interval reduction per second of match time
    firstWaveTick: number;    // ticks until the opening wave
    zakoSpeed: number;
    zakoRadius: number;
    swayRate: number;         // phase advance per tick for serpentine zako
    swayFactor: number;       // horizontal speed = sin(phase) * swayAmp * swayFactor
  };
  chain: {
    explosionRadius: number;  // blast circle that detonates adjacent zako (PROVISIONAL)
    explosionTicks: number;   // how long a blast lingers — original: ~30 active frames
    /** An explosion must be at least this old before it detonates neighbours —
     *  creates the original's rippling pop-pop-pop cascade instead of one big bang. */
    propagationDelayTicks: number;
    /** Original mapping: fireballs = floor((hits-2)/2), i.e. the 4th hit sends the
     *  first fireball and every 2 hits add one more. minChainToAttack=4, perExtraChain=2. */
    minChainToAttack: number;
    perExtraChain: number;
    maxAttacksPerChain: number; // counter caps at 32 hits → 15 fireballs
    /** During fever the mapping becomes (hits - feverHitOffset) starting from the 2nd hit. */
    feverHitOffset: number;     // original: 1 (fever sends hits-1 fireballs)
    feverGainPerChainLink: number; // 3P-ADAPT: meter-based fever stand-in until orbs exist (FIDELITY_GAPS)
  };
  attacks: {
    travelTicks: number;        // delay before a sent attack enters the target field (PROVISIONAL)
    baseSpeed: number;          // descent speed of a normal fireball
    swayAmplitude: number;      // sinusoidal sway of incoming attacks (stand-in for the 3 patterns)
    swayPeriodTicks: number;
    attackRadius: number;
    attackHp: number;           // shots to down a small fireball — original: 2
    /** Original ladder (docs/GAME_MECHANICS.md §4):
     *  normal destroyed (shot or explosion) -> REVERSE back to its sender (owner rule:
     *    reflections return to the original sender), slightly faster — the ONLY speed bump
     *  reverse destroyed individually        -> ONE Extra Attack (1:1)
     *  >= bossFromReversesInCombo reverses caught by EXPLOSIONS in ONE combo
     *                                        -> ONE Boss INSTEAD of those extras
     *  extra  -> INDESTRUCTIBLE, dodge only (ladder ends)
     *  boss   -> killable by depleting bossHp; never reflects */
    reverseSpeedScale: number;  // reverse = baseSpeed * this (original: "slightly faster")
    bossFromReversesInCombo: number; // original: 3
    extrasDestructible: boolean;     // original: false — knob for 3P experimentation
    extraHp: number;                 // only used if extrasDestructible
    /** Simultaneous chains resolving in one tick (e.g. via charge shot) send an Extra.
     *  PROVISIONAL stand-in for the original's Lv2-meter extras (FIDELITY_GAPS). */
    simultaneousChainsForExtra: number;
    extraSpeed: number;
    bossHp: number;             // original: 17–25 by character
    bossSpeed: number;
    bossDurationTicks: number;  // original: ~10-15s if ignored
    bossHoverY: number;
    bossRainIntervalTicks: number; // boss drops a reflectable shot every N ticks
    bossHitboxScale: number;    // boss radius = attackRadius * this (contact AND shots)
    entryMarginFrac: number;    // attacks enter within [frac, 1-frac] of field width
  };
  damage: {
    /** Original: EVERY opponent attack (normal/reverse/extra/boss) costs 3 hearts. */
    attackHit: number;
    /** Original: zako collision costs 1 heart and can NEVER kill (floor 0.5). */
    zakoCollision: number;
    zakoFloorHp: number;
  };
  lifeSteal: {
    /** Original: healing is FIXED per hit type, not damage-proportional.
     *  Attack hits heal the ATTACKER +1 heart; zako collisions heal the others +0.5 total. */
    onAttackHit: number;
    onZakoHit: number;
    /** 3P-ADAPT — owner rule: zako-collision healing goes to BOTH other players.
     *  'divided': onZakoHit split between them (conserves the original economy).
     *  'each': both heal the full amount. OWNER TO PICK after playtest. */
    split: LifeStealSplit;
  };
  fever: {
    durationTicks: number;     // original: 10s orb-fever; meter-triggered here (FIDELITY_GAPS)
  };
  routing: {
    normalMode: RoutingMode;       // owner default: 'both'
    extrasToAll: boolean;          // Extra Attacks hit all opponents (owner: true)
    bossToAll: boolean;            // Boss Attacks hit all opponents (owner: true)
    /** Reflections return to the attack's ORIGINAL sender (owner rule). If that
     *  player is eliminated: 'drop' the reflection or 'redirect-other'. */
    reflectionToEliminated: 'drop' | 'redirect-other';
    /** Global pressure valves for 3-player density (1.0 = faithful).
     *  Density gate applies ONLY to chain-generated normal attacks — never to
     *  reflections, extras, or bosses (a successful reflection must always return). */
    incomingSpeedScale: number;
    incomingDensityScale: number;
  };
  match: {
    timerTicks: number;            // stand-in for the original's ~100s Death reaper (FIDELITY_GAPS)
    /** 'most-hp': healthiest player wins on timeout (exact tie = draw).
     *  'sudden-death': on timeout everyone drops to 1 HP and healing stops working. */
    onTimeout: 'most-hp' | 'sudden-death';
  };
  bomb: {
    /** Original: bombs cover the ENTIRE field. */
    radius: number;
    /** Original: bombs do NOT destroy incoming fireballs or extras (you survive via i-frames). */
    clearsAttacks: boolean;
    /** Owner-experiment knob: if bombs do clear attacks, do normals/reverses reflect back? */
    reflectsAttacks: boolean;
  };
}

export const DEFAULT_BALANCE: BalanceConfig = {
  field: { width: 160, height: 224 },
  player: {
    speed: 2.2,
    radius: 3,
    maxHp: 5,
    iframesTicks: 58,
    bombs: 2,
  },
  shot: {
    cooldownTicks: 7,
    speed: 6,
    chargeTicksLv1: 30,
    chargeTicksLv2: 70,
    chargeWidthLv1: 14,
    chargeWidthLv2: 26,
    beamSpeedScale: 1.6,
    beamDamage: 2,
  },
  waves: {
    intervalTicks: 150,
    intervalMinTicks: 70,
    rampPerSecond: 0.5,
    firstWaveTick: 90,
    zakoSpeed: 0.55,
    zakoRadius: 6,
    swayRate: 0.04,
    swayFactor: 0.045,
  },
  chain: {
    explosionRadius: 16,
    explosionTicks: 30,
    propagationDelayTicks: 7,
    minChainToAttack: 4,
    perExtraChain: 2,
    maxAttacksPerChain: 15,
    feverHitOffset: 1,
    feverGainPerChainLink: 4,
  },
  attacks: {
    travelTicks: 55,
    baseSpeed: 1.1,
    swayAmplitude: 22,
    swayPeriodTicks: 90,
    attackRadius: 6,
    attackHp: 2,
    reverseSpeedScale: 1.15,
    bossFromReversesInCombo: 3,
    extrasDestructible: false,
    extraHp: 6,
    simultaneousChainsForExtra: 2,
    extraSpeed: 0.9,
    bossHp: 21,
    bossSpeed: 0.35,
    bossDurationTicks: 750,
    bossHoverY: 56,
    bossRainIntervalTicks: 90,
    bossHitboxScale: 3,
    entryMarginFrac: 0.12,
  },
  damage: {
    attackHit: 3,
    zakoCollision: 1,
    zakoFloorHp: 0.5,
  },
  lifeSteal: {
    onAttackHit: 1,
    onZakoHit: 0.5,
    split: 'divided',
  },
  fever: {
    durationTicks: 600,
  },
  routing: {
    normalMode: 'both',
    extrasToAll: true,
    bossToAll: true,
    reflectionToEliminated: 'drop',
    incomingSpeedScale: 1.0,
    incomingDensityScale: 1.0,
  },
  match: {
    timerTicks: 120 * 60,
    onTimeout: 'most-hp',
  },
  bomb: {
    radius: 300,
    clearsAttacks: false,
    reflectsAttacks: false,
  },
};
