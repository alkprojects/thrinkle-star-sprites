import type { AttackTier, BalanceConfig } from '../config/balance';
import { BASELINE_STATS, type CharStats } from '../config/characters';
import { detSin } from './detmath';
import { createRng, rngFromState, type Rng } from './rng';
import type {
  ActiveChain, IncomingAttack, PlayerInput, PlayerSim, SimState,
} from './types';
import { generateWave, instantiateWave } from './waves';

export const SEATS = 3;

/** Optional per-seat character stats; seats without one use the Load-Ran baseline (tests). */
export function createSim(cfg: BalanceConfig, seed: number, characters?: CharStats[]): SimState {
  const rng = createRng(seed);
  const waveRng = createRng(seed ^ 0x5f3759df);
  const players: PlayerSim[] = [];
  for (let seat = 0; seat < SEATS; seat++) {
    const st = characters?.[seat] ?? BASELINE_STATS;
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
      dizzyTicks: 0,
      chargeMeter: 0,
      moveSpeed: st.moveSpeed,
      shotSpeed: st.shotSpeed,
      shotReload: st.shotReload,
      chargeLv1: st.chargeLv1,
      chargeLv2: st.chargeLv1 * 2,
      chargeMax: st.chargeLv1 * 3,
      beamDamage: st.beamDamage,
      exCount: st.exCount,
      bossHp: st.bossHp,
      death: null,
      deathCount: 0,
      deathArmTimer: 0,
      lastShotTick: 0,
      inactivityDeathDone: false,
      shots: [],
      beams: [],
      zako: [],
      orbs: [],
      orbTimer: cfg.fever.orbIntervalMinTicks,
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
    waveTimer: cfg.waves.firstWaveTick,
    players,
    transit: [],
    nextId: 1,
    nextChainId: 1,
    attackPattern: 0,
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

/** Fireball SIZE/HP by the combo hit-index that generated it (§3.3): 2–5 small … 16+ biggest. */
function fireballHp(hitIndex: number): number {
  return hitIndex <= 5 ? 2 : hitIndex <= 10 ? 3 : hitIndex <= 15 ? 4 : 5;
}

function queueAttack(
  s: SimState, cfg: BalanceConfig, rng: Rng,
  tier: AttackTier, originalSender: number, lastSender: number, target: number,
  reflectCount: number,
  /** Density pressure valve applies ONLY to chain-generated normals — reflections always return. */
  densityGated = false,
  /** Size/HP for normals & reverses; defaulted by tier at arrival when absent. */
  hp?: number,
): void {
  if (densityGated && rng.next() >= cfg.routing.incomingDensityScale) return;
  // Original ladder has exactly ONE speed bump: reverses are slightly faster than normals.
  const speed =
    tier === 'extra' ? cfg.attacks.extraSpeed :
    tier === 'boss' ? cfg.attacks.bossSpeed :
    tier === 'reverse' ? cfg.attacks.baseSpeed * cfg.attacks.reverseSpeedScale :
    cfg.attacks.baseSpeed;
  const margin = cfg.attacks.entryMarginFrac;
  s.transit.push({
    tier,
    originalSender,
    lastSender,
    target,
    reflectCount,
    ticksLeft: cfg.attacks.travelTicks,
    entryX: rng.range(cfg.field.width * margin, cfg.field.width * (1 - margin)),
    speed,
    hp,
    // Fireballs (normals/reverses) fly one of the 3 cycling patterns; extras/bosses don't.
    pattern: tier === 'normal' || tier === 'reverse' ? s.attackPattern : undefined,
  });
  s.players[lastSender]!.stats.attacksSent++;
  s.events.push({ type: 'attack-sent', tier, from: lastSender, to: target });
}

/**
 * THE LADDER (docs/GAME_MECHANICS.md §4). A destroyed NORMAL returns as a REVERSE to
 * whoever last sent it (the original sender on first reflection — owner rule). A
 * destroyed REVERSE becomes an EXTRA (1:1) — unless >= bossFromReversesInCombo
 * reverses are caught by explosions within ONE combo, which sends a Boss instead
 * (handled at chain resolution). Extras and bosses never reflect.
 */
function returnAsReverse(
  s: SimState, cfg: BalanceConfig, rng: Rng, reflector: PlayerSim, a: IncomingAttack,
  /** Explosion reflections pass the chain-size tier; shot reflections leave it undefined and
   *  get the "one size larger" rule (§4.1). */
  hpOverride?: number,
): void {
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
  // Shot down → one size LARGER; caught in a chain explosion → sized by that chain's hits (§4.1).
  const reverseHp = hpOverride ?? Math.min(5, (a.maxHp ?? a.hp ?? cfg.attacks.attackHp) + 1);
  queueAttack(s, cfg, rng, 'reverse', a.originalSender, reflector.seat, target, a.reflectCount + 1, false, reverseHp);
}

/** A reverse destroyed individually converts to Extra Attack(s) from the destroyer. */
function sendExtras(s: SimState, cfg: BalanceConfig, rng: Rng, from: PlayerSim, count: number): void {
  const targets = cfg.routing.extrasToAll
    ? livingOpponents(s, from.seat).map((o) => o.seat)
    : targetsForNormal(s, from, cfg, rng);
  for (const t of targets) {
    for (let i = 0; i < count; i++) queueAttack(s, cfg, rng, 'extra', from.seat, from.seat, t, 0);
  }
}

function sendBoss(s: SimState, cfg: BalanceConfig, rng: Rng, from: PlayerSim): void {
  const targets = cfg.routing.bossToAll
    ? livingOpponents(s, from.seat).map((o) => o.seat)
    : targetsForNormal(s, from, cfg, rng);
  for (const t of targets) queueAttack(s, cfg, rng, 'boss', from.seat, from.seat, t, 0);
}

/** Ladder routing for an attack destroyed INDIVIDUALLY (shot, beam, or bomb-with-knob). */
function attackDestroyedIndividually(s: SimState, cfg: BalanceConfig, rng: Rng, destroyer: PlayerSim, a: IncomingAttack): void {
  if (a.tier === 'normal') returnAsReverse(s, cfg, rng, destroyer, a);
  else if (a.tier === 'reverse') sendExtras(s, cfg, rng, destroyer, 1);
  // extras/bosses never produce a return
}

/** An opponent's attack lands: fixed damage, and the ATTACKER heals a fixed amount (original economy). */
function damagePlayer(s: SimState, cfg: BalanceConfig, victim: PlayerSim, amount: number, attacker: number): void {
  if (victim.iframes > 0 || !victim.alive) return;
  victim.hp -= amount;
  victim.iframes = cfg.player.iframesTicks;
  if (attacker >= 0 && attacker !== victim.seat) {
    victim.lastAttacker = attacker;
    const ap = s.players[attacker]!;
    ap.stats.damageDealt += amount;
    if (ap.alive) ap.hp = Math.min(cfg.player.maxHp, ap.hp + cfg.lifeSteal.onAttackHit);
  }
}

/** Zako collision: 1 heart, can NEVER kill (floor), and both other players heal — owner rule. */
function selfDamageWithLifeSteal(s: SimState, cfg: BalanceConfig, victim: PlayerSim): void {
  if (victim.iframes > 0 || !victim.alive) return;
  victim.hp = Math.max(cfg.damage.zakoFloorHp, victim.hp - cfg.damage.zakoCollision);
  victim.iframes = cfg.player.iframesTicks;
  victim.dizzyTicks = cfg.player.dizzyTicks; // §5.4: a zako clip leaves you dizzy + slow
  const others = livingOpponents(s, victim.seat);
  if (others.length === 0) return;
  const share = cfg.lifeSteal.split === 'divided'
    ? cfg.lifeSteal.onZakoHit / others.length
    : cfg.lifeSteal.onZakoHit;
  for (const o of others) o.hp = Math.min(cfg.player.maxHp, o.hp + share);
}

function getChain(p: PlayerSim, s: SimState, chainId?: number): ActiveChain {
  if (chainId !== undefined) {
    const existing = p.chains.find((c) => c.id === chainId);
    if (existing) return existing;
  }
  const chain: ActiveChain = { id: chainId ?? s.nextChainId++, size: 0, reflectedAttacks: 0, reversesCaught: 0 };
  p.chains.push(chain);
  return chain;
}

/** Collision radius of a zako, scaled up by its size tier (§3.1: big zako are bigger). */
function zakoRad(z: { maxHp?: number }, cfg: BalanceConfig): number {
  return cfg.waves.zakoRadius * (1 + ((z.maxHp ?? 1) - 1) * cfg.waves.tierRadiusScale);
}

/** A zako reaches 0 HP and detonates — the blast's power/radius scale with its size tier,
 *  so big (purple) zako wipe smaller neighbours regardless of colour (§3.1). */
function explodeZako(p: PlayerSim, s: SimState, cfg: BalanceConfig, zakoIdx: number, chainId?: number): void {
  const z = p.zako[zakoIdx]!;
  const size = z.maxHp ?? 1;
  const chain = getChain(p, s, chainId);
  chain.size++;
  p.explosions.push({
    x: z.x,
    y: z.y,
    ticksLeft: cfg.chain.explosionTicks,
    chainId: chain.id,
    power: size, // removes up to `size` HP from caught zako
    radius: cfg.chain.explosionRadius * (1 + (size - 1) * cfg.waves.tierRadiusScale),
    hitIds: [],
  });
  p.zako.splice(zakoIdx, 1);
  // Charge meter fills as you destroy normal objects (owner-described mechanic, §5.6).
  p.chargeMeter = Math.min(1, p.chargeMeter + cfg.charge.gainPerZako);
  s.events.push({ type: 'zako-killed', seat: p.seat });
}

/** Apply `dmg` to a zako; it detonates only when its HP hits 0 (color is its remaining HP). */
function hurtZako(p: PlayerSim, s: SimState, cfg: BalanceConfig, zakoIdx: number, dmg: number, chainId?: number): void {
  const z = p.zako[zakoIdx]!;
  z.hp = (z.hp ?? 1) - dmg;
  if (z.hp <= 0) explodeZako(p, s, cfg, zakoIdx, chainId);
}

/** Begin fever (§6): a window of boosted chain output; clears the meter and any live orbs. */
function startFever(p: PlayerSim, s: SimState, cfg: BalanceConfig): void {
  p.feverTicks = cfg.fever.durationTicks;
  p.feverMeter = 0;
  p.orbs = [];
  s.events.push({ type: 'fever-start', seat: p.seat });
}

/**
 * A charge release spends meter to send attacks on top of the beam (GAME_MECHANICS.md §4.2):
 *   MAX hold + full meter → a Boss (or, if a boss is already in YOUR field, a REVERSAL that
 *     clears it and sends YOUR boss to the opponents); Lv2 hold + "2"-mark meter → exCount
 *     Extra ("special") attacks. Below threshold the release is just the free Lv1 beam.
 */
function releaseChargeMeter(s: SimState, cfg: BalanceConfig, rng: Rng, p: PlayerSim, level: number): void {
  if (level >= 3 && p.chargeMeter >= cfg.charge.maxThreshold) {
    const ownBoss = p.incoming.some((a) => a.tier === 'boss');
    if (ownBoss) {
      p.incoming = p.incoming.filter((a) => a.tier !== 'boss');
      s.events.push({ type: 'boss-reversed', seat: p.seat });
    }
    sendBoss(s, cfg, rng, p);
    s.events.push({ type: 'charge-special', seat: p.seat, tier: 'boss', count: 1 });
    p.chargeMeter = Math.max(0, p.chargeMeter - cfg.charge.maxCost);
  } else if (level >= 2 && p.chargeMeter >= cfg.charge.lv2Threshold) {
    sendExtras(s, cfg, rng, p, p.exCount);
    s.events.push({ type: 'charge-special', seat: p.seat, tier: 'extra', count: p.exCount });
    p.chargeMeter = Math.max(0, p.chargeMeter - cfg.charge.lv2Cost);
  }
}

/** Apply damage to this field's Death; on kill it bursts into a chain explosion (blast power 3). */
function damageDeath(p: PlayerSim, s: SimState, cfg: BalanceConfig, amount: number): boolean {
  const d = p.death;
  if (!d) return false;
  d.hp -= amount;
  if (d.hp > 0) return false;
  // Death's corpse explodes with blast power 3 and feeds the chain system (offensive use, §7).
  const chain = getChain(p, s);
  chain.size++;
  p.explosions.push({
    x: d.x, y: d.y, ticksLeft: cfg.chain.explosionTicks, chainId: chain.id,
    power: 3, radius: cfg.death.explosionRadius, hitIds: [],
  });
  // The inactivity Death despawns permanently after one kill; the time Death respawns.
  if (!d.permanent) p.inactivityDeathDone = true;
  p.death = null;
  p.deathArmTimer = cfg.death.respawnTicks;
  s.events.push({ type: 'death-killed', seat: p.seat });
  return true;
}

/**
 * Death (the reaper) on one field (§7): arms at ~100s, pursues the player with a limited
 * turn rate at a capped speed (evadable forever by circling), contact = instant round loss.
 * Steering uses only sqrt/arithmetic (no trig) to stay bit-deterministic for replays/netplay.
 */
function tickDeath(p: PlayerSim, s: SimState, cfg: BalanceConfig): void {
  const dc = cfg.death;
  if (p.deathArmTimer > 0) p.deathArmTimer--;
  if (p.death === null) {
    const timeDeath = s.tick >= dc.startTicks;
    const inactivityDeath = !p.inactivityDeathDone && s.tick - p.lastShotTick >= dc.inactivityTicks;
    if (p.deathArmTimer <= 0 && (timeDeath || inactivityDeath)) {
      const c = p.deathCount;
      const hp = Math.min(dc.hpCap, dc.hp0 + c * dc.hpPerAppearance);
      const speed = Math.min(dc.speedMax, dc.speedStart + c * dc.speedGrowthPerAppearance);
      // Spawn mirrored across the field's centre line from the player's X (§7), up top.
      p.death = {
        x: cfg.field.width - p.x,
        y: Math.min(40, cfg.field.height * 0.15),
        hp, maxHp: hp, vx: 0, vy: 1, speed, age: 0,
        permanent: timeDeath, // a pre-100s inactivity Death is one-shot; the time Death respawns
      };
      p.deathCount++;
      s.events.push({ type: 'death-spawn', seat: p.seat, count: p.deathCount });
    }
    return;
  }
  const d = p.death;
  d.age++;
  // Steer the heading toward the player by a blend (the limited turn rate), then renormalise.
  const dx = p.x - d.x;
  const dy = p.y - d.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const tx = dx / len;
  const ty = dy / len;
  const k = dc.turnRate;
  let nx = d.vx + (tx - d.vx) * k;
  let ny = d.vy + (ty - d.vy) * k;
  const nlen = Math.sqrt(nx * nx + ny * ny) || 1;
  d.vx = nx / nlen;
  d.vy = ny / nlen;
  d.x = Math.max(4, Math.min(cfg.field.width - 4, d.x + d.vx * d.speed));
  d.y = Math.max(4, Math.min(cfg.field.height - 4, d.y + d.vy * d.speed));
  // Contact = instant elimination — unless i-frames let you pass through him (§7).
  if (p.iframes <= 0 && circleHit(d.x, d.y, dc.radius, p.x, p.y, cfg.player.radius)) {
    p.hp = 0;
    s.events.push({ type: 'death-ko', seat: p.seat });
  }
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
    s.attackPattern = (s.attackPattern + 1) % 3; // fireball pattern cycles per formation (§3.4)
    const spec = generateWave(waveRng, cfg, elapsed);
    for (const p of s.players) {
      if (!p.alive) continue;
      p.zako.push(...instantiateWave(spec, cfg, () => s.nextId++));
    }
  }

  // --- Per-player update ---
  for (const p of s.players) {
    if (!p.alive) continue;
    const input = inputs[p.seat] ?? { moveX: 0, moveY: 0, fire: false, bomb: false, targetToggle: false };

    // Movement (per-character speed; diagonals NOT normalized — original quirk).
    // A zako-collision "dizzy" debuff temporarily slows movement (§5.4).
    const moveSpeed = p.dizzyTicks > 0 ? p.moveSpeed * cfg.player.dizzyMoveScale : p.moveSpeed;
    p.x = Math.max(cfg.player.radius, Math.min(cfg.field.width - cfg.player.radius, p.x + input.moveX * moveSpeed));
    p.y = Math.max(cfg.player.radius, Math.min(cfg.field.height - cfg.player.radius, p.y + input.moveY * moveSpeed));
    if (p.iframes > 0) p.iframes--;
    if (p.shotCooldown > 0) p.shotCooldown--;
    if (p.feverTicks > 0) p.feverTicks--;
    if (p.dizzyTicks > 0) p.dizzyTicks--;

    // Manual target toggle (edge)
    if (input.targetToggle && !p.prevTargetToggle) {
      for (let i = 1; i < SEATS; i++) {
        const cand = (p.manualTarget + i) % SEATS;
        if (cand !== p.seat && s.players[cand]!.alive) { p.manualTarget = cand; break; }
      }
    }
    p.prevTargetToggle = input.targetToggle;

    // Fire / charge: holding autofires AND builds charge; releasing past Lv1 fires the
    // charge beam ("Attack Stopper") and, with enough meter, sends specials/a boss (§4.2).
    if (input.fire) {
      if (p.chargeTicks < 0) p.chargeTicks = 0;
      else p.chargeTicks++;
      if (p.shotCooldown <= 0) {
        p.shots.push({ x: p.x, y: p.y - 4 });
        p.shotCooldown = p.shotReload;
        p.lastShotTick = s.tick; // resets the inactivity-Death timer
      }
    } else {
      if (p.chargeTicks >= p.chargeLv1) {
        const level = p.chargeTicks >= p.chargeMax ? 3 : p.chargeTicks >= p.chargeLv2 ? 2 : 1;
        const halfWidth =
          level >= 3 ? cfg.shot.chargeWidthMax :
          level >= 2 ? cfg.shot.chargeWidthLv2 :
          cfg.shot.chargeWidthLv1;
        p.beams.push({ x: p.x, y: p.y - 6, halfWidth });
        s.events.push({ type: 'charge-fired', seat: p.seat, level: level as 1 | 2 | 3 });
        releaseChargeMeter(s, cfg, rng, p, level);
      }
      p.chargeTicks = -1;
    }
    p.prevFire = input.fire;

    // Bomb (edge): full-field zako wipe + i-frames. Original bombs do NOT clear
    // incoming attacks (you survive them via i-frames) — clearsAttacks is a 3P knob.
    if (input.bomb && !p.prevBomb && p.bombs > 0) {
      p.bombs--;
      p.iframes = Math.max(p.iframes, cfg.player.iframesTicks);
      s.events.push({ type: 'bomb', seat: p.seat });
      p.zako = p.zako.filter((z) => !circleHit(z.x, z.y, zakoRad(z, cfg), p.x, p.y, cfg.bomb.radius));
      if (p.death) damageDeath(p, s, cfg, 1e9); // a bomb always kills Death in one hit (§5.5)
      if (cfg.fever.mode === 'orb' && p.orbs.length > 0) startFever(p, s, cfg); // a bomb detonates the orb (§6.1)
      if (cfg.bomb.clearsAttacks) {
        p.incoming = p.incoming.filter((a) => {
          if (a.tier === 'boss') return true; // bombs never erase bosses outright
          if (!circleHit(a.x, a.y, cfg.attacks.attackRadius, p.x, p.y, cfg.bomb.radius)) return true;
          if (cfg.bomb.reflectsAttacks) attackDestroyedIndividually(s, cfg, rng, p, a);
          return false;
        });
      }
    }
    p.prevBomb = input.bomb;

    // Move shots and beams (per-character shot speed, reduced while dizzy — §5.4)
    const shotSpeed = p.dizzyTicks > 0 ? p.shotSpeed * cfg.player.dizzyShotScale : p.shotSpeed;
    for (const shot of p.shots) shot.y -= shotSpeed;
    p.shots = p.shots.filter((shot) => shot.y > -8);
    for (const beam of p.beams) beam.y -= shotSpeed * cfg.shot.beamSpeedScale;
    p.beams = p.beams.filter((b) => b.y > -12);

    // Move zako
    for (const z of p.zako) {
      z.y += z.vy;
      z.x += z.vx;
      if (z.swayAmp > 0) {
        z.swayPhase += cfg.waves.swayRate;
        z.x += detSin(z.swayPhase) * z.swayAmp * cfg.waves.swayFactor;
      }
      if (z.x < 4 || z.x > cfg.field.width - 4) z.vx = -z.vx;
    }
    // Zako leaving the bottom just fly away (PROVISIONAL: no penalty)
    p.zako = p.zako.filter((z) => z.y < cfg.field.height + 10);

    // Fever orbs (§6.1): appear on a per-field timer and drift down; only a chain explosion
    // or a bomb detonates one (→ fever). Shots pass through; an undetonated orb just exits.
    if (cfg.fever.mode === 'orb') {
      if (p.orbTimer > 0) p.orbTimer--;
      if (p.orbTimer <= 0 && p.orbs.length === 0 && p.feverTicks <= 0) {
        p.orbs.push({
          id: s.nextId++,
          x: rng.range(cfg.field.width * 0.2, cfg.field.width * 0.8),
          y: -8,
          vy: cfg.fever.orbSpeed,
          age: 0,
        });
        p.orbTimer = Math.round(rng.range(cfg.fever.orbIntervalMinTicks, cfg.fever.orbIntervalMaxTicks));
        s.events.push({ type: 'orb-spawn', seat: p.seat });
      }
      for (const o of p.orbs) { o.age++; o.y += o.vy; }
      p.orbs = p.orbs.filter((o) => o.y < cfg.field.height + 10);
    }

    // Shots vs zako → a basic shot drops the zako one tier; at 0 HP it detonates a chain
    for (let si = p.shots.length - 1; si >= 0; si--) {
      const shot = p.shots[si]!;
      for (let zi = p.zako.length - 1; zi >= 0; zi--) {
        const z = p.zako[zi]!;
        if (circleHit(shot.x, shot.y, 2, z.x, z.y, zakoRad(z, cfg))) {
          p.shots.splice(si, 1);
          hurtZako(p, s, cfg, zi, 1);
          break;
        }
      }
    }

    // Beams vs zako — deal beamDamage; every beam kill starts its OWN chain (Extra engine)
    for (const beam of p.beams) {
      for (let zi = p.zako.length - 1; zi >= 0; zi--) {
        const z = p.zako[zi]!;
        if (Math.abs(z.x - beam.x) <= beam.halfWidth + zakoRad(z, cfg) && z.y >= beam.y - 10 && z.y <= beam.y + 14) {
          hurtZako(p, s, cfg, zi, p.beamDamage);
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
        if (ex.hitIds.includes(z.id)) continue; // a lingering blast hits each zako once
        if (circleHit(ex.x, ex.y, ex.radius, z.x, z.y, zakoRad(z, cfg))) {
          ex.hitIds.push(z.id);
          hurtZako(p, s, cfg, zi, ex.power, ex.chainId);
        }
      }
    }

    // Shots vs incoming attacks (bosses use their full contact hitbox)
    const hitRadius = (a: IncomingAttack) =>
      a.tier === 'boss' ? cfg.attacks.attackRadius * cfg.attacks.bossHitboxScale : cfg.attacks.attackRadius;
    for (let si = p.shots.length - 1; si >= 0; si--) {
      const shot = p.shots[si]!;
      for (let ai = p.incoming.length - 1; ai >= 0; ai--) {
        const a = p.incoming[ai]!;
        if (!circleHit(shot.x, shot.y, 2, a.x, a.y, hitRadius(a))) continue;
        p.shots.splice(si, 1);
        if (a.tier === 'extra' && !cfg.attacks.extrasDestructible) break; // extras absorb shots
        a.hp--;
        if (a.hp <= 0) {
          p.incoming.splice(ai, 1);
          attackDestroyedIndividually(s, cfg, rng, p, a);
        }
        break;
      }
    }

    // Beams vs incoming attacks
    for (const beam of p.beams) {
      for (let ai = p.incoming.length - 1; ai >= 0; ai--) {
        const a = p.incoming[ai]!;
        if (Math.abs(a.x - beam.x) <= beam.halfWidth + hitRadius(a) && a.y >= beam.y - 10 && a.y <= beam.y + 14) {
          if (a.tier === 'extra' && !cfg.attacks.extrasDestructible) continue; // extras shrug it off
          a.hp -= p.beamDamage;
          if (a.hp <= 0) {
            p.incoming.splice(ai, 1);
            attackDestroyedIndividually(s, cfg, rng, p, a);
          }
        }
      }
    }

    // --- Death (the reaper): spawn/pursue/contact, plus player weapons that wear him down ---
    tickDeath(p, s, cfg);
    if (p.death) {
      for (let si = p.shots.length - 1; si >= 0; si--) {
        const shot = p.shots[si]!;
        if (circleHit(shot.x, shot.y, 2, p.death.x, p.death.y, cfg.death.radius)) {
          p.shots.splice(si, 1);
          if (damageDeath(p, s, cfg, 1)) break;
        }
      }
    }
    if (p.death) {
      for (const beam of p.beams) {
        if (
          Math.abs(p.death.x - beam.x) <= beam.halfWidth + cfg.death.radius &&
          p.death.y >= beam.y - 12 && p.death.y <= beam.y + 16
        ) {
          if (damageDeath(p, s, cfg, p.beamDamage)) break;
        }
      }
    }

    // Explosions catch incoming attacks — they count as combo hits, and:
    //   normals  → return as reverses immediately
    //   reverses → tallied on the chain; at resolution, >= bossFromReversesInCombo of
    //              them sends a BOSS instead of their individual extras (ladder rule)
    for (const ex of matured) {
      for (let ai = p.incoming.length - 1; ai >= 0; ai--) {
        const a = p.incoming[ai]!;
        if (a.tier !== 'normal' && a.tier !== 'reverse') continue;
        if (circleHit(ex.x, ex.y, ex.radius, a.x, a.y, cfg.attacks.attackRadius)) {
          p.incoming.splice(ai, 1);
          const chain = p.chains.find((c) => c.id === ex.chainId);
          if (chain) { chain.size++; chain.reflectedAttacks++; }
          if (a.tier === 'normal') {
            // Explosion-caught: the reverse is sized by this chain's hit count (§4.1).
            returnAsReverse(s, cfg, rng, p, a, fireballHp(chain ? chain.size : 2));
          } else if (chain) {
            chain.reversesCaught++;
            s.events.push({ type: 'reflect', seat: p.seat });
          } else {
            sendExtras(s, cfg, rng, p, 1); // orphan catch (chain already resolved this tick)
          }
        }
      }
    }

    // Matured explosions detonate a fever orb → fever (§6.1)
    if (cfg.fever.mode === 'orb' && p.orbs.length > 0) {
      for (const ex of matured) {
        let detonated = false;
        for (let oi = p.orbs.length - 1; oi >= 0; oi--) {
          const o = p.orbs[oi]!;
          if (circleHit(ex.x, ex.y, ex.radius, o.x, o.y, cfg.fever.orbRadius)) {
            p.orbs.splice(oi, 1);
            detonated = true;
          }
        }
        if (detonated) startFever(p, s, cfg);
      }
    }

    // Move incoming attacks; collide with player
    for (let ai = p.incoming.length - 1; ai >= 0; ai--) {
      const a = p.incoming[ai]!;
      a.age++;
      const speedScale = cfg.routing.incomingSpeedScale;
      if (a.tier === 'boss') {
        // Boss descends to a hover line, rains reflectable shots, leaves after its duration
        if (a.y < cfg.attacks.bossHoverY) a.y += a.speed * speedScale;
        if (a.age % cfg.attacks.bossRainIntervalTicks === 0) {
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
            maxHp: cfg.attacks.attackHp,
          });
        }
        if (a.age >= cfg.attacks.bossDurationTicks) { p.incoming.splice(ai, 1); continue; }
      } else if (a.pattern === undefined) {
        // Legacy sinusoidal sway (hand-built test fixtures only).
        a.y += a.speed * speedScale;
        a.x = a.anchorX + detSin((a.age / cfg.attacks.swayPeriodTicks) * Math.PI * 2) * cfg.attacks.swayAmplitude;
        a.x = Math.max(4, Math.min(cfg.field.width - 4, a.x));
      } else if (a.pattern === 0) {
        // Parabola: horizontal drift + accelerating descent (arcs across the field).
        a.x += a.vx ?? 0;
        a.y += a.speed * speedScale * (1 + a.age * cfg.attacks.patternParabolaAccel);
        if (a.x < 4 || a.x > cfg.field.width - 4) a.vx = -(a.vx ?? 0);
        a.x = Math.max(4, Math.min(cfg.field.width - 4, a.x));
      } else if (a.pattern === 1) {
        // Diagonal-bounce: faster, straight-line toward the snapshot aim, bouncing off walls.
        a.x += a.vx ?? 0;
        a.y += a.speed * speedScale * cfg.attacks.patternDiagonalSpeedScale;
        if (a.x < 4 || a.x > cfg.field.width - 4) a.vx = -(a.vx ?? 0);
        a.x = Math.max(4, Math.min(cfg.field.width - 4, a.x));
      } else {
        // Stop-and-track: descend to a hover line, track the victim's x, then drop straight.
        if (a.y < cfg.attacks.patternHoverY) {
          a.y += a.speed * speedScale;
        } else if (a.age < cfg.attacks.patternTrackTicks) {
          const dx = p.x - a.x;
          const step = cfg.attacks.patternTrackSpeed;
          a.x += Math.max(-step, Math.min(step, dx));
        } else {
          a.y += a.speed * speedScale * 1.25;
        }
      }
      const radius = hitRadius(a);
      if (circleHit(a.x, a.y, radius, p.x, p.y, cfg.player.radius)) {
        const hadIframes = p.iframes > 0;
        damagePlayer(s, cfg, p, cfg.damage.attackHit, a.lastSender);
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
      if (circleHit(z.x, z.y, zakoRad(z, cfg), p.x, p.y, cfg.player.radius)) {
        const hadIframes = p.iframes > 0;
        selfDamageWithLifeSteal(s, cfg, p);
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
        p.chargeMeter = Math.min(1, p.chargeMeter + chain.size * cfg.charge.gainPerChainLink);
        if (chain.size >= 2) bigChains++;
        if (chain.size >= 2) s.events.push({ type: 'chain', seat: p.seat, size: chain.size });

        // Chain → fireballs. Normal: floor((hits-2)/2) from the 4th hit.
        // Fever: hits - feverHitOffset, starting from the 2nd hit (original mapping).
        const inFever = p.feverTicks > 0;
        const count = inFever
          ? Math.min(cfg.chain.maxAttacksPerChain * 2, Math.max(0, chain.size - cfg.chain.feverHitOffset) * (chain.size >= 2 ? 1 : 0))
          : chain.size >= cfg.chain.minChainToAttack
            ? Math.min(
                cfg.chain.maxAttacksPerChain,
                Math.floor((chain.size - cfg.chain.minChainToAttack) / cfg.chain.perExtraChain) + 1,
              )
            : 0;
        if (count > 0) {
          const targets = targetsForNormal(s, p, cfg, rng);
          for (const t of targets) {
            for (let i = 0; i < count; i++) {
              // Size each fireball by its generating hit-index (§3.3): early hits send small
              // fireballs, deeper hits bigger/tougher ones. Fever generates from the 2nd hit.
              const idx = inFever ? 2 + i : cfg.chain.minChainToAttack + i * cfg.chain.perExtraChain;
              queueAttack(s, cfg, rng, 'normal', p.seat, p.seat, t, 0, true, fireballHp(idx));
            }
          }
        }

        // Reverses caught by this combo's explosions: 3+ summon a BOSS instead of
        // their individual extras (the original's only non-meter boss trigger).
        if (chain.reversesCaught >= cfg.attacks.bossFromReversesInCombo) {
          sendBoss(s, cfg, rng, p);
        } else if (chain.reversesCaught > 0) {
          sendExtras(s, cfg, rng, p, chain.reversesCaught);
        }
      }

      // Simultaneous chains (charge shot splits) → Extra Attack
      if (bigChains >= cfg.attacks.simultaneousChainsForExtra) {
        const targets = cfg.routing.extrasToAll
          ? livingOpponents(s, p.seat).map((o) => o.seat)
          : targetsForNormal(s, p, cfg, rng);
        for (const t of targets) queueAttack(s, cfg, rng, 'extra', p.seat, p.seat, t, 0);
      }

      // Legacy meter-fever trigger (only in 'meter' mode; 'orb' mode uses the orb above)
      if (cfg.fever.mode === 'meter' && p.feverMeter >= 100 && p.feverTicks <= 0) {
        startFever(p, s, cfg);
      }
    }
  }

  // --- Transit attacks arrive ---
  for (let ti = s.transit.length - 1; ti >= 0; ti--) {
    const t = s.transit[ti]!;
    t.ticksLeft--;
    if (t.ticksLeft > 0) continue;
    s.transit.splice(ti, 1);
    let target = s.players[t.target];
    if (!target || !target.alive) {
      // Reflections aimed at an empty seat: drop or redirect per config; plain sends fizzle.
      if (t.reflectCount > 0 && cfg.routing.reflectionToEliminated === 'redirect-other') {
        const others = s.players.filter((o) => o.alive && o.seat !== t.lastSender);
        if (others.length === 0) continue;
        target = others[rng.int(others.length)]!;
      } else {
        continue;
      }
    }
    const hp =
      t.tier === 'extra' ? cfg.attacks.extraHp :
      t.tier === 'boss' ? (s.players[t.originalSender]?.bossHp ?? cfg.attacks.bossHp) :
      (t.hp ?? cfg.attacks.attackHp);
    // Pattern velocity: parabola drifts toward centre; diagonal-bounce aims a snapshot at
    // the target's current x (no homing afterwards — baitable); stop-and-track starts at 0.
    const W = cfg.field.width;
    let vx = 0;
    if (t.pattern === 0) vx = (t.entryX < W / 2 ? 1 : -1) * cfg.attacks.patternParabolaVx;
    else if (t.pattern === 1) vx = (target.x >= t.entryX ? 1 : -1) * cfg.attacks.patternDiagonalVx;
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
      maxHp: hp,
      pattern: t.pattern,
      vx,
    });
    // (Retaliation targeting keys off actually being HIT — damagePlayer sets lastAttacker.)
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
      p.orbs = [];
      p.explosions = [];
      p.incoming = [];
      p.chains = [];
      p.death = null;
      // In-transit attacks aimed at the empty seat fizzle on arrival (handled above)
    }
  }

  // --- Win conditions ---
  const alive = s.players.filter((p) => p.alive);
  if (alive.length <= 1) {
    s.phase = 'over';
    s.winner = alive.length === 1 ? alive[0]!.seat : -1;
  } else if (s.tick >= cfg.match.timerTicks) {
    if (cfg.match.onTimeout === 'most-hp') {
      s.phase = 'over';
      let best = alive[0]!;
      let tie = false;
      for (const p of alive) {
        if (p === best) continue;
        if (p.hp > best.hp) { best = p; tie = false; }
        else if (p.hp === best.hp) tie = true;
      }
      s.winner = tie ? -1 : best.seat; // exact HP tie at the bell = draw
    } else {
      // sudden-death: everyone drops to 1 HP and stays there (clamped every tick,
      // so life-steal can't heal it away) — the next hit ends the match.
      for (const p of alive) if (p.hp > 1) p.hp = 1;
    }
  }
  if (s.phase === 'over') s.events.push({ type: 'over', winner: s.winner });

  s.rngState = rng.state();
  s.waveRngState = waveRng.state();
}
