import type { BalanceConfig } from '../config/balance';
import type { Controller } from '../input/controller';
import { createRng, type Rng } from '../sim/rng';
import type { IncomingAttack, PlayerInput, SimState, Zako } from '../sim/types';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface AiParams {
  /** Ticks between re-deciding the movement goal (reaction time). */
  decideEvery: number;
  /** Horizontal aim error in field units. */
  aimJitter: number;
  /** Probability per decision of committing to a charge beam when the field is busy. */
  beamAppetite: number;
  /** Bomb when an attack is within this distance and HP below this fraction. */
  bombPanicDist: number;
  bombHpFrac: number;
  /** How far ahead (ticks) threats are projected for dodging. */
  lookahead: number;
}

const PARAMS: Record<Difficulty, AiParams> = {
  easy: { decideEvery: 22, aimJitter: 14, beamAppetite: 0.1, bombPanicDist: 18, bombHpFrac: 0.2, lookahead: 36 },
  normal: { decideEvery: 9, aimJitter: 6, beamAppetite: 0.2, bombPanicDist: 28, bombHpFrac: 0.3, lookahead: 64 },
  hard: { decideEvery: 6, aimJitter: 3, beamAppetite: 0.35, bombPanicDist: 34, bombHpFrac: 0.45, lookahead: 80 },
};

/**
 * AI seat. Deterministic under one invariant: getInput is called EXACTLY ONCE per sim
 * tick per seat (the game loop and headless tests both do this). Decisions re-evaluate
 * on a fixed tick cadence and all randomness comes from the seeded RNG, so a given
 * (seed, sim history) always reproduces the same inputs — verified by tests/match.test.ts.
 * Strategy mirrors how the original's story-mode opponents feel: weave between
 * threats near the bottom, park under zako clusters to farm chains, shoot down
 * incoming attacks when they're lined up, charge-beam when the field gets busy.
 */
export class AiController implements Controller {
  private rng: Rng;
  private p: AiParams;
  private goalX = 80;
  private goalY = 190;
  private holdTicks = 0;
  private charging = false;
  private chargeGoal = 0;
  private releaseFrames = 0;

  constructor(private cfg: BalanceConfig, difficulty: Difficulty, seed: number) {
    this.p = PARAMS[difficulty];
    this.rng = createRng(seed);
    this.goalX = cfg.field.width / 2;
    this.goalY = cfg.field.height - 34;
  }

