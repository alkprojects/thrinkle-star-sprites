import type { BalanceConfig } from '../config/balance';
import type { Rng } from './rng';
import type { Zako } from './types';

/**
 * Wave formations. One wave is generated per spawn from the shared wave RNG and the
 * SAME formation is instantiated in every living field — fairness rule from the original.
 */

export interface WaveSpec {
  /** Relative spawn entries: x in [0, width], y offsets above the top edge. */
  entries: { x: number; yOffset: number; vx: number; swayAmp: number; swayPhase: number; tier: number }[];
}

/**
 * Durability tier (1 red … 5 purple) for a zako, escalating over round time (§3.1: the
 * formation pool toughens as the round goes). Early rounds stay mostly 1–2 so chains form
 * easily; tougher tiers (which resist single shots and need big blasts) appear later.
 */
function rollTier(rng: Rng, elapsed: number): number {
  const r = rng.next();
  let tier = r < 0.32 ? 1 : r < 0.60 ? 2 : r < 0.82 ? 3 : r < 0.94 ? 4 : 5;
  // Soften the early game: pull tough zako down toward 1–2 for the first ~25s.
  if (elapsed < 25 && tier > 2 && rng.next() < 0.6) tier = 1 + rng.int(2);
  return tier;
}

export function generateWave(rng: Rng, cfg: BalanceConfig, elapsed = 0): WaveSpec {
  const w = cfg.field.width;
  const kind = rng.int(4);
  const entries: Omit<WaveSpec['entries'][number], 'tier'>[] = [];

  if (kind === 0) {
    // Horizontal line marching down
    const count = 4 + rng.int(3);
    const margin = 18;
    for (let i = 0; i < count; i++) {
      entries.push({
        x: margin + (i * (w - margin * 2)) / (count - 1),
        yOffset: 0,
        vx: 0,
        swayAmp: 0,
        swayPhase: 0,
      });
    }
  } else if (kind === 1) {
    // V formation
    const count = 5;
    const cx = rng.range(w * 0.3, w * 0.7);
    for (let i = 0; i < count; i++) {
      const k = i - (count - 1) / 2;
      entries.push({
        x: cx + k * 16,
        yOffset: -Math.abs(k) * 14,
        vx: 0,
        swayAmp: 0,
        swayPhase: 0,
      });
    }
  } else if (kind === 2) {
    // Column snaking down one side
    const count = 5 + rng.int(3);
    const x = rng.range(w * 0.2, w * 0.8);
    const phase = rng.range(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      entries.push({
        x,
        yOffset: -i * 16,
        vx: 0,
        swayAmp: 18,
        swayPhase: phase + i * 0.7,
      });
    }
  } else {
    // Diagonal sweep
    const count = 5;
    const leftToRight = rng.int(2) === 0;
    for (let i = 0; i < count; i++) {
      entries.push({
        x: leftToRight ? 12 + i * 4 : w - 12 - i * 4,
        yOffset: -i * 14,
        vx: (leftToRight ? 1 : -1) * 0.35,
        swayAmp: 0,
        swayPhase: 0,
      });
    }
  }

  // Assign a durability tier per zako last (deterministic from the shared wave RNG, so
  // every field gets the identical formation AND tiers — fairness rule).
  return { entries: entries.map((e) => ({ ...e, tier: rollTier(rng, elapsed) })) };
}

export function instantiateWave(
  spec: WaveSpec,
  cfg: BalanceConfig,
  nextId: () => number,
): Zako[] {
  return spec.entries.map((e) => ({
    id: nextId(),
    x: e.x,
    y: e.yOffset - 8, // start just above the visible field
    vx: e.vx,
    vy: cfg.waves.zakoSpeed,
    swayPhase: e.swayPhase,
    swayAmp: e.swayAmp,
    hp: e.tier,
    maxHp: e.tier,
  }));
}
