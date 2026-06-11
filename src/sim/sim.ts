import type { AttackTier, BalanceConfig } from '../config/balance';
import { createRng, rngFromState, type Rng } from './rng';
import type {
  ActiveChain, IncomingAttack, PlayerInput, PlayerSim, SimState,
} from './types';
import { generateWave, instantiateWave } from './waves';

export const SEATS = 3;

export function createSim(cfg: BalanceConfig, seed: number): SimState {
  const rng = createRng(seed);
  const waveRng = createRng(seed ^ 0x5f3759df);
  const players: PlayerSim[] = [];
  for (let seat = 0; seat < SEATS; seat++) {
    players.push({
      seat,
      alive: true,
      x: cfg.field.width / 2,
      y: cfg.field.height - 28,
      hp: cfg.player.maxHp,
      iframes: 0,
      bombs: cfg.player.bombs,
      shotCooldown: 0,
      chargeTicks: -1,
      prevFire: false,
      prevBomb: false,
      prevTargetToggle: false,
      feverMeter: 0,
      feverTicks: 0,
      shots: [],
      beams: [],
      zako: [],
      explosions: [],
      incoming: [],
      chains: [],
      roundRobinNext: (seat + 1) % SEATS,
      lastAttacker: -1,
      manualTarget: (seat + 1) % SEATS,
      stats: { chains: 0, biggestChain: 0, attacksSent: 0, reflections: 0, damageDealt: 0 },
    });
  }
  return {
    tick: 0,
    phase: 'playing',
    winner: -1,
    rngState: rng.state(),
    waveRngState: waveRng.state(),
    waveTimer: 90, // first wave arrives quickly
    players,
    transit: [],
    nextId: 1,
    nextChainId: 1,
    events: [],
  };
}

export function livingOpponents(s: SimState, seat: number): PlayerSim[] {
  return s.players.filter((p) => p.alive && p.seat !== seat);
}

/** Resolve which seats a player's chain-generated Normal Attacks go to. */
function targetsForNormal(s: SimState, p: PlayerSim, cfg: BalanceConfig, rng: Rng): number[] {
  const others = livingOpponents(s, p.seat);
  if (others.length === 0) return [];
  const mode = cfg.routing.normalMode;
  if (mode === 'both') return others.map((o) => o.seat);
  if (mode === 'round-robin') {
    let t = p.roundRobinNext;
    for (let i = 0; i < SEATS; i++) {
      const cand = s.players[t % SEATS]!;
      if (cand.alive && cand.seat !== p.seat) break;
      t++;
    }
    const seat = t % SEATS;
    p.roundRobinNext = (seat + 1) % SEATS;
    return [seat];
  }
  if (mode === 'retaliation') {
    const att = s.players[p.lastAttacker];
    if (att && att.alive && att.seat !== p.seat) return [att.seat];
    return [others[rng.int(others.length)]!.seat];
  }
  if (mode === 'manual') {
    const t = s.players[p.manualTarget];
    if (t && t.alive && t.seat !== p.seat) return [t.seat];
    return [others[0]!.seat];
  }
  // 'leader' — healthiest living opponent, lower seat breaks ties
  let best = others[0]!;
  for (const o of others) if (o.hp > best.hp) best = o;
  return [best.seat];
}

function queueAttack(
  s: SimState, cfg: BalanceConfig, rng: Rng,
  tier: AttackTier, originalSender: number, lastSender: number, target: number,
  reflectCount: number,
): void {
  if (rng.next() >= cfg.routing.incomingDensityScale) return; // global pressure valve
  const speedBase =
    tier === 'extra' ? cfg.attacks.extraSpeed :
    tier === 'boss' ? cfg.attacks.bossSpeed :
    cfg.attacks.baseSpeed;
  const capped = Math.min(reflectCount, cfg.attacks.maxReflections);
  const speed = speedBase * Math.pow(cfg.attacks.reverseSpeedScale, capped);
  s.transit.push({
    tier,
    originalSender,
    lastSender,
    target,
    reflectCount,
    ticksLeft: cfg.attacks.travelTicks,
    entryX: rng.range(cfg.field.width * 0.12, cfg.field.width * 0.88),
    speed,
  });
  s.players[lastSender]!.stats.attacksSent++;
  s.events.push({ type: 'attack-sent', tier, from: lastSender, to: target });
}

