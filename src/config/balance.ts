/**
 * EVERY gameplay number and rule variant lives here. Sim code never hardcodes a tunable.
 *
 * Numbers marked PROVISIONAL are educated reconstructions of the original game,
 * pending reconciliation with docs/GAME_MECHANICS.md and owner playtests.
 * Distances are in field units (field = 160 wide × 224 tall), times in ticks (60/sec).
 */

/** Who chain-generated Normal Attacks are sent to. Owner default: 'both'. */
export type RoutingMode = 'both' | 'round-robin' | 'retaliation' | 'manual' | 'leader';

/** How life-steal healing is shared among the other players. */
export type LifeStealSplit = 'divided' | 'each';

export type AttackTier = 'normal' | 'reverse' | 'extra' | 'boss';

export interface BalanceConfig {
  field: { width: number; height: number };
  player: {
    speed: number;            // units/tick, full 2D movement
    radius: number;           // collision radius
    maxHp: number;
    iframesTicks: number;     // invincibility after taking damage
    bombs: number;            // starting bomb stock
  };
  shot: {
    cooldownTicks: number;    // autofire rate while held (tap-fire)
    speed: number;
    chargeTicksLv1: number;   // hold duration for level-1 charge
    chargeTicksLv2: number;   // hold duration for level-2 charge (wider blast)
    chargeWidthLv1: number;   // beam half-width
    chargeWidthLv2: number;
  };
  waves: {
    /** Ticks between wave spawns; identical wave sequence on every field (fairness, as in the original). */
    intervalTicks: number;
    intervalMinTicks: number; // interval shrinks over the match toward this
    rampPerSecond: number;    // interval reduction per second of match time
    zakoSpeed: number;
    zakoRadius: number;
  };
  chain: {
    explosionRadius: number;  // blast circle that detonates adjacent zako
    explosionTicks: number;   // how long a blast lingers
    minChainToAttack: number; // chain size that starts sending attacks (PROVISIONAL: 3)
    /** attacksSent = floor((chain - minChainToAttack) / perExtraChain) + 1 */
    perExtraChain: number;
    maxAttacksPerChain: number;
    feverGainPerChainLink: number; // fever meter % per chain link
  };
  attacks: {
    travelTicks: number;        // delay before a sent attack enters the target field
    baseSpeed: number;          // descent speed of a normal attack
    swayAmplitude: number;      // sinusoidal sway of incoming attacks
    swayPeriodTicks: number;
    attackRadius: number;
    attackHp: number;           // shots to down a normal/reverse attack
    extraHp: number;            // shots to down an Extra Attack
    /** Escalation ladder (PROVISIONAL until GAME_MECHANICS.md lands):
     *  normal shot down  -> reflects as 'reverse' back to ORIGINAL SENDER (owner rule)
     *  reverse shot down -> reflects again, faster each time
     *  extra             -> cannot reflect; can be destroyed (extraHp) or dodged
     *  boss              -> destroyed only by depleting bossHp; can't reflect */
    reverseSpeedScale: number;  // speed multiplier per reflection
    maxReflections: number;     // beyond this, attack is undodgeable-fast but still capped
    /** Simultaneous chains resolving in one tick (e.g. via charge shot) send an Extra Attack. */
    simultaneousChainsForExtra: number;
    extraSpeed: number;
    bossHp: number;
    bossSpeed: number;
    bossDurationTicks: number;  // boss leaves after this if not killed
  };
  damage: {
    normalHit: number;
    reverseHit: number;
    extraHit: number;
    bossHit: number;            // per boss contact/volley
    zakoCollision: number;      // bumping into a regular enemy
  };
  lifeSteal: {
    /** Fraction of self-inflicted (zako-collision) damage recovered by other players. Original: 0.5 to the one opponent. */
    fraction: number;
    /** 'divided': fraction is split among living others (faithful total economy).
     *  'each': every living other heals the full fraction. OWNER TO PICK after playtest. */
    split: LifeStealSplit;
  };
  fever: {
    durationTicks: number;
    /** During fever, a chain >= this sends a Boss Attack instead of an Extra. */
    bossChainSize: number;
  };
  routing: {
    normalMode: RoutingMode;       // owner default: 'both'
    extrasToAll: boolean;          // Extra Attacks hit all opponents (owner: true)
    bossToAll: boolean;            // Boss Attacks hit all opponents (owner: true)
    /** Reflections return to the attack's ORIGINAL sender (owner rule). If that
     *  player is eliminated: 'drop' the reflection or 'redirect-other'. */
    reflectionToEliminated: 'drop' | 'redirect-other';
    /** Global pressure valves for 3-player density (1.0 = faithful). */
    incomingSpeedScale: number;
    incomingDensityScale: number;  // probability scale that a routed attack is actually sent
  };
  match: {
    timerTicks: number;            // round timer (PROVISIONAL: 120s)
    onTimeout: 'most-hp' | 'sudden-death';
  };
  bomb: {
    radius: number;                // clears zako + attacks in radius
    /** Attacks destroyed by a bomb do NOT reflect (PROVISIONAL). */
    reflectsAttacks: boolean;
  };
}

export const DEFAULT_BALANCE: BalanceConfig = {
  field: { width: 160, height: 224 },
  player: {
    speed: 2.2,
    radius: 3,
    maxHp: 80,
    iframesTicks: 75,
    bombs: 3,
  },
  shot: {
    cooldownTicks: 7,
    speed: 6,
    chargeTicksLv1: 30,
    chargeTicksLv2: 70,
    chargeWidthLv1: 14,
    chargeWidthLv2: 26,
  },
  waves: {
    intervalTicks: 150,
    intervalMinTicks: 70,
    rampPerSecond: 0.5,
    zakoSpeed: 0.55,
    zakoRadius: 6,
  },
  chain: {
    explosionRadius: 16,
    explosionTicks: 24,
    minChainToAttack: 3,
    perExtraChain: 1,
    maxAttacksPerChain: 8,
    feverGainPerChainLink: 4,
  },
  attacks: {
    travelTicks: 55,
    baseSpeed: 1.1,
    swayAmplitude: 22,
    swayPeriodTicks: 90,
    attackRadius: 6,
    attackHp: 1,
    extraHp: 6,
    reverseSpeedScale: 1.22,
    maxReflections: 7,
    simultaneousChainsForExtra: 2,
    extraSpeed: 0.9,
    bossHp: 45,
    bossSpeed: 0.35,
    bossDurationTicks: 600,
  },
  damage: {
    normalHit: 8,
    reverseHit: 8,
    extraHit: 14,
    bossHit: 16,
    zakoCollision: 8,
  },
  lifeSteal: {
    fraction: 0.5,
    split: 'divided',
  },
  fever: {
    durationTicks: 600,
    bossChainSize: 5,
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
    radius: 70,
    reflectsAttacks: false,
  },
};
