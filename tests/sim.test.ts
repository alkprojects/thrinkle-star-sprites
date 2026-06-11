import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, type BalanceConfig } from '../src/config/balance';
import { hashState } from '../src/sim/hash';
import { createSim, tickSim } from '../src/sim/sim';
import { NEUTRAL_INPUT, type PlayerInput, type SimState } from '../src/sim/types';

const cfg = DEFAULT_BALANCE;

function inputs(overrides: Partial<PlayerInput>[] = []): PlayerInput[] {
  return [0, 1, 2].map((i) => ({ ...NEUTRAL_INPUT, ...(overrides[i] ?? {}) }));
}

function run(s: SimState, c: BalanceConfig, ticks: number, ins: PlayerInput[] = inputs()): void {
  for (let i = 0; i < ticks; i++) tickSim(s, ins, c);
}

/** Place a zako chain cluster in a player's field. */
function plantCluster(s: SimState, seat: number, count: number, x = 80, y = 100): void {
  for (let i = 0; i < count; i++) {
    s.players[seat]!.zako.push({
      id: s.nextId++,
      x: x + i * (cfg.chain.explosionRadius * 0.7), // within chain range of neighbor
      y,
      vx: 0,
      vy: 0,
      swayPhase: 0,
      swayAmp: 0,
    });
  }
}

/** Shoot a specific spot by spawning a shot directly above it is fiddly; instead detonate by placing a shot at the zako. */
function shootAt(s: SimState, seat: number, x: number, y: number): void {
  s.players[seat]!.shots.push({ x, y: y + 2 });
}

/** Ticks for an n-link cascade to ripple out and its last explosion to expire. */
function settleTicks(n: number): number {
  return cfg.chain.propagationDelayTicks * n + cfg.chain.explosionTicks + 10;
}

describe('determinism', () => {
  it('same seed + same inputs ⇒ identical state hash', () => {
    const a = createSim(cfg, 1234);
    const b = createSim(cfg, 1234);
    const ins = inputs([{ moveX: 1, fire: true }, { moveY: -1 }, { fire: true }]);
    run(a, cfg, 600, ins);
    run(b, cfg, 600, ins);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('different seeds diverge', () => {
    const a = createSim(cfg, 1);
    const b = createSim(cfg, 2);
    run(a, cfg, 600);
    run(b, cfg, 600);
    expect(hashState(a)).not.toBe(hashState(b));
  });
});

describe('wave fairness', () => {
  it('all living fields receive identical wave formations', () => {
    const s = createSim(cfg, 99);
    run(s, cfg, 200);
    const [p0, p1, p2] = s.players;
    const sig = (p: typeof p0) => p!.zako.map((z) => `${z.x.toFixed(3)},${z.swayAmp}`).join('|');
    expect(sig(p0!)).toBe(sig(p1!));
    expect(sig(p1!)).toBe(sig(p2!));
  });
});

describe('chains and attack generation', () => {
  it('a chain of minChainToAttack sends normal attacks to BOTH opponents (mode: both)', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000; // suppress natural waves
    plantCluster(s, 0, cfg.chain.minChainToAttack);
    shootAt(s, 0, 80, 100);
    run(s, cfg, settleTicks(8));
    const toP1 = s.transit.filter((t) => t.target === 1 && t.tier === 'normal');
    const toP2 = s.transit.filter((t) => t.target === 2 && t.tier === 'normal');
    expect(toP1.length).toBeGreaterThan(0);
    expect(toP1.length).toBe(toP2.length);
    expect(toP1[0]!.originalSender).toBe(0);
  });

  it('chains below threshold send nothing', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    plantCluster(s, 0, cfg.chain.minChainToAttack - 1);
    shootAt(s, 0, 80, 100);
    run(s, cfg, settleTicks(8));
    expect(s.transit.length).toBe(0);
  });

  it('round-robin mode alternates targets between chains', () => {
    const c: BalanceConfig = { ...cfg, routing: { ...cfg.routing, normalMode: 'round-robin' } };
    const s = createSim(c, 7);
    s.waveTimer = 100000;
    plantCluster(s, 0, c.chain.minChainToAttack, 40, 100);
    shootAt(s, 0, 40, 100);
    run(s, c, settleTicks(8), inputs());
    const firstTargets = new Set(s.transit.map((t) => t.target));
    s.transit = [];
    plantCluster(s, 0, c.chain.minChainToAttack, 40, 100);
    shootAt(s, 0, 40, 100);
    run(s, c, settleTicks(8), inputs());
    const secondTargets = new Set(s.transit.map((t) => t.target));
    expect(firstTargets.size).toBe(1);
    expect(secondTargets.size).toBe(1);
    expect([...firstTargets][0]).not.toBe([...secondTargets][0]);
  });
});