  getInput(state: SimState, seat: number): PlayerInput {
    const me = state.players[seat];
    if (!me || !me.alive || state.phase === 'over') {
      return { moveX: 0, moveY: 0, fire: false, bomb: false, targetToggle: false };
    }

    const cfg = this.cfg;
    const threats = this.collectThreats(me.incoming, me.zako, me.x, me.y);

    // --- Re-decide goal periodically (reaction time) ---
    if (state.tick % this.p.decideEvery === 0) {
      const dangerX = this.dangerAtColumns(me.incoming, me.zako, me.y);
      const reflectTarget = this.bestReflectTarget(me.incoming);
      const cluster = this.bestCluster(me.zako);

      if (me.death && dist(me.death.x, me.death.y, me.x, me.y) < 80) {
        // Circle Death (tangential to its pursuit) while drifting toward centre so we
        // never get pinned to a wall — every character can out-circle him (§7).
        const dx = me.x - me.death.x;
        const dy = me.y - me.death.y;
        this.goalX = me.x + -dy * 0.7 + (cfg.field.width / 2 - me.x) * 0.4;
        this.goalY = me.y + dx * 0.7 + (cfg.field.height * 0.55 - me.y) * 0.4;
      } else if (threats.imminent) {
        // Flee to the safest column
        this.goalX = dangerX.safestX;
        this.goalY = cfg.field.height - 30;
      } else if (reflectTarget) {
        // Line up under an incoming attack to reflect it
        this.goalX = reflectTarget.x + this.jitter();
        this.goalY = cfg.field.height - 36;
      } else if (me.orbs.length > 0) {
        // Chase the fever orb — sit just below it and fire so a chain detonates it
        const o = me.orbs[0]!;
        this.goalX = o.x + this.jitter();
        this.goalY = Math.min(cfg.field.height - 30, o.y + 22);
      } else if (cluster) {
        this.goalX = cluster.x + this.jitter();
        this.goalY = cfg.field.height - 40;
      } else {
        this.goalX = cfg.field.width / 2 + this.jitter() * 2;
        this.goalY = cfg.field.height - 34;
      }

      // Charge intent: spend banked meter on specials (Lv2) or a boss (MAX); otherwise an
      // occasional plain beam when the field is busy. Don't charge while circling Death.
      const busy = me.zako.length >= 6 || me.incoming.length >= 3;
      const safeToCharge = !(me.death && dist(me.death.x, me.death.y, me.x, me.y) < 90);
      if (!this.charging && safeToCharge) {
        if (me.chargeMeter >= cfg.charge.maxThreshold && this.rng.next() < 0.6) {
          this.charging = true; this.holdTicks = 0; this.chargeGoal = me.chargeMax;
        } else if (me.chargeMeter >= cfg.charge.lv2Threshold && this.rng.next() < 0.5) {
          this.charging = true; this.holdTicks = 0; this.chargeGoal = me.chargeLv2;
        } else if (busy && this.rng.next() < this.p.beamAppetite) {
          this.charging = true; this.holdTicks = 0; this.chargeGoal = me.chargeLv1 + 5;
        }
      }
    }

    // --- Fire / charge management ---
    let fire: boolean;
    if (this.charging) {
      this.holdTicks++;
      fire = true;
      if (this.holdTicks >= this.chargeGoal + 4) {
        fire = false; // release at the intended level (Lv1 beam / Lv2 specials / MAX boss)
        this.charging = false;
        this.releaseFrames = 2;
      }
    } else if (this.releaseFrames > 0) {
      this.releaseFrames--;
      fire = false;
    } else {
      // Hold-and-release cycling: autofire without ever reaching charge level 1
      fire = state.tick % cfg.shot.chargeTicksLv1 !== cfg.shot.chargeTicksLv1 - 2;
    }

    // --- Bomb panic ---
    let bomb = false;
    if (me.bombs > 0 && me.iframes <= 0) {
      if (me.death && dist(me.death.x, me.death.y, me.x, me.y) < this.p.bombPanicDist * 0.7) {
        bomb = true; // a bomb one-shots Death — escape a closing reaper
      } else if (me.hp <= cfg.player.maxHp * this.p.bombHpFrac) {
        const close = me.incoming.some(
          (a) => a.tier !== 'boss' && dist(a.x, a.y, me.x, me.y) < this.p.bombPanicDist,
        );
        if (close) bomb = true;
      }
    }

    // --- Movement: a per-tick emergency sidestep overrides the goal when something is
    // about to hit (the slow decideEvery cadence alone gets the AI killed too fast). ---
    const dodge = this.emergencyDodge(me);
    let moveX: -1 | 0 | 1;
    let moveY: -1 | 0 | 1;
    if (dodge) {
      moveX = dodge.x;
      moveY = dodge.y;
    } else {
      const dx = this.goalX - me.x;
      const dy = this.goalY - me.y;
      moveX = dx > 1.5 ? 1 : dx < -1.5 ? -1 : 0;
      moveY = dy > 1.5 ? 1 : dy < -1.5 ? -1 : 0;
    }
    return { moveX, moveY, fire, bomb, targetToggle: false };
  }

