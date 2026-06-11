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

/**
 * Ticks for an n-link cascade to ripple out and its last explosion to expire.
 * Call with the ACTUAL cluster size — overshooting races the attack travel timer
 * (sent attacks would arrive and drain s.transit before assertions run).
 */
function settleTicks(n: number): number {
  return cfg.chain.propagationDelayTicks * (n - 1) + cfg.chain.explosionTicks + 15;
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
    run(s, cfg, settleTicks(cfg.chain.minChainToAttack));
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
    run(s, cfg, settleTicks(cfg.chain.minChainToAttack));
    expect(s.transit.length).toBe(0);
  });

  it('round-robin mode alternates targets between chains', () => {
    const c: BalanceConfig = { ...cfg, routing: { ...cfg.routing, normalMode: 'round-robin' } };
    const s = createSim(c, 7);
    s.waveTimer = 100000;
    plantCluster(s, 0, c.chain.minChainToAttack, 40, 100);
    shootAt(s, 0, 40, 100);
    run(s, c, settleTicks(c.chain.minChainToAttack), inputs());
    const firstTargets = new Set(s.transit.map((t) => t.target));
    s.transit = [];
    plantCluster(s, 0, c.chain.minChainToAttack, 40, 100);
    shootAt(s, 0, 40, 100);
    run(s, c, settleTicks(c.chain.minChainToAttack), inputs());
    const secondTargets = new Set(s.transit.map((t) => t.target));
    expect(firstTargets.size).toBe(1);
    expect(secondTargets.size).toBe(1);
    expect([...firstTargets][0]).not.toBe([...secondTargets][0]);
  });
});

/** Place a 1-HP incoming attack so a single test shot destroys it. */
function placeIncoming(
  s: SimState, atSeat: number, from: number, tier: 'normal' | 'reverse',
  x = 80, y = 100, reflectCount = tier === 'reverse' ? 1 : 0,
) {
  s.players[atSeat]!.incoming.push({
    id: s.nextId++,
    tier,
    originalSender: from,
    lastSender: from,
    x, y, anchorX: x, age: 0,
    speed: 0, // hold still so the test shot can hit it
    reflectCount,
    hp: 1,
  });
}

describe('reflection ladder', () => {
  it('shooting down a normal attack reflects it as a reverse back to the ORIGINAL SENDER', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    placeIncoming(s, 1, 0, 'normal'); // player 0 attacked player 1
    shootAt(s, 1, 80, 100);
    run(s, cfg, 2);
    const reflected = s.transit.find((t) => t.tier === 'reverse');
    expect(reflected).toBeDefined();
    expect(reflected!.target).toBe(0);          // returns to original sender — owner rule
    expect(reflected!.originalSender).toBe(0);
    expect(reflected!.lastSender).toBe(1);
    expect(reflected!.speed).toBeCloseTo(cfg.attacks.baseSpeed * cfg.attacks.reverseSpeedScale);
  });

  it('a small fireball takes attackHp shots to bring down', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    placeIncoming(s, 1, 0, 'normal');
    s.players[1]!.incoming[0]!.hp = cfg.attacks.attackHp; // full durability
    shootAt(s, 1, 80, 100);
    run(s, cfg, 1);
    expect(s.players[1]!.incoming.length).toBe(1); // survived the first shot
    shootAt(s, 1, 80, 100);
    run(s, cfg, 1);
    expect(s.players[1]!.incoming.length).toBe(0);
  });

  it('destroying a reverse individually converts it to an Extra at BOTH opponents (ladder ends)', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    placeIncoming(s, 0, 1, 'reverse'); // a reverse came back to player 0
    shootAt(s, 0, 80, 100);
    run(s, cfg, 2);
    const extras = s.transit.filter((t) => t.tier === 'extra');
    expect(extras.map((t) => t.target).sort()).toEqual([1, 2]); // extrasToAll — owner rule
    expect(s.transit.filter((t) => t.tier === 'reverse').length).toBe(0); // no re-reverse ping-pong
  });

  it('extras are indestructible — shots are absorbed', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    s.players[1]!.incoming.push({
      id: s.nextId++, tier: 'extra', originalSender: 0, lastSender: 0,
      x: 80, y: 100, anchorX: 80, age: 0, speed: 0, reflectCount: 0, hp: cfg.attacks.extraHp,
    });
    shootAt(s, 1, 80, 100);
    run(s, cfg, 1);
    expect(s.players[1]!.incoming.length).toBe(1);       // still there
    expect(s.players[1]!.shots.length).toBe(0);           // shot absorbed
    expect(s.transit.length).toBe(0);
  });

  it('3 reverses caught by explosions in ONE combo summon a BOSS instead of extras', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    // Three reverses parked where one zako explosion will catch them all
    for (const x of [74, 80, 86]) placeIncoming(s, 0, 1, 'reverse', x, 100);
    s.players[0]!.zako.push({ id: s.nextId++, x: 80, y: 100, vx: 0, vy: 0, swayPhase: 0, swayAmp: 0 });
    shootAt(s, 0, 80, 100);
    run(s, cfg, settleTicks(2));
    const bosses = s.transit.filter((t) => t.tier === 'boss');
    expect(bosses.map((t) => t.target).sort()).toEqual([1, 2]); // bossToAll — owner rule
    expect(s.transit.filter((t) => t.tier === 'extra').length).toBe(0); // boss REPLACES the extras
  });

  it('fewer than 3 explosion-caught reverses send their individual extras', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    for (const x of [74, 86]) placeIncoming(s, 0, 1, 'reverse', x, 100);
    s.players[0]!.zako.push({ id: s.nextId++, x: 80, y: 100, vx: 0, vy: 0, swayPhase: 0, swayAmp: 0 });
    shootAt(s, 0, 80, 100);
    run(s, cfg, settleTicks(2));
    expect(s.transit.filter((t) => t.tier === 'boss').length).toBe(0);
    // 2 caught reverses × 2 opponents = 4 extras
    expect(s.transit.filter((t) => t.tier === 'extra').length).toBe(4);
  });

  it('reflection toward an eliminated seat is dropped (default config)', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    s.players[0]!.hp = 0;
    run(s, cfg, 1); // processes elimination
    expect(s.players[0]!.alive).toBe(false);
    placeIncoming(s, 1, 0, 'normal');
    shootAt(s, 1, 80, 100);
    run(s, cfg, 2);
    expect(s.transit.length).toBe(0);
  });
});

