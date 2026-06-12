/**
 * Feel-fidelity tests: assert the sim reproduces the original's measured frame data
 * (docs/GAME_MECHANICS.md §8.2/§9.1, Load Ran baseline, 60 fps lag-free).
 *
 * These drive the REAL sim with held inputs and count ticks, so they catch any
 * regression in movement/shot/charge code, not just config drift.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '../src/config/balance';
import { createSim, tickSim } from '../src/sim/sim';
import type { PlayerInput } from '../src/sim/types';

const cfg = DEFAULT_BALANCE;

const IDLE: PlayerInput = { moveX: 0, moveY: 0, fire: false, bomb: false, targetToggle: false };

function inputs(seat0: Partial<PlayerInput>): PlayerInput[] {
  return [{ ...IDLE, ...seat0 }, IDLE, IDLE];
}

type Axis = -1 | 0 | 1;

/** Hold a direction until the player stops moving (reaches the wall). Returns ticks taken. */
function ticksToCross(moveX: Axis, moveY: Axis, settleFirst: { moveX: Axis; moveY: Axis }): number {
  const sim = createSim(cfg, 1234);
  const p = sim.players[0]!;
  // Park against the starting wall
  for (let i = 0; i < 200; i++) tickSim(sim, inputs(settleFirst), cfg);
  // Cross, counting ticks until clamped at the far wall
  let ticks = 0;
  for (; ticks < 300; ticks++) {
    const before = { x: p.x, y: p.y };
    tickSim(sim, inputs({ moveX, moveY }), cfg);
    if (p.x === before.x && p.y === before.y) break;
  }
  return ticks;
}

describe('feel: original frame data (Load Ran baseline)', () => {
  it('crosses the field horizontally in ~56 ticks (§8.2: 56f wall-to-wall)', () => {
    const ticks = ticksToCross(1, 0, { moveX: -1, moveY: 0 });
    expect(ticks).toBeGreaterThanOrEqual(54);
    expect(ticks).toBeLessThanOrEqual(58);
  });

  it('crosses the field vertically in ~80 ticks (§8.2: 80f wall-to-wall)', () => {
    const ticks = ticksToCross(0, 1, { moveX: 0, moveY: -1 });
    expect(ticks).toBeGreaterThanOrEqual(77);
    expect(ticks).toBeLessThanOrEqual(82);
  });

  it('diagonal movement is NOT normalized (§2.4: per-axis components independent)', () => {
    const sim = createSim(cfg, 1234);
    const p = sim.players[0]!;
    const x0 = p.x;
    const y0 = p.y;
    tickSim(sim, inputs({ moveX: 1, moveY: -1 }), cfg);
    expect(p.x - x0).toBeCloseTo(cfg.player.speed, 5);
    expect(y0 - p.y).toBeCloseTo(cfg.player.speed, 5);
  });

  it('shots would cross the full field height in ~34 ticks (§8.2: 34f shot travel)', () => {
    const sim = createSim(cfg, 1234);
    const p = sim.players[0]!;
    tickSim(sim, inputs({ fire: true }), cfg); // spawns a shot
    const shot = p.shots[0]!;
    const yA = shot.y;
    tickSim(sim, inputs({ fire: false }), cfg);
    const perTick = yA - shot.y;
    const fullHeightTicks = cfg.field.height / perTick;
    expect(fullHeightTicks).toBeGreaterThanOrEqual(33);
    expect(fullHeightTicks).toBeLessThanOrEqual(35);
  });

  it('charge level 1 needs ~65 ticks of hold (§8.2: Ran charge L1 = 65f)', () => {
    expect(cfg.shot.chargeTicksLv1).toBe(65);
    const sim = createSim(cfg, 1234);
    const p = sim.players[0]!;
    // Hold 60 ticks (just short), release: no beam
    for (let i = 0; i < 60; i++) tickSim(sim, inputs({ fire: true }), cfg);
    tickSim(sim, inputs({ fire: false }), cfg);
    expect(p.beams.length).toBe(0);
    // Hold past Lv1, release: Lv1 beam
    for (let i = 0; i < 70; i++) tickSim(sim, inputs({ fire: true }), cfg);
    tickSim(sim, inputs({ fire: false }), cfg);
    expect(p.beams.length).toBe(1);
    expect(p.beams[0]!.halfWidth).toBe(cfg.shot.chargeWidthLv1);
  });

  it('charge level 2 needs ~130 ticks of hold (§8.2: L2 = 2× L1)', () => {
    expect(cfg.shot.chargeTicksLv2).toBe(130);
    const sim = createSim(cfg, 1234);
    const p = sim.players[0]!;
    for (let i = 0; i < 135; i++) tickSim(sim, inputs({ fire: true }), cfg);
    tickSim(sim, inputs({ fire: false }), cfg);
    expect(p.beams.length).toBe(1);
    expect(p.beams[0]!.halfWidth).toBe(cfg.shot.chargeWidthLv2);
  });

  it('attack-hit invincibility lasts 58 ticks (§5.2: ~58f i-frames)', () => {
    expect(cfg.player.iframesTicks).toBe(58);
  });
});