/**
 * Reflect an incoming normal/reverse attack: it returns to whoever last sent it
 * (the original sender on first reflection — owner rule; ping-pongs thereafter).
 */
function reflectAttack(s: SimState, cfg: BalanceConfig, rng: Rng, reflector: PlayerSim, a: IncomingAttack): void {
  reflector.stats.reflections++;
  s.events.push({ type: 'reflect', seat: reflector.seat });
  let target = a.lastSender;
  const targetP = s.players[target];
  if (!targetP || !targetP.alive) {
    if (cfg.routing.reflectionToEliminated === 'drop') return;
    const others = livingOpponents(s, reflector.seat);
    if (others.length === 0) return;
    target = others[rng.int(others.length)]!.seat;
  }
  queueAttack(s, cfg, rng, 'reverse', a.originalSender, reflector.seat, target, a.reflectCount + 1);
}

function damagePlayer(s: SimState, cfg: BalanceConfig, victim: PlayerSim, amount: number, attacker: number): void {
  if (victim.iframes > 0 || !victim.alive) return;
  victim.hp -= amount;
  victim.iframes = cfg.player.iframesTicks;
  if (attacker >= 0 && attacker !== victim.seat) {
    victim.lastAttacker = attacker;
    s.players[attacker]!.stats.damageDealt += amount;
  }
}

/** Self-inflicted damage (zako collision): both other players recover a share — owner rule. */
function selfDamageWithLifeSteal(s: SimState, cfg: BalanceConfig, victim: PlayerSim, amount: number): void {
  if (victim.iframes > 0 || !victim.alive) return;
  victim.hp -= amount;
  victim.iframes = cfg.player.iframesTicks;
  const others = livingOpponents(s, victim.seat);
  if (others.length === 0) return;
  const pool = amount * cfg.lifeSteal.fraction;
  const share = cfg.lifeSteal.split === 'divided' ? pool / others.length : pool;
  for (const o of others) o.hp = Math.min(cfg.player.maxHp, o.hp + share);
}

function getChain(p: PlayerSim, s: SimState, chainId?: number): ActiveChain {
  if (chainId !== undefined) {
    const existing = p.chains.find((c) => c.id === chainId);
    if (existing) return existing;
  }
  const chain: ActiveChain = { id: chainId ?? s.nextChainId++, size: 0, reflectedAttacks: 0 };
  p.chains.push(chain);
  return chain;
}

function explodeZako(p: PlayerSim, s: SimState, cfg: BalanceConfig, zakoIdx: number, chainId?: number): void {
  const z = p.zako[zakoIdx]!;
  const chain = getChain(p, s, chainId);
  chain.size++;
  p.explosions.push({ x: z.x, y: z.y, ticksLeft: cfg.chain.explosionTicks, chainId: chain.id });
  p.zako.splice(zakoIdx, 1);
  s.events.push({ type: 'zako-killed', seat: p.seat });
}