describe('life economy', () => {
  it('zako collision costs 1 heart and heals BOTH others a fixed split', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    for (const p of s.players) p.hp = 3;
    const p0 = s.players[0]!;
    p0.zako.push({ id: s.nextId++, x: p0.x, y: p0.y, vx: 0, vy: 0, swayPhase: 0, swayAmp: 0 });
    run(s, cfg, 1);
    expect(p0.hp).toBe(3 - cfg.damage.zakoCollision);
    const expectedHeal = cfg.lifeSteal.onZakoHit / 2; // 'divided' between the two others
    expect(s.players[1]!.hp).toBeCloseTo(3 + expectedHeal);
    expect(s.players[2]!.hp).toBeCloseTo(3 + expectedHeal);
  });

  it("'each' split heals both others the full fixed amount", () => {
    const c: BalanceConfig = { ...cfg, lifeSteal: { ...cfg.lifeSteal, split: 'each' } };
    const s = createSim(c, 7);
    s.waveTimer = 100000;
    for (const p of s.players) p.hp = 3;
    const p0 = s.players[0]!;
    p0.zako.push({ id: s.nextId++, x: p0.x, y: p0.y, vx: 0, vy: 0, swayPhase: 0, swayAmp: 0 });
    run(s, c, 1);
    expect(s.players[1]!.hp).toBeCloseTo(3 + cfg.lifeSteal.onZakoHit);
    expect(s.players[2]!.hp).toBeCloseTo(3 + cfg.lifeSteal.onZakoHit);
  });

  it('zako collisions can NEVER kill — hp floors at zakoFloorHp', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    const p0 = s.players[0]!;
    p0.hp = 1;
    p0.zako.push({ id: s.nextId++, x: p0.x, y: p0.y, vx: 0, vy: 0, swayPhase: 0, swayAmp: 0 });
    run(s, cfg, 1);
    expect(p0.hp).toBe(cfg.damage.zakoFloorHp);
    expect(p0.alive).toBe(true);
  });

  it('an attack hit costs 3 hearts and heals the ATTACKER 1 heart', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    const p1 = s.players[1]!;
    s.players[0]!.hp = 3;
    p1.incoming.push({
      id: s.nextId++, tier: 'normal', originalSender: 0, lastSender: 0,
      x: p1.x, y: p1.y, anchorX: p1.x, age: 0, speed: 0, reflectCount: 0, hp: 1,
    });
    run(s, cfg, 1);
    expect(p1.hp).toBe(cfg.player.maxHp - cfg.damage.attackHit);
    expect(s.players[0]!.hp).toBe(3 + cfg.lifeSteal.onAttackHit);
    expect(p1.lastAttacker).toBe(0);
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
    s.players[1]!.hp = 4;
    s.players[0]!.hp = 2;
    s.players[2]!.hp = 3;
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
    run(s, cfg, settleTicks(cfg.chain.minChainToAttack));
    expect(s.players[0]!.feverTicks).toBeGreaterThan(0);
    expect(s.players[0]!.feverMeter).toBe(0);
  });

  it('fever chains send hits-1 fireballs (vs floor((hits-2)/2) normally)', () => {
    // Same 4-chain, with and without fever: 4 hits → 3 fireballs in fever, 1 outside it
    const fever = createSim(cfg, 7);
    fever.waveTimer = 100000;
    fever.players[0]!.feverTicks = cfg.fever.durationTicks;
    plantCluster(fever, 0, 4);
    shootAt(fever, 0, 80, 100);
    run(fever, cfg, settleTicks(4));
    const feverToP1 = fever.transit.filter((t) => t.target === 1 && t.tier === 'normal').length;
    expect(feverToP1).toBe(4 - cfg.chain.feverHitOffset);

    const normal = createSim(cfg, 7);
    normal.waveTimer = 100000;
    plantCluster(normal, 0, 4);
    shootAt(normal, 0, 80, 100);
    run(normal, cfg, settleTicks(4));
    expect(normal.transit.filter((t) => t.target === 1 && t.tier === 'normal').length).toBe(1);
  });
});

