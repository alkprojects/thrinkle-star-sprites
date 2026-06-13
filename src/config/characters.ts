/**
 * Playable roster — ORIGINAL caricature humans (copyright-safe), built in the Twinkle
 * Star Sprites mold: cute, chibi, big-head pixel sprites with a 1px navy outline, flat
 * fills + one shadow/one highlight, dot eyes, ±1px idle bob. These are OUR characters,
 * not renamed ADK ones.
 *
 * Each carries gameplay STATS (the "power / speed" tiers the owner specified) and an
 * attack THEME that drives its themed projectile / charge / special / boss art:
 *   1) Danny Donkey   — blonde, chubby; FRISBEE attacks; power 2 / speed 2 (the baseline).
 *   2) Heavy Tyleru   — balding + stubble, heavyset; FILM-REEL / movie attacks; power 1 / speed 1.
 *   3) Senseitional Alex — tall, muscular, shades, shirtless; WEIGHTLIFTING attacks; power 3 / speed 3.
 *
 * Stat numbers are absolute (units/tick, ticks) so the sim bakes them per-seat at
 * createSim. Danny == the Load-Ran baseline in docs/GAME_MECHANICS.md §8.2, so the
 * feel tests (seat 0) stay green. Tyleru/Alex spread around it by tier.
 */
export type CharKind = 'danny' | 'tyleru' | 'alex';
export type AttackTheme = 'frisbee' | 'film' | 'weight';
export type TerrainTheme = 'meadow' | 'cinema' | 'sunny';

/** Per-character gameplay stats, baked onto each PlayerSim at match start. */
export interface CharStats {
  /** Movement speed, units/tick (diagonals unnormalised → √2 faster, as in the original). */
  moveSpeed: number;
  /** Shot travel speed, units/tick. */
  shotSpeed: number;
  /** Ticks between autofire shots (our stand-in for the original 2-on-screen cap). */
  shotReload: number;
  /** Hold ticks to reach charge Level 1; L2 = 2×, MAX = 3× (mikwuyma's multiplier rule). */
  chargeLv1: number;
  /** Damage a charge beam deals per touch to a destructible attack. */
  beamDamage: number;
  /** Extra ("special") attacks sent on a Level-2 charge release with enough meter. */
  exCount: number;
  /** HP of the boss this character sends. */
  bossHp: number;
  /** Owner-facing tiers (1 weakest / slowest … 3 strongest / fastest). Display + AI hints. */
  powerTier: 1 | 2 | 3;
  speedTier: 1 | 2 | 3;
}

export interface CharacterDef {
  name: string;
  kind: CharKind;
  attackTheme: AttackTheme;
  /** Terrain background theme for this seat's field. */
  theme: TerrainTheme;
  /** Signature / shirt color (0xRRGGBB) — also the sender color of this player's attacks. */
  color: number;
  /** Accent: projectile core / trail / charge color. */
  accent: number;
  /** Hair color. */
  hair: number;
  /** Skin tone. */
  skin: number;
  stats: CharStats;
}

export const CHARACTERS: CharacterDef[] = [
  {
    // Danny Donkey — chubby blonde everyman; frisbees. The 2/2 baseline (= Load Ran).
    name: 'DANNY DONKEY',
    kind: 'danny',
    attackTheme: 'frisbee',
    theme: 'meadow',
    color: 0x3fb56b, // grass-green tee
    accent: 0xff7a3d, // orange frisbee
    hair: 0xffd24a, // blonde
    skin: 0xffe0c2,
    stats: {
      moveSpeed: 2.75, shotSpeed: 6.6, shotReload: 7,
      chargeLv1: 65, beamDamage: 2, exCount: 3, bossHp: 21,
      powerTier: 2, speedTier: 2,
    },
  },
  {
    // Heavy Tyleru — heavyset, balding, stubble; film reels / movie monsters. Slow & weak
    // offense (1/1) but a tanky high-HP boss — the defensive "heavy".
    name: 'HEAVY TYLERU',
    kind: 'tyleru',
    attackTheme: 'film',
    theme: 'cinema',
    color: 0x8a2f44, // dark burgundy tee
    accent: 0xe6cf63, // film amber
    hair: 0x3a2c1e, // dark, thinning
    skin: 0xf0d2b0,
    stats: {
      moveSpeed: 2.25, shotSpeed: 5.6, shotReload: 9,
      chargeLv1: 80, beamDamage: 1, exCount: 2, bossHp: 25,
      powerTier: 1, speedTier: 1,
    },
  },
  {
    // Senseitional Alex — tall, ripped, shades, shirtless; dumbbells / weights. Fast & strong
    // glass cannon (3/3): fast move, fast hard shots, 4 specials, but a lower-HP boss.
    name: 'SENSEITIONAL ALEX',
    kind: 'alex',
    attackTheme: 'weight',
    theme: 'sunny',
    color: 0x2a6cff, // blue shorts
    accent: 0xff5a5a, // red weight plate
    hair: 0x6a4628, // brown
    skin: 0xf0c290, // tan
    stats: {
      moveSpeed: 3.45, shotSpeed: 8.0, shotReload: 6,
      chargeLv1: 53, beamDamage: 3, exCount: 4, bossHp: 18,
      powerTier: 3, speedTier: 3,
    },
  },
];

/** Baseline stats (Danny / Load-Ran) used for seats with no character assigned (tests). */
export const BASELINE_STATS: CharStats = CHARACTERS[0]!.stats;