describe('reflection ladder', () => {
  function incomingNormal(s: SimState, atSeat: number, from: number, x = 80, y = 100) {
    s.players[atSeat]!.incoming.push({
      id: s.nextId++,
      tier: 'normal',
      originalSender: from,
      lastSender: from,
      x, y, anchorX: x, age: 0,
      speed: 0, // hold still so the test shot can hit it
      reflectCount: 0,
      hp: cfg.attacks.attackHp,
    });
  }

  it('shooting down a normal attack reflects it as a reverse back to the ORIGINAL SENDER', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    incomingNormal(s, 1, 0); // player 0 attacked player 1
    shootAt(s, 1, 80, 100);
    run(s, cfg, 2);
    const reflected = s.transit.find((t) => t.tier === 'reverse');
    expect(reflected).toBeDefined();
    expect(reflected!.target).toBe(0);          // returns to original sender — owner rule
    expect(reflected!.originalSender).toBe(0);
    expect(reflected!.lastSender).toBe(1);
    expect(reflected!.reflectCount).toBe(1);
  });

  it('re-reflection ping-pongs back and gets faster', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    // Player 0 shoots down the reverse that came back from player 1
    s.players[0]!.incoming.push({
      id: s.nextId++,
      tier: 'reverse',
      originalSender: 0,
      lastSender: 1,
      x: 80, y: 100, anchorX: 80, age: 0,
      speed: 0,
      reflectCount: 1,
      hp: cfg.attacks.attackHp,
    });
    shootAt(s, 0, 80, 100);
    run(s, cfg, 2);
    const t = s.transit.find((a) => a.tier === 'reverse');
    expect(t).toBeDefined();
    expect(t!.target).toBe(1); // back to the reflector
    expect(t!.reflectCount).toBe(2);
    const speed1 = cfg.attacks.baseSpeed * cfg.attacks.reverseSpeedScale;
    expect(t!.speed).toBeGreaterThan(speed1);
  });

  it('reflection toward an eliminated seat is dropped (default config)', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    s.players[0]!.hp = 0;
    run(s, cfg, 1); // processes elimination
    expect(s.players[0]!.alive).toBe(false);
    incomingNormal(s, 1, 0);
    shootAt(s, 1, 80, 100);
    run(s, cfg, 2);
    expect(s.transit.length).toBe(0);
  });
});

describe('life economy', () => {
  it('zako collision damages you and heals BOTH others (divided split)', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    for (const p of s.players) p.hp = 40;
    const p0 = s.players[0]!;
    p0.zako.push({ id: s.nextId++, x: p0.x, y: p0.y, vx: 0, vy: 0, swayPhase: 0, swayAmp: 0 });
    run(s, cfg, 1);
    expect(p0.hp).toBe(40 - cfg.damage.zakoCollision);
    const expectedHeal = (cfg.damage.zakoCollision * cfg.lifeSteal.fraction) / 2;
    expect(s.players[1]!.hp).toBeCloseTo(40 + expectedHeal);
    expect(s.players[2]!.hp).toBeCloseTo(40 + expectedHeal);
  });

  it("'each' split heals both others the full fraction", () => {
    const c: BalanceConfig = { ...cfg, lifeSteal: { fraction: 0.5, split: 'each' } };
    const s = createSim(c, 7);
    s.waveTimer = 100000;
    for (const p of s.players) p.hp = 40;
    const p0 = s.players[0]!;
    p0.zako.push({ id: s.nextId++, x: p0.x, y: p0.y, vx: 0, vy: 0, swayPhase: 0, swayAmp: 0 });
    run(s, c, 1);
    const expectedHeal = cfg.damage.zakoCollision * 0.5;
    expect(s.players[1]!.hp).toBeCloseTo(40 + expectedHeal);
    expect(s.players[2]!.hp).toBeCloseTo(40 + expectedHeal);
  });

  it('iframes prevent damage', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    const p0 = s.players[0]!;
    p0.iframes = 50;
    p0.zako.push({ id: s.nextId++, x: p0.x, y: p0.y, vx: 0, vy: 0, swayPhase: 0, swayAmp: 0 });
    run(s, cfg, 1);
    expect(p0.hp).toBe(cfg.player.maxHp);
  });
});

describe('elimination and win', () => {
  it('eliminated player is cleared; survivors continue 1v1; last alive wins', () => {
    const s = createSim(cfg, 7);
    s.players[2]!.hp = 0;
    run(s, cfg, 1);
    expect(s.players[2]!.alive).toBe(false);
    expect(s.phase).toBe('playing'); // two still standing
    s.players[1]!.hp = 0;
    run(s, cfg, 1);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(0);
  });

  it('attacks in transit to an eliminated seat fizzle', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    s.transit.push({
      tier: 'normal', originalSender: 0, lastSender: 0, target: 2,
      reflectCount: 0, ticksLeft: 3, entryX: 80, speed: 1,
    });
    s.players[2]!.hp = 0;
    run(s, cfg, 5);
    expect(s.players[2]!.incoming.length).toBe(0);
  });

  it('timeout resolves to most HP', () => {
    const c: BalanceConfig = { ...cfg, match: { timerTicks: 10, onTimeout: 'most-hp' } };
    const s = createSim(c, 7);
    s.players[1]!.hp = 70;
    s.players[0]!.hp = 50;
    s.players[2]!.hp = 60;
    run(s, c, 12);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(1);
  });
});

describe('fever', () => {
  it('full meter triggers fever mode and resets the meter', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    s.players[0]!.feverMeter = 99;
    plantCluster(s, 0, cfg.chain.minChainToAttack);
    shootAt(s, 0, 80, 100);
    run(s, cfg, settleTicks(8));
    expect(s.players[0]!.feverTicks).toBeGreaterThan(0);
    expect(s.players[0]!.feverMeter).toBe(0);
  });

  it('big chain during fever sends a boss to both opponents', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    s.players[0]!.feverTicks = cfg.fever.durationTicks;
    plantCluster(s, 0, cfg.fever.bossChainSize);
    shootAt(s, 0, 80, 100);
    run(s, cfg, settleTicks(8));
    const bosses = s.transit.filter((t) => t.tier === 'boss');
    expect(bosses.map((b) => b.target).sort()).toEqual([1, 2]);
  });
});