describe('bombs', () => {
  function bombSetup(c: BalanceConfig) {
    const s = createSim(c, 7);
    s.waveTimer = 100000;
    const p1 = s.players[1]!;
    p1.zako.push({ id: s.nextId++, x: 20, y: 40, vx: 0, vy: 0, swayPhase: 0, swayAmp: 0 });
    p1.incoming.push({
      id: s.nextId++,
      tier: 'normal',
      originalSender: 0,
      lastSender: 0,
      x: p1.x + 10, y: p1.y, anchorX: p1.x + 10, age: 0,
      speed: 0,
      reflectCount: 0,
      hp: 1,
    });
    return s;
  }

  it('default (faithful): bomb wipes zako across the field but does NOT clear attacks', () => {
    const s = bombSetup(cfg);
    run(s, cfg, 1, inputs([{}, { bomb: true }, {}]));
    expect(s.players[1]!.zako.length).toBe(0);          // full-field zako wipe
    expect(s.players[1]!.incoming.length).toBe(1);      // fireball survives — dodge via i-frames
    expect(s.players[1]!.iframes).toBeGreaterThan(0);
    expect(s.players[1]!.bombs).toBe(cfg.player.bombs - 1);
  });

  it('clearsAttacks knob: bombed attacks vanish; +reflectsAttacks they fly back', () => {
    const c1: BalanceConfig = { ...cfg, bomb: { ...cfg.bomb, clearsAttacks: true } };
    const s1 = bombSetup(c1);
    run(s1, c1, 1, inputs([{}, { bomb: true }, {}]));
    expect(s1.players[1]!.incoming.length).toBe(0);
    expect(s1.transit.length).toBe(0);

    const c2: BalanceConfig = { ...cfg, bomb: { ...cfg.bomb, clearsAttacks: true, reflectsAttacks: true } };
    const s2 = bombSetup(c2);
    run(s2, c2, 1, inputs([{}, { bomb: true }, {}]));
    expect(s2.players[1]!.incoming.length).toBe(0);
    const reflected = s2.transit.find((t) => t.tier === 'reverse');
    expect(reflected).toBeDefined();
    expect(reflected!.target).toBe(0);
  });
});

describe('extra attacks from simultaneous chains', () => {
  it('a charge beam splitting two clusters at once sends an Extra to both opponents', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    const p0 = s.players[0]!;
    // Two pairs at the same height: the beam (half-width 14 + zako radius 6 → ±20 around x=80)
    // kills the inner zako of each pair; explosions chain to the outer partners.
    for (const x of [62, 42, 98, 118]) {
      p0.zako.push({ id: s.nextId++, x, y: 100, vx: 0, vy: 0, swayPhase: 0, swayAmp: 0 });
    }
    p0.beams.push({ x: 80, y: 105, halfWidth: cfg.shot.chargeWidthLv1 });
    run(s, cfg, settleTicks(3));
    const extras = s.transit.filter((t) => t.tier === 'extra');
    expect(extras.map((t) => t.target).sort()).toEqual([1, 2]);
  });
});

