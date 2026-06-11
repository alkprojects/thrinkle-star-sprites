import { describe, expect, it } from 'vitest';
import { AiController } from '../src/ai/ai';
import { DEFAULT_BALANCE } from '../src/config/balance';
import { hashState } from '../src/sim/hash';
import { createSim, tickSim } from '../src/sim/sim';
import type { SimState } from '../src/sim/types';

const cfg = DEFAULT_BALANCE;

function playMatch(seed: number): { state: SimState; ticks: number } {
  const sim = createSim(cfg, seed);
  const ais = [
    new AiController(cfg, 'normal', seed ^ 0x1111),
    new AiController(cfg, 'hard', seed ^ 0x2222),
    new AiController(cfg, 'easy', seed ^ 0x3333),
  ];
  let ticks = 0;
  const maxTicks = cfg.match.timerTicks + 60;
  while (sim.phase === 'playing' && ticks < maxTicks) {
    const inputs = ais.map((ai, seat) => ai.getInput(sim, seat));
    tickSim(sim, inputs, cfg);
    ticks++;
  }
  return { state: sim, ticks };
}

describe('full AI match (headless integration)', () => {
  it('three AIs play a complete match to a winner without corruption', () => {
    const { state, ticks } = playMatch(424242);
    expect(state.phase).toBe('over');
    expect(ticks).toBeLessThanOrEqual(cfg.match.timerTicks + 60);
    // No NaN/corruption anywhere in player state
    for (const p of state.players) {
      expect(Number.isFinite(p.hp)).toBe(true);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.hp).toBeGreaterThanOrEqual(0);
    }
    // Winner is a valid seat or a draw
    expect(state.winner).toBeGreaterThanOrEqual(-1);
    expect(state.winner).toBeLessThanOrEqual(2);
  });

  it('whole matches are deterministic including AI decisions', () => {
    const a = playMatch(777);
    const b = playMatch(777);
    expect(a.ticks).toBe(b.ticks);
    expect(a.state.winner).toBe(b.state.winner);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });

  it('different seeds produce different matches', () => {
    const a = playMatch(1001);
    const b = playMatch(1002);
    expect(hashState(a.state)).not.toBe(hashState(b.state));
  });
});