function circleHit(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

export function tickSim(s: SimState, inputs: PlayerInput[], cfg: BalanceConfig): void {
  if (s.phase === 'over') return;
  s.events = [];
  const rng = rngFromState(s.rngState);
  const waveRng = rngFromState(s.waveRngState);
  s.tick++;

  // --- Wave spawning: identical formation in every living field (fairness rule) ---
  s.waveTimer--;
  if (s.waveTimer <= 0) {
    const elapsed = s.tick / 60;
    const interval = Math.max(
      cfg.waves.intervalMinTicks,
      cfg.waves.intervalTicks - elapsed * cfg.waves.rampPerSecond,
    );
    s.waveTimer = Math.round(interval);
    const spec = generateWave(waveRng, cfg);
    for (const p of s.players) {
      if (!p.alive) continue;
      p.zako.push(...instantiateWave(spec, cfg, () => s.nextId++));
    }
  }

  // --- Per-player update ---
  for (const p of s.players) {
    if (!p.alive) continue;
    const input = inputs[p.seat] ?? { moveX: 0, moveY: 0, fire: false, bomb: false, targetToggle: false };

    // Movement
    p.x = Math.max(cfg.player.radius, Math.min(cfg.field.width - cfg.player.radius, p.x + input.moveX * cfg.player.speed));
    p.y = Math.max(cfg.player.radius, Math.min(cfg.field.height - cfg.player.radius, p.y + input.moveY * cfg.player.speed));
    if (p.iframes > 0) p.iframes--;
    if (p.shotCooldown > 0) p.shotCooldown--;
    if (p.feverTicks > 0) p.feverTicks--;

    // Manual target toggle (edge)
    if (input.targetToggle && !p.prevTargetToggle) {
      for (let i = 1; i < SEATS; i++) {
        const cand = (p.manualTarget + i) % SEATS;
        if (cand !== p.seat && s.players[cand]!.alive) { p.manualTarget = cand; break; }
      }
    }
    p.prevTargetToggle = input.targetToggle;

    // Fire / charge: holding autofires and charges; release past Lv1 fires a beam
    if (input.fire) {
      if (p.chargeTicks < 0) p.chargeTicks = 0;
      else p.chargeTicks++;
      if (p.shotCooldown <= 0) {
        p.shots.push({ x: p.x, y: p.y - 4 });
        p.shotCooldown = cfg.shot.cooldownTicks;
      }
    } else {
      if (p.chargeTicks >= cfg.shot.chargeTicksLv1) {
        const lv2 = p.chargeTicks >= cfg.shot.chargeTicksLv2;
        p.beams.push({
          x: p.x,
          y: p.y - 6,
          halfWidth: lv2 ? cfg.shot.chargeWidthLv2 : cfg.shot.chargeWidthLv1,
        });
        s.events.push({ type: 'charge-fired', seat: p.seat, level: lv2 ? 2 : 1 });
      }
      p.chargeTicks = -1;
    }
    p.prevFire = input.fire;

    // Bomb (edge): clears zako and attacks around the player; no chain credit, no reflections (PROVISIONAL)
    if (input.bomb && !p.prevBomb && p.bombs > 0) {
      p.bombs--;
      p.iframes = Math.max(p.iframes, cfg.player.iframesTicks);
      s.events.push({ type: 'bomb', seat: p.seat });
      p.zako = p.zako.filter((z) => !circleHit(z.x, z.y, cfg.waves.zakoRadius, p.x, p.y, cfg.bomb.radius));
      p.incoming = p.incoming.filter((a) => {
        if (a.tier === 'boss') return true; // bombs don't clear bosses (PROVISIONAL)
        return !circleHit(a.x, a.y, cfg.attacks.attackRadius, p.x, p.y, cfg.bomb.radius);
      });
    }
    p.prevBomb = input.bomb;

    // Move shots and beams
    for (const shot of p.shots) shot.y -= cfg.shot.speed;
    p.shots = p.shots.filter((shot) => shot.y > -8);
    for (const beam of p.beams) beam.y -= cfg.shot.speed * 1.6;
    p.beams = p.beams.filter((b) => b.y > -12);

    // Move zako
    for (const z of p.zako) {
      z.y += z.vy;
      z.x += z.vx;
      if (z.swayAmp > 0) {
        z.swayPhase += 0.04;
        z.x += Math.sin(z.swayPhase) * 0.8;
      }
      if (z.x < 4 || z.x > cfg.field.width - 4) z.vx = -z.vx;
    }
    // Zako leaving the bottom just fly away (PROVISIONAL: no penalty)
    p.zako = p.zako.filter((z) => z.y < cfg.field.height + 10);

    // Shots vs zako → explosion starts a chain
    for (let si = p.shots.length - 1; si >= 0; si--) {
      const shot = p.shots[si]!;
      for (let zi = p.zako.length - 1; zi >= 0; zi--) {
        const z = p.zako[zi]!;
        if (circleHit(shot.x, shot.y, 2, z.x, z.y, cfg.waves.zakoRadius)) {
          p.shots.splice(si, 1);
          explodeZako(p, s, cfg, zi);
          break;
        }
      }
    }

    // Beams vs zako — every beam kill starts its OWN chain (simultaneity engine for Extras)
    for (const beam of p.beams) {
      for (let zi = p.zako.length - 1; zi >= 0; zi--) {
        const z = p.zako[zi]!;
        if (Math.abs(z.x - beam.x) <= beam.halfWidth + cfg.waves.zakoRadius && z.y >= beam.y - 10 && z.y <= beam.y + 14) {
          explodeZako(p, s, cfg, zi);
        }
      }
    }

    // Explosions propagate chains to touching zako — but only once old enough,
    // so cascades ripple outward over time instead of detonating in one tick.
    // Snapshot first: explosions born this tick must wait for the next one.
    const matured = p.explosions.filter(
      (ex) => cfg.chain.explosionTicks - ex.ticksLeft >= cfg.chain.propagationDelayTicks,
    );
    for (const ex of matured) {
      for (let zi = p.zako.length - 1; zi >= 0; zi--) {
        const z = p.zako[zi]!;
        if (circleHit(ex.x, ex.y, cfg.chain.explosionRadius, z.x, z.y, cfg.waves.zakoRadius)) {
          explodeZako(p, s, cfg, zi, ex.chainId);
        }
      }
    }

    // Shots vs incoming attacks
    for (let si = p.shots.length - 1; si >= 0; si--) {
      const shot = p.shots[si]!;
      for (let ai = p.incoming.length - 1; ai >= 0; ai--) {
        const a = p.incoming[ai]!;
        if (!circleHit(shot.x, shot.y, 2, a.x, a.y, cfg.attacks.attackRadius)) continue;
        p.shots.splice(si, 1);
        a.hp--;
        if (a.hp <= 0) {
          p.incoming.splice(ai, 1);
          if (a.tier === 'normal' || a.tier === 'reverse') reflectAttack(s, cfg, rng, p, a);
          // extras/bosses are destroyed outright — no reflection (ladder rule, PROVISIONAL)
        }
        break;
      }
    }

    // Beams vs incoming attacks
    for (const beam of p.beams) {
      for (let ai = p.incoming.length - 1; ai >= 0; ai--) {
        const a = p.incoming[ai]!;
        if (Math.abs(a.x - beam.x) <= beam.halfWidth + cfg.attacks.attackRadius && a.y >= beam.y - 10 && a.y <= beam.y + 14) {
          a.hp -= 2; // beams hit harder
          if (a.hp <= 0) {
            p.incoming.splice(ai, 1);
            if (a.tier === 'normal' || a.tier === 'reverse') reflectAttack(s, cfg, rng, p, a);
          }
        }
      }
    }

    // Explosions catch incoming attacks → reflected AND credited to the chain (PROVISIONAL)
    for (const ex of matured) {
      for (let ai = p.incoming.length - 1; ai >= 0; ai--) {
        const a = p.incoming[ai]!;
        if (a.tier !== 'normal' && a.tier !== 'reverse') continue;
        if (circleHit(ex.x, ex.y, cfg.chain.explosionRadius, a.x, a.y, cfg.attacks.attackRadius)) {
          p.incoming.splice(ai, 1);
          reflectAttack(s, cfg, rng, p, a);
          const chain = p.chains.find((c) => c.id === ex.chainId);
          if (chain) { chain.size++; chain.reflectedAttacks++; }
        }
      }
    }

    // Move incoming attacks; collide with player
    for (let ai = p.incoming.length - 1; ai >= 0; ai--) {
      const a = p.incoming[ai]!;
      a.age++;
      const speedScale = cfg.routing.incomingSpeedScale;
      if (a.tier === 'boss') {
        // Boss descends to a hover line, rains reflectable shots, leaves after its duration
        if (a.y < 56) a.y += a.speed * speedScale;
        if (a.age % 90 === 0) {
          p.incoming.push({
            id: s.nextId++,
            tier: 'normal',
            originalSender: a.originalSender,
            lastSender: a.lastSender,
            x: a.x,
            y: a.y + 10,
            anchorX: a.x,
            age: 0,
            speed: cfg.attacks.baseSpeed,
            reflectCount: 0,
            hp: cfg.attacks.attackHp,
          });
        }
        if (a.age >= cfg.attacks.bossDurationTicks) { p.incoming.splice(ai, 1); continue; }
      } else {
        a.y += a.speed * speedScale;
        a.x = a.anchorX + Math.sin((a.age / cfg.attacks.swayPeriodTicks) * Math.PI * 2) * cfg.attacks.swayAmplitude;
        a.x = Math.max(4, Math.min(cfg.field.width - 4, a.x));
      }
      const radius = a.tier === 'boss' ? cfg.attacks.attackRadius * 3 : cfg.attacks.attackRadius;
      if (circleHit(a.x, a.y, radius, p.x, p.y, cfg.player.radius)) {
        const dmg =
          a.tier === 'normal' ? cfg.damage.normalHit :
          a.tier === 'reverse' ? cfg.damage.reverseHit :
          a.tier === 'extra' ? cfg.damage.extraHit :
          cfg.damage.bossHit;
        const hadIframes = p.iframes > 0;
        damagePlayer(s, cfg, p, dmg, a.lastSender);
        if (!hadIframes) {
          s.events.push({ type: 'player-hit', seat: p.seat, source: a.tier });
          if (a.tier !== 'boss') p.incoming.splice(ai, 1);
        }
        continue;
      }
      if (a.tier !== 'boss' && a.y > cfg.field.height + 10) p.incoming.splice(ai, 1);
    }

    // Zako vs player → self-damage with life-steal to both others (owner rule)
    for (let zi = p.zako.length - 1; zi >= 0; zi--) {
      const z = p.zako[zi]!;
      if (circleHit(z.x, z.y, cfg.waves.zakoRadius, p.x, p.y, cfg.player.radius)) {
        const hadIframes = p.iframes > 0;
        selfDamageWithLifeSteal(s, cfg, p, cfg.damage.zakoCollision);
        if (!hadIframes) {
          s.events.push({ type: 'player-hit', seat: p.seat, source: 'zako' });
          p.zako.splice(zi, 1);
        }
      }
    }

    // Tick explosions down
    for (const ex of p.explosions) ex.ticksLeft--;
    p.explosions = p.explosions.filter((ex) => ex.ticksLeft > 0);

    // Resolve chains whose explosions have all expired
    const resolved: ActiveChain[] = [];
    p.chains = p.chains.filter((c) => {
      const active = p.explosions.some((ex) => ex.chainId === c.id);
      if (!active) resolved.push(c);
      return active;
    });

    if (resolved.length > 0) {
      let bigChains = 0;
      for (const chain of resolved) {
        p.stats.chains++;
        p.stats.biggestChain = Math.max(p.stats.biggestChain, chain.size);
        p.feverMeter = Math.min(100, p.feverMeter + chain.size * cfg.chain.feverGainPerChainLink);
        if (chain.size >= 2) bigChains++;
        if (chain.size >= 2) s.events.push({ type: 'chain', seat: p.seat, size: chain.size });

        if (chain.size >= cfg.chain.minChainToAttack) {
          const count = Math.min(
            cfg.chain.maxAttacksPerChain,
            Math.floor((chain.size - cfg.chain.minChainToAttack) / cfg.chain.perExtraChain) + 1,
          );
          const targets = targetsForNormal(s, p, cfg, rng);
          for (const t of targets) {
            for (let i = 0; i < count; i++) {
              queueAttack(s, cfg, rng, 'normal', p.seat, p.seat, t, 0);
            }
          }
        }

        // Fever: big chains during fever send a Boss Attack
        if (p.feverTicks > 0 && chain.size >= cfg.fever.bossChainSize) {
          const targets = cfg.routing.bossToAll
            ? livingOpponents(s, p.seat).map((o) => o.seat)
            : targetsForNormal(s, p, cfg, rng);
          for (const t of targets) queueAttack(s, cfg, rng, 'boss', p.seat, p.seat, t, 0);
        }
      }

      // Simultaneous chains (charge shot splits) → Extra Attack
      if (bigChains >= cfg.attacks.simultaneousChainsForExtra) {
        const targets = cfg.routing.extrasToAll
          ? livingOpponents(s, p.seat).map((o) => o.seat)
          : targetsForNormal(s, p, cfg, rng);
        for (const t of targets) queueAttack(s, cfg, rng, 'extra', p.seat, p.seat, t, 0);
      }

      // Fever meter full → fever mode starts
      if (p.feverMeter >= 100 && p.feverTicks <= 0) {
        p.feverTicks = cfg.fever.durationTicks;
        p.feverMeter = 0;
        s.events.push({ type: 'fever-start', seat: p.seat });
      }
    }
  }

  // --- Transit attacks arrive ---
  for (let ti = s.transit.length - 1; ti >= 0; ti--) {
    const t = s.transit[ti]!;
    t.ticksLeft--;
    if (t.ticksLeft > 0) continue;
    s.transit.splice(ti, 1);
    const target = s.players[t.target];
    if (!target || !target.alive) continue; // arrived at an empty seat — fizzles
    const hp =
      t.tier === 'extra' ? cfg.attacks.extraHp :
      t.tier === 'boss' ? cfg.attacks.bossHp :
      cfg.attacks.attackHp;
    target.incoming.push({
      id: s.nextId++,
      tier: t.tier,
      originalSender: t.originalSender,
      lastSender: t.lastSender,
      x: t.entryX,
      y: -10,
      anchorX: t.entryX,
      age: 0,
      speed: t.speed,
      reflectCount: t.reflectCount,
      hp,
    });
    target.lastAttacker = t.lastSender;
  }

  // --- Eliminations ---
  for (const p of s.players) {
    if (p.alive && p.hp <= 0) {
      p.alive = false;
      p.hp = 0;
      s.events.push({ type: 'eliminated', seat: p.seat });
      p.shots = [];
      p.beams = [];
      p.zako = [];
      p.explosions = [];
      p.incoming = [];
      p.chains = [];
      // In-transit attacks aimed at the empty seat fizzle on arrival (handled above)
    }
  }

  // --- Win conditions ---
  const alive = s.players.filter((p) => p.alive);
  if (alive.length <= 1) {
    s.phase = 'over';
    s.winner = alive.length === 1 ? alive[0]!.seat : -1;
  } else if (s.tick >= cfg.match.timerTicks && cfg.match.onTimeout === 'most-hp') {
    s.phase = 'over';
    let best = alive[0]!;
    for (const p of alive) if (p.hp > best.hp) best = p;
    s.winner = best.seat;
  }
  if (s.phase === 'over') s.events.push({ type: 'over', winner: s.winner });

  s.rngState = rng.state();
  s.waveRngState = waveRng.state();
}