describe('boss lifecycle', () => {
  function placeBoss(s: SimState, atSeat: number, from: number) {
    s.players[atSeat]!.incoming.push({
      id: s.nextId++,
      tier: 'boss',
      originalSender: from,
      lastSender: from,
      x: 80, y: cfg.attacks.bossHoverY, anchorX: 80,
      age: 1,
      speed: cfg.attacks.bossSpeed,
      reflectCount: 0,
      hp: cfg.attacks.bossHp,
    });
  }

  it('boss rain shots are themselves reflectable normals', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    placeBoss(s, 1, 0);
    s.players[1]!.incoming[0]!.age = cfg.attacks.bossRainIntervalTicks - 1; // rain due next tick
    run(s, cfg, 1);
    const rain = s.players[1]!.incoming.find((a) => a.tier === 'normal');
    expect(rain).toBeDefined();
    rain!.speed = 0; // pin it for the test shot
    rain!.hp = 1;    // one shot downs it in this test
    shootAt(s, 1, rain!.x, rain!.y);
    run(s, cfg, 2);
    expect(s.transit.some((t) => t.tier === 'reverse' && t.target === 0)).toBe(true);
  });

  it('shots wear the boss down using its full hitbox and it dies without reflecting', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    placeBoss(s, 1, 0);
    const boss = s.players[1]!.incoming[0]!;
    boss.hp = 1;
    // Hit at the hitbox edge — farther than attackRadius, within bossHitboxScale × attackRadius
    shootAt(s, 1, boss.x + cfg.attacks.attackRadius * 2, cfg.attacks.bossHoverY);
    run(s, cfg, 2);
    expect(s.players[1]!.incoming.length).toBe(0);
    expect(s.transit.length).toBe(0); // bosses never reflect
  });

  it('boss leaves on its own after bossDurationTicks', () => {
    const s = createSim(cfg, 7);
    s.waveTimer = 100000;
    placeBoss(s, 1, 0);
    s.players[1]!.incoming[0]!.age = cfg.attacks.bossDurationTicks - 2;
    run(s, cfg, 3);
    expect(s.players[1]!.incoming.filter((a) => a.tier === 'boss').length).toBe(0);
  });
});

describe('routing modes', () => {
  function chainAndCollect(c: BalanceConfig, s: SimState): Set<number> {
    plantCluster(s, 0, c.chain.minChainToAttack, 40, 100);
    shootAt(s, 0, 40, 100);
    run(s, c, settleTicks(c.chain.minChainToAttack), inputs());
    return new Set(s.transit.map((t) => t.target));
  }

  it("'retaliation' targets whoever actually HIT you last", () => {
    const c: BalanceConfig = { ...cfg, routing: { ...cfg.routing, normalMode: 'retaliation' } };
    const s = createSim(c, 7);
    s.waveTimer = 100000;
    const p0 = s.players[0]!;
    // Player 2's attack lands on player 0
    p0.incoming.push({
      id: s.nextId++,
      tier: 'normal',
      originalSender: 2,
      lastSender: 2,
      x: p0.x, y: p0.y, anchorX: p0.x, age: 0,
      speed: 0,
      reflectCount: 0,
      hp: cfg.attacks.attackHp,
    });
    run(s, c, 1);
    expect(p0.lastAttacker).toBe(2);
    expect(chainAndCollect(c, s)).toEqual(new Set([2]));
  });

  it("'leader' targets the healthiest opponent", () => {
    const c: BalanceConfig = { ...cfg, routing: { ...cfg.routing, normalMode: 'leader' } };
    const s = createSim(c, 7);
    s.waveTimer = 100000;
    s.players[1]!.hp = 2;
    s.players[2]!.hp = 4;
    expect(chainAndCollect(c, s)).toEqual(new Set([2]));
  });

  it("'manual' targets the selected seat and targetToggle cycles it", () => {
    const c: BalanceConfig = { ...cfg, routing: { ...cfg.routing, normalMode: 'manual' } };
    const s = createSim(c, 7);
    s.waveTimer = 100000;
    expect(s.players[0]!.manualTarget).toBe(1);
    run(s, c, 1, inputs([{ targetToggle: true }, {}, {}]));
    expect(s.players[0]!.manualTarget).toBe(2);
    expect(chainAndCollect(c, s)).toEqual(new Set([2]));
  });
});

