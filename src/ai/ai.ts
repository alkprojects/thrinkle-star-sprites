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
  easy: { decideEvery: 26, aimJitter: 14, beamAppetite: 0.1, bombPanicDist: 18, bombHpFrac: 0.2, lookahead: 30 },
  normal: { decideEvery: 14, aimJitter: 7, beamAppetite: 0.25, bombPanicDist: 26, bombHpFrac: 0.3, lookahead: 50 },
  hard: { decideEvery: 7, aimJitter: 3, beamAppetite: 0.4, bombPanicDist: 34, bombHpFrac: 0.45, lookahead: 70 },
};

/**
 * AI seat. Deterministic: seeded RNG, decisions are pure functions of sim state.
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

      if (threats.imminent) {
        // Flee to the safest column
        this.goalX = dangerX.safestX;
        this.goalY = cfg.field.height - 30;
      } else if (reflectTarget) {
        // Line up under an incoming attack to reflect it
        this.goalX = reflectTarget.x + this.jitter();
        this.goalY = cfg.field.height - 36;
      } else if (cluster) {
        this.goalX = cluster.x + this.jitter();
        this.goalY = cfg.field.height - 40;
      } else {
        this.goalX = cfg.field.width / 2 + this.jitter() * 2;
        this.goalY = cfg.field.height - 34;
      }

      // Commit to a charge beam when the field is busy and we feel like it
      const busy = me.zako.length >= 6 || me.incoming.length >= 3;
      if (!this.charging && busy && this.rng.next() < this.p.beamAppetite) {
        this.charging = true;
        this.holdTicks = 0;
      }
    }

    // --- Fire / charge management ---
    let fire: boolean;
    if (this.charging) {
      this.holdTicks++;
      fire = true;
      if (this.holdTicks >= cfg.shot.chargeTicksLv2 + 4) {
        fire = false; // release the beam
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
    if (me.bombs > 0 && me.iframes <= 0 && me.hp <= cfg.player.maxHp * this.p.bombHpFrac) {
      const close = me.incoming.some(
        (a) => a.tier !== 'boss' && dist(a.x, a.y, me.x, me.y) < this.p.bombPanicDist,
      );
      if (close) bomb = true;
    }

    // --- Steer toward the goal ---
    const dx = this.goalX - me.x;
    const dy = this.goalY - me.y;
    return {
      moveX: dx > 1.5 ? 1 : dx < -1.5 ? -1 : 0,
      moveY: dy > 1.5 ? 1 : dy < -1.5 ? -1 : 0,
      fire,
      bomb,
      targetToggle: false,
    };
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