  /** Reactive sidestep run EVERY tick: flee Death, then the nearest closing threat. */
  private emergencyDodge(me: SimState['players'][number]): { x: -1 | 0 | 1; y: -1 | 0 | 1 } | null {
    const W = this.cfg.field.width;
    const H = this.cfg.field.height;
    const fleeX = (fromX: number): -1 | 0 | 1 => {
      if (me.x < 12) return 1;
      if (me.x > W - 12) return -1;
      return me.x <= fromX ? -1 : 1;
    };
    // Death is an instant KO — give it the widest berth.
    if (me.death && dist(me.death.x, me.death.y, me.x, me.y) < 26) {
      const ay = me.death.y < me.y ? 1 : -1; // move away vertically from the reaper
      return { x: fleeX(me.death.x), y: me.y > 12 && me.y < H - 12 ? (ay as -1 | 0 | 1) : 0 };
    }
    let best: { x: number } | null = null;
    let bestT = 999;
    const consider = (x: number, y: number, vy: number, r: number): void => {
      const t = vy > 0 ? (me.y - y) / vy : 999;
      if (t > 0 && t < 24 && Math.abs(x - me.x) < r) {
        if (t < bestT) { bestT = t; best = { x }; }
      }
    };
    for (const a of me.incoming) consider(a.x, a.y, a.speed || 0.6, a.tier === 'boss' ? 22 : 14);
    for (const z of me.zako) consider(z.x, z.y, z.vy || 0.5, 12);
    if (!best) return null;
    return { x: fleeX((best as { x: number }).x), y: me.y < H - 10 ? 1 : 0 };
  }

  private jitter(): number {
    return this.rng.range(-this.p.aimJitter, this.p.aimJitter);
  }

  private collectThreats(incoming: IncomingAttack[], zako: Zako[], px: number, py: number) {
    let imminent = false;
    for (const a of incoming) {
      const ticksToMe = a.speed > 0 ? (py - a.y) / a.speed : 999;
      if (ticksToMe > 0 && ticksToMe < this.p.lookahead && Math.abs(a.x - px) < 26) imminent = true;
    }
    for (const z of zako) {
      const ticksToMe = z.vy > 0 ? (py - z.y) / z.vy : 999;
      if (ticksToMe > 0 && ticksToMe < this.p.lookahead && Math.abs(z.x - px) < 16) imminent = true;
    }
    return { imminent };
  }

  /** Crude danger histogram over field columns; returns the safest column center. */
  private dangerAtColumns(incoming: IncomingAttack[], zako: Zako[], py: number) {
    const cols = 8;
    const w = this.cfg.field.width;
    const danger = new Array<number>(cols).fill(0);
    const colOf = (x: number) => Math.max(0, Math.min(cols - 1, Math.floor((x / w) * cols)));
    for (const a of incoming) {
      const weight = a.tier === 'boss' ? 3 : a.tier === 'extra' ? 2 : 1;
      const c = colOf(a.x);
      danger[c]! += weight * (a.y > py - 90 ? 2 : 1);
      // sway makes neighbours risky too
      if (c > 0) danger[c - 1]! += weight * 0.5;
      if (c < cols - 1) danger[c + 1]! += weight * 0.5;
    }
    for (const z of zako) {
      if (z.y > py - 110) danger[colOf(z.x)]! += 1;
    }
    let safest = 0;
    for (let i = 0; i < cols; i++) {
      if (danger[i]! < danger[safest]!) safest = i;
    }
    return { safestX: ((safest + 0.5) / cols) * w };
  }

  /** Nearest reflectable attack that is high enough to intercept safely. */
  private bestReflectTarget(incoming: IncomingAttack[]): IncomingAttack | null {
    let best: IncomingAttack | null = null;
    for (const a of incoming) {
      if (a.tier !== 'normal' && a.tier !== 'reverse') continue;
      if (a.y > this.cfg.field.height * 0.62) continue; // too low — dodge instead
      if (!best || a.y > best.y) best = a; // prefer the lowest (most urgent) safe one
    }
    return best;
  }

  /** Densest zako neighbourhood — the chain farm. */
  private bestCluster(zako: Zako[]): { x: number; score: number } | null {
    if (zako.length === 0) return null;
    let best: { x: number; score: number } | null = null;
    for (const z of zako) {
      let score = 0;
      for (const other of zako) {
        if (Math.abs(other.x - z.x) < this.cfg.chain.explosionRadius * 1.4 &&
            Math.abs(other.y - z.y) < this.cfg.chain.explosionRadius * 1.4) score++;
      }
      if (z.y < 30) score *= 0.5; // too high to farm comfortably yet
      if (!best || score > best.score) best = { x: z.x, score };
    }
    return best;
  }
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