describe('pressure valves', () => {
  it('incomingDensityScale 0 silences chain normals but reflections STILL return', () => {
    const c: BalanceConfig = { ...cfg, routing: { ...cfg.routing, incomingDensityScale: 0 } };
    const s = createSim(c, 7);
    s.waveTimer = 100000;
    plantCluster(s, 0, c.chain.minChainToAttack);
    shootAt(s, 0, 80, 100);
    run(s, c, settleTicks(c.chain.minChainToAttack));
    expect(s.transit.length).toBe(0); // chain normals fully muted
    // …but a reflection must always come back
    s.players[1]!.incoming.push({
      id: s.nextId++,
      tier: 'normal',
      originalSender: 0,
      lastSender: 0,
      x: 80, y: 100, anchorX: 80, age: 0,
      speed: 0,
      reflectCount: 0,
      hp: 1,
    });
    shootAt(s, 1, 80, 100);
    run(s, c, 2);
    expect(s.transit.filter((t) => t.tier === 'reverse').length).toBe(1);
  });

  it('incomingSpeedScale multiplies incoming attack descent', () => {
    const c: BalanceConfig = { ...cfg, routing: { ...cfg.routing, incomingSpeedScale: 2 } };
    const s = createSim(c, 7);
    s.waveTimer = 100000;
    s.players[1]!.incoming.push({
      id: s.nextId++,
      tier: 'normal',
      originalSender: 0,
      lastSender: 0,
      x: 80, y: 50, anchorX: 80, age: 0,
      speed: 1,
      reflectCount: 0,
      hp: cfg.attacks.attackHp,
    });
    run(s, c, 1);
    expect(s.players[1]!.incoming[0]!.y).toBeCloseTo(52); // 1 × scale 2
  });
});

describe('timeout variants', () => {
  it('most-hp exact tie is a draw', () => {
    const c: BalanceConfig = { ...cfg, match: { timerTicks: 10, onTimeout: 'most-hp' } };
    const s = createSim(c, 7);
    for (const p of s.players) p.hp = 4;
    run(s, c, 12);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(-1);
  });

  it('sudden-death clamps everyone to 1 HP, healing cannot undo it, next hit ends it', () => {
    const c: BalanceConfig = { ...cfg, match: { timerTicks: 10, onTimeout: 'sudden-death' } };
    const s = createSim(c, 7);
    s.waveTimer = 100000;
    run(s, c, 12);
    expect(s.phase).toBe('playing'); // sudden death continues the match…
    for (const p of s.players) expect(p.hp).toBe(1); // …at 1 HP
    // Zako collisions still can't kill — they floor at 0.5 — and the heals they
    // grant the others get clamped right back down to 1
    const p0 = s.players[0]!;
    p0.iframes = 0;
    p0.zako.push({ id: s.nextId++, x: p0.x, y: p0.y, vx: 0, vy: 0, swayPhase: 0, swayAmp: 0 });
    run(s, c, 2);
    expect(p0.alive).toBe(true);
    expect(p0.hp).toBe(cfg.damage.zakoFloorHp);
    expect(s.players[1]!.hp).toBe(1);    // heal clamped away
    expect(s.players[2]!.hp).toBe(1);
    // An ATTACK hit finishes a sudden-death player
    p0.iframes = 0;
    p0.incoming.push({
      id: s.nextId++, tier: 'normal', originalSender: 1, lastSender: 1,
      x: p0.x, y: p0.y, anchorX: p0.x, age: 0, speed: 0, reflectCount: 0, hp: 1,
    });
    run(s, c, 1);
    expect(p0.alive).toBe(false);
    expect(s.phase).toBe('playing');     // two survivors continue 1v1
    s.players[1]!.hp = 0;                // second kill ends the match
    run(s, c, 1);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(2);
  });
});

describe('eliminated seats', () => {
  it("redirect-other re-routes a reflection from a dead seat to a living one", () => {
    const c: BalanceConfig = {
      ...cfg,
      routing: { ...cfg.routing, reflectionToEliminated: 'redirect-other' },
    };
    const s = createSim(c, 7);
    s.waveTimer = 100000;
    s.players[2]!.hp = 0;
    run(s, c, 1);
    s.transit.push({
      tier: 'reverse', originalSender: 2, lastSender: 1, target: 2,
      reflectCount: 1, ticksLeft: 2, entryX: 80, speed: 1,
    });
    run(s, c, 3);
    // Redirected to a living player that isn't the reflector (seat 1) → seat 0
    expect(s.players[0]!.incoming.length).toBe(1);
  });

  it('elimination actually clears the field', () => {
    const s = createSim(cfg, 7);
    const p2 = s.players[2]!;
    p2.zako.push({ id: s.nextId++, x: 20, y: 20, vx: 0, vy: 0, swayPhase: 0, swayAmp: 0 });
    p2.shots.push({ x: 10, y: 10 });
    p2.hp = 0;
    run(s, cfg, 1);
    expect(p2.alive).toBe(false);
    expect(p2.zako.length).toBe(0);
    expect(p2.shots.length).toBe(0);
    expect(p2.incoming.length).toBe(0);
    expect(p2.explosions.length).toBe(0);
  });
});
