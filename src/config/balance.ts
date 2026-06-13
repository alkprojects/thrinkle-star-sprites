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
    /** Post-zako-collision "dizzy" debuff (§5.4): ~5s of reduced move + shot speed. */
    dizzyTicks: number;
    dizzyMoveScale: number;   // movement multiplier while dizzy (original ≈50%)
    dizzyShotScale: number;   // shot-speed multiplier while dizzy (original ≈65%)
  };
  shot: {
    cooldownTicks: number;    // autofire rate while held (original limits to 2 shots on screen)
    speed: number;
    chargeTicksLv1: number;   // hold duration for level-1 charge
    chargeTicksLv2: number;   // hold duration for level-2 charge (wider blast) — original 2× L1
    chargeTicksMax: number;   // hold duration for MAX charge — original 3× L1 (mikwuyma)
    chargeWidthLv1: number;   // beam half-width
    chargeWidthLv2: number;
    chargeWidthMax: number;
    beamSpeedScale: number;   // beam speed = shot speed * this
    beamDamage: number;       // hp removed per beam touch on a destructible attack
  };
  /**
   * Charge-meter economy (GAME_MECHANICS.md §4.2/§5.6). The red gauge fills as you destroy
   * zako; a charge release SPENDS meter to send attacks on top of the beam:
   *   hold ≥ Lv2 AND meter ≥ lv2Threshold → send exCount Extra ("special") attacks (cost lv2Cost)
   *   hold ≥ MAX AND meter ≥ maxThreshold → send a Boss (cost maxCost); if a boss is already in
   *     YOUR field, this REVERSES it (your boss replaces it on the opponents).
   * Meter is a 0..1 fraction; the gauge's "1 / 2 / MAX" marks sit at meterLv1Mark / lv2Threshold / 1.
   */
  charge: {
    gainPerZako: number;        // meter added per zako you destroy
    gainPerChainLink: number;   // extra meter per chain link at chain resolution
    meterLv1Mark: number;       // where the "1" notch sits on the gauge (free zone top)
    lv2Threshold: number;       // meter needed to send specials on a Lv2 release (the "2" mark)
    maxThreshold: number;       // meter needed to send a boss on a MAX release
    lv2Cost: number;            // meter spent sending specials
    maxCost: number;            // meter spent sending a boss
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
    /** Durability (§3.1): a zako's collision radius and the explosion it makes grow by this
     *  fraction per HP tier above 1 (purple 5-HP zako are bigger and make bigger blasts). */
    tierRadiusScale: number;
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
    swayAmplitude: number;      // sinusoidal sway — legacy fallback path only
    swayPeriodTicks: number;
    /** Three fireball flight patterns (§3.4), cycling per formation. */
    patternHoverY: number;      // stop-and-track: hover line before the drop
    patternTrackTicks: number;  // stop-and-track: ticks spent tracking before dropping
    patternTrackSpeed: number;  // stop-and-track: horizontal tracking speed
    patternParabolaVx: number;  // parabola: horizontal drift
    patternParabolaAccel: number; // parabola: vertical acceleration per tick of age
    patternDiagonalVx: number;  // diagonal-bounce: aim horizontal speed
    patternDiagonalSpeedScale: number; // diagonal-bounce: faster descent
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
    durationTicks: number;     // original: ~10s of fever
    /** 'orb' (faithful): a fever orb crosses the field; detonate it with a chain/bomb → fever.
     *  'meter': the legacy chain-meter trigger (kept as a flippable alternative). */
    mode: 'orb' | 'meter';
    orbIntervalMinTicks: number; // ticks between orb appearances (semi-random per field)
    orbIntervalMaxTicks: number;
    orbSpeed: number;            // orb descent speed
    orbRadius: number;
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
    timerTicks: number;            // hard fallback; Death (below) is the real anti-stall resolver
    /** 'most-hp': healthiest player wins on timeout (exact tie = draw).
     *  'sudden-death': on timeout everyone drops to 1 HP and healing stops working. */
    onTimeout: 'most-hp' | 'sudden-death';
  };
  /**
   * Death — the reaper (GAME_MECHANICS.md §7). Spawns on each living field ~100s in and
   * pursues that player; contact = instant elimination (bypasses hearts). Killable by
   * shots / beams / chains / bombs; respawns tougher. Evadable forever by circling
   * (diagonal player speed > Death's capped speed), as in the original.
   */
  death: {
    startTicks: number;            // match time before Death first appears (~100s)
    /** Early Death if a player fires no shots for this long (§7); this one despawns
     *  permanently after a single kill (vs the time Death, which respawns endlessly). */
    inactivityTicks: number;
    hp0: number;                   // HP on first appearance
    hpPerAppearance: number;       // +HP each subsequent appearance
    hpCap: number;                 // HP ceiling
    speedStart: number;            // units/tick on first appearance
    speedMax: number;              // cap (must stay < slowest char's diagonal speed)
    speedGrowthPerAppearance: number;
    turnRate: number;              // max heading change per tick (radians) — limited pursuit
    respawnTicks: number;          // gap before Death re-appears after a kill / drift-off
    radius: number;                // contact + hurt radius
    explosionRadius: number;       // chain blast when killed (participates in the chain system)
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
    // §8.2 Load Ran baseline: 56f horizontal / 80f vertical wall-to-wall.
    // Clamped traverse is 154u × 218u → 2.75 u/tick hits 56.0f / 79.3f.
    speed: 2.75,
    radius: 3,
    maxHp: 5,
    iframesTicks: 58,
    bombs: 2,
    dizzyTicks: 300,      // ~5s (§5.4, single-sourced)
    dizzyMoveScale: 0.5,  // rule-of-thumb ≈50% move
    dizzyShotScale: 0.65, // ≈65% shot speed
  },
  shot: {
    cooldownTicks: 7,
    speed: 6.6,               // §8.2: full-height shot travel 34f → 224/34 ≈ 6.6
    chargeTicksLv1: 65,       // §8.2: Ran charge L1 = 65f hold
    chargeTicksLv2: 130,      // §8.2: L2 = 2× L1 hold
    chargeTicksMax: 195,      // §8.2: MAX = 3× L1 hold
    chargeWidthLv1: 14,
    chargeWidthLv2: 26,
    chargeWidthMax: 34,
    beamSpeedScale: 1.6,
    beamDamage: 2,
  },
  charge: {
    // Meter fills slowly so specials are a mid-game tool and a boss is a late-game event
    // (as in the original), not a 15-second spam — keeps rounds long enough to reach Death.
    gainPerZako: 0.011,       // ~60 kills to fill; "2" mark (specials) ~40 kills in
    gainPerChainLink: 0.004,
    meterLv1Mark: 1 / 3,
    lv2Threshold: 2 / 3,      // the "2" mark — owner's "meter 2/3 full" → specials
    maxThreshold: 1.0,        // full → boss
    lv2Cost: 1 / 3,
    maxCost: 2 / 3,
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
    tierRadiusScale: 0.12,
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
    patternHoverY: 42,
    patternTrackTicks: 80,
    patternTrackSpeed: 0.8,
    patternParabolaVx: 0.95,
    patternParabolaAccel: 0.013,
    patternDiagonalVx: 1.15,
    patternDiagonalSpeedScale: 1.4,
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
    // Original is 3 (two clean hits kill from 5). 3-player 'both' routing ~doubles the
    // incoming volume, so rounds ended in ~20s and never reached Death. 2 here = three
    // hits to kill, stretching rounds into the original's 30s–3min range so Death (100s)
    // becomes a real late-round resolver. 3P-ADAPT pacing knob — set 3 for the purest feel.
    attackHit: 2,
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
    mode: 'orb',
    orbIntervalMinTicks: 16 * 60, // an orb roughly every 16–26s per field
    orbIntervalMaxTicks: 26 * 60,
    orbSpeed: 0.7,
    orbRadius: 7,
  },
  routing: {
    normalMode: 'both',
    extrasToAll: true,
    bossToAll: true,
    reflectionToEliminated: 'drop',
    // 3-player 'both' routing roughly doubles incoming pressure vs the 1v1 original; thin
    // and slow it so clean hits are rarer and rounds last long enough for Death to matter
    // (FIDELITY_GAPS §0a). These are the top pacing knobs — raise toward 1.0 for more chaos.
    incomingSpeedScale: 0.85,
    incomingDensityScale: 0.35,
  },
  match: {
    timerTicks: 240 * 60,    // generous fallback; Death resolves long-running rounds first
    onTimeout: 'most-hp',
  },
  death: {
    startTicks: 100 * 60,    // §7: ~100 in-game seconds
    inactivityTicks: 30 * 60, // §7: ~30s of firing nothing (figure unverified — a knob)
    hp0: 4,
    hpPerAppearance: 3,
    hpCap: 100,
    speedStart: 1.9,
    speedMax: 2.7,           // < Tyleru's diagonal (2.25×√2 ≈ 3.18) so every char can circle-evade
    speedGrowthPerAppearance: 0.12,
    turnRate: 0.06,
    respawnTicks: 180,
    radius: 7,
    explosionRadius: 22,     // §7: Death explodes with blast power 3 and feeds the chain system
  },
  bomb: {
    radius: 300,
    clearsAttacks: false,
    reflectsAttacks: false,
  },
};
