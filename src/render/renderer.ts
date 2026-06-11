import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { BalanceConfig } from '../config/balance';
import { CHARACTERS } from '../config/characters';
import type { IncomingAttack, PlayerSim, SimEvent, SimState } from '../sim/types';

/** Render scale: sim units → pixels. */
const S = 2.5;
const FIELD_GAP = 20;
const TOP = 64;
const HUD_H = 84;

const TIER_OUTLINE = 0xffffff;

interface Popup {
  text: Text;
  ticks: number;
  vy: number;
}

export class Renderer {
  app = new Application();
  private cfg: BalanceConfig;
  private fields: Container[] = [];
  private fieldFx: Graphics[] = [];
  private hud: Graphics[] = [];
  private nameTexts: Text[] = [];
  private statusTexts: Text[] = [];
  private popups: Popup[][] = [[], [], []];
  private shake: number[] = [0, 0, 0];
  private feverGlow: Graphics[] = [];
  private timerText!: Text;
  private overlay!: Container;
  private overlayTitle!: Text;
  private overlayBody!: Text;
  private root = new Container();
  private fieldW: number;
  private fieldH: number;

  constructor(cfg: BalanceConfig) {
    this.cfg = cfg;
    this.fieldW = cfg.field.width * S;
    this.fieldH = cfg.field.height * S;
  }

  get totalW(): number {
    return this.fieldW * 3 + FIELD_GAP * 2 + 48;
  }
  get totalH(): number {
    return TOP + this.fieldH + HUD_H + 24;
  }

  async init(parent: HTMLElement): Promise<void> {
    await this.app.init({
      background: 0x0a0a1a,
      width: this.totalW,
      height: this.totalH,
      antialias: true,
    });
    parent.appendChild(this.app.canvas);
    this.app.stage.addChild(this.root);

    const title = new Text({
      text: '✦ THRINKLE STAR SPRITES ✦',
      style: new TextStyle({ fill: 0xffe9f7, fontSize: 30, fontFamily: 'Verdana', fontWeight: 'bold', letterSpacing: 4 }),
    });
    title.anchor.set(0.5, 0);
    title.x = this.totalW / 2;
    title.y = 12;
    this.root.addChild(title);

    this.timerText = new Text({
      text: '',
      style: new TextStyle({ fill: 0x9fb4ff, fontSize: 20, fontFamily: 'Verdana', fontWeight: 'bold' }),
    });
    this.timerText.anchor.set(0.5, 0);
    this.timerText.x = this.totalW / 2;
    this.timerText.y = 44;
    this.root.addChild(this.timerText);

    for (let seat = 0; seat < 3; seat++) {
      const fx = 24 + seat * (this.fieldW + FIELD_GAP);
      const field = new Container();
      field.x = fx;
      field.y = TOP;
      this.root.addChild(field);
      this.fields.push(field);

      // Static background: dark panel + starfield
      const bg = new Graphics();
      bg.roundRect(0, 0, this.fieldW, this.fieldH, 8).fill(0x12122b).stroke({ width: 2, color: 0x32325e });
      for (let i = 0; i < 70; i++) {
        const sx = Math.random() * this.fieldW;
        const sy = Math.random() * this.fieldH;
        bg.circle(sx, sy, Math.random() * 1.4 + 0.4).fill({ color: 0xffffff, alpha: 0.12 + Math.random() * 0.25 });
      }
      field.addChild(bg);

      const glow = new Graphics();
      glow.roundRect(0, 0, this.fieldW, this.fieldH, 8).stroke({ width: 5, color: 0xffd75e, alpha: 0.9 });
      glow.visible = false;
      field.addChild(glow);
      this.feverGlow.push(glow);

      const fxLayer = new Graphics();
      field.addChild(fxLayer);
      this.fieldFx.push(fxLayer);

      // HUD under the field
      const hud = new Graphics();
      hud.x = fx;
      hud.y = TOP + this.fieldH + 8;
      this.root.addChild(hud);
      this.hud.push(hud);

      const ch = CHARACTERS[seat]!;
      const name = new Text({
        text: `${ch.name}${seat === 0 ? '  (YOU)' : '  (CPU)'}`,
        style: new TextStyle({ fill: ch.color, fontSize: 17, fontFamily: 'Verdana', fontWeight: 'bold' }),
      });
      name.x = fx + 4;
      name.y = TOP + this.fieldH + 10;
      this.root.addChild(name);
      this.nameTexts.push(name);

      const status = new Text({
        text: '',
        style: new TextStyle({ fill: 0xffffff, fontSize: 34, fontFamily: 'Verdana', fontWeight: 'bold', align: 'center' }),
      });
      status.anchor.set(0.5);
      status.x = fx + this.fieldW / 2;
      status.y = TOP + this.fieldH / 2;
      this.root.addChild(status);
      this.statusTexts.push(status);
    }

    // Title / game-over overlay
    this.overlay = new Container();
    const dim = new Graphics();
    dim.rect(0, 0, this.totalW, this.totalH).fill({ color: 0x05050f, alpha: 0.82 });
    this.overlay.addChild(dim);
    this.overlayTitle = new Text({
      text: '',
      style: new TextStyle({ fill: 0xffe9f7, fontSize: 44, fontFamily: 'Verdana', fontWeight: 'bold', align: 'center' }),
    });
    this.overlayTitle.anchor.set(0.5);
    this.overlayTitle.x = this.totalW / 2;
    this.overlayTitle.y = this.totalH * 0.38;
    this.overlay.addChild(this.overlayTitle);
    this.overlayBody = new Text({
      text: '',
      style: new TextStyle({ fill: 0xc9d4ff, fontSize: 19, fontFamily: 'Verdana', align: 'center', lineHeight: 30 }),
    });
    this.overlayBody.anchor.set(0.5, 0);
    this.overlayBody.x = this.totalW / 2;
    this.overlayBody.y = this.totalH * 0.48;
    this.overlay.addChild(this.overlayBody);
    this.root.addChild(this.overlay);

    const resize = () => {
      const scale = Math.min(window.innerWidth / this.totalW, window.innerHeight / this.totalH);
      this.app.canvas.style.width = `${this.totalW * scale}px`;
      this.app.canvas.style.height = `${this.totalH * scale}px`;
    };
    window.addEventListener('resize', resize);
    resize();
  }

  showTitle(): void {
    this.overlay.visible = true;
    this.overlayTitle.text = '✦ THRINKLE STAR SPRITES ✦';
    this.overlayBody.text =
      'Three sprites enter. One sprite twinkles.\n\n' +
      'Chain explosions to bombard BOTH rivals — shoot incoming attacks\n' +
      'to hurl them back where they came from. Crash into critters and\n' +
      'your rivals drink your pain.\n\n' +
      'MOVE  arrows / WASD      FIRE (hold to charge)  X / Space\n' +
      'BOMB  Z / Shift      MUTE  M\n\n' +
      'Press ENTER to play';
  }

  showGameOver(winner: number): void {
    this.overlay.visible = true;
    const name = winner >= 0 ? CHARACTERS[winner]!.name : 'NOBODY';
    this.overlayTitle.text = winner === 0 ? '★ YOU WIN! ★' : `${name} WINS`;
    this.overlayBody.text = 'Press ENTER for a rematch';
  }

  hideOverlay(): void {
    this.overlay.visible = false;
  }

  applyEvents(events: SimEvent[], state: SimState): void {
    for (const e of events) {
      if (e.type === 'player-hit') this.shake[e.seat] = 10;
      if (e.type === 'bomb') this.shake[e.seat] = 14;
      if (e.type === 'chain' && e.size >= 3) {
        const p = state.players[e.seat]!;
        this.popup(e.seat, p.x * S, (p.y - 24) * S, `CHAIN x${e.size}!`, 0xfff3c4);
      }
      if (e.type === 'reflect') {
        const p = state.players[e.seat]!;
        this.popup(e.seat, p.x * S, (p.y - 36) * S, 'REVERSE!', 0x9fe8ff);
      }
      if (e.type === 'fever-start') {
        this.popup(e.seat, this.fieldW / 2, this.fieldH * 0.3, 'FEVER!!', 0xffd75e);
      }
      if (e.type === 'attack-sent' && e.tier === 'boss') {
        this.popup(e.to, this.fieldW / 2, this.fieldH * 0.2, 'BOSS INCOMING!', 0xff8a8a);
      }
    }
  }

  private popup(seat: number, x: number, y: number, msg: string, color: number): void {
    const t = new Text({
      text: msg,
      style: new TextStyle({ fill: color, fontSize: 20, fontFamily: 'Verdana', fontWeight: 'bold' }),
    });
    t.anchor.set(0.5);
    t.x = Math.max(40, Math.min(this.fieldW - 40, x));
    t.y = y;
    this.fields[seat]!.addChild(t);
    this.popups[seat]!.push({ text: t, ticks: 55, vy: -0.7 });
  }

  draw(state: SimState): void {
    const cfg = this.cfg;
    this.timerText.text = formatTimer(cfg.match.timerTicks - state.tick);

    for (let seat = 0; seat < 3; seat++) {
      const p = state.players[seat]!;
      const g = this.fieldFx[seat]!;
      const field = this.fields[seat]!;
      const ch = CHARACTERS[seat]!;
      g.clear();

      // Screen shake
      if (this.shake[seat]! > 0) {
        this.shake[seat]!--;
        field.x = 24 + seat * (this.fieldW + FIELD_GAP) + (Math.random() - 0.5) * this.shake[seat]! * 1.6;
        field.y = TOP + (Math.random() - 0.5) * this.shake[seat]! * 1.6;
      } else {
        field.x = 24 + seat * (this.fieldW + FIELD_GAP);
        field.y = TOP;
      }

      this.feverGlow[seat]!.visible = p.alive && p.feverTicks > 0;
      this.statusTexts[seat]!.text = p.alive ? '' : 'K.O.';

      // Popups
      for (const pop of this.popups[seat]!) {
        pop.ticks--;
        pop.text.y += pop.vy;
        pop.text.alpha = Math.min(1, pop.ticks / 18);
        if (pop.ticks <= 0) pop.text.destroy();
      }
      this.popups[seat] = this.popups[seat]!.filter((pop) => pop.ticks > 0);

      this.drawHud(seat, p);
      if (!p.alive) continue;

      // Incoming-attack warnings at the top edge
      for (const t of state.transit) {
        if (t.target !== seat || t.ticksLeft > 30) continue;
        const x = t.entryX * S;
        const blink = Math.floor(state.tick / 4) % 2 === 0;
        if (blink) {
          g.poly([x - 8, 4, x + 8, 4, x, 18]).fill(t.tier === 'boss' ? 0xff5a5a : t.tier === 'extra' ? 0xffa94f : 0xff8ab8);
        }
      }

      // Zako — round critters with little faces
      for (const z of p.zako) {
        const zx = z.x * S;
        const zy = z.y * S;
        const r = cfg.waves.zakoRadius * S * 0.95;
        g.circle(zx, zy, r).fill(0x8d7bff).stroke({ width: 2, color: 0xc9bfff });
        g.circle(zx - r * 0.35, zy - r * 0.15, r * 0.16).fill(0xffffff);
        g.circle(zx + r * 0.35, zy - r * 0.15, r * 0.16).fill(0xffffff);
        g.circle(zx - r * 0.35, zy - r * 0.15, r * 0.07).fill(0x222244);
        g.circle(zx + r * 0.35, zy - r * 0.15, r * 0.07).fill(0x222244);
      }

      // Shots
      for (const shot of p.shots) {
        g.circle(shot.x * S, shot.y * S, 3).fill(ch.accent);
        g.circle(shot.x * S, shot.y * S + 5, 2).fill({ color: ch.accent, alpha: 0.4 });
      }

      // Beams
      for (const beam of p.beams) {
        const bw = beam.halfWidth * S;
        g.rect(beam.x * S - bw, beam.y * S - 26, bw * 2, 34)
          .fill({ color: ch.color, alpha: 0.55 })
          .stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
      }

      // Explosions — expanding rings
      for (const ex of p.explosions) {
        const t = 1 - ex.ticksLeft / cfg.chain.explosionTicks;
        const r = cfg.chain.explosionRadius * S * (0.5 + t * 0.6);
        g.circle(ex.x * S, ex.y * S, r).stroke({ width: 4, color: 0xffc46b, alpha: 1 - t * 0.7 });
        g.circle(ex.x * S, ex.y * S, r * 0.55).fill({ color: 0xfff0b8, alpha: (1 - t) * 0.5 });
      }

      // Incoming attacks
      for (const a of p.incoming) {
        this.drawAttack(g, a, state);
      }

      // Player — five-point star with charge ring
      const px = p.x * S;
      const py = p.y * S;
      const flicker = p.iframes > 0 && Math.floor(state.tick / 3) % 2 === 0;
      if (!flicker) {
        drawStar(g, px, py, 5, 11, 5.5, ch.color, TIER_OUTLINE);
        g.circle(px, py - 1, 3).fill(0xffffff);
      }
      if (p.chargeTicks >= cfg.shot.chargeTicksLv1) {
        const lv2 = p.chargeTicks >= cfg.shot.chargeTicksLv2;
        const pulse = 1 + Math.sin(state.tick * 0.35) * 0.12;
        g.circle(px, py, (lv2 ? 17 : 13) * pulse).stroke({ width: 3, color: lv2 ? 0xffd75e : ch.accent, alpha: 0.9 });
      }
    }
  }

  private drawAttack(g: Graphics, a: IncomingAttack, state: SimState): void {
    const ax = a.x * S;
    const ay = a.y * S;
    const sender = CHARACTERS[a.originalSender] ?? CHARACTERS[0]!;
    if (a.tier === 'boss') {
      const r = this.cfg.attacks.attackRadius * 3 * S;
      const wob = Math.sin(state.tick * 0.1) * 3;
      g.circle(ax - r * 0.5, ay + wob, r * 0.62).fill(0x5a3d8a).stroke({ width: 3, color: 0xb38aff });
      g.circle(ax + r * 0.5, ay - wob, r * 0.62).fill(0x5a3d8a).stroke({ width: 3, color: 0xb38aff });
      g.circle(ax, ay, r * 0.8).fill(0x6f4aa8).stroke({ width: 3, color: 0xd8bfff });
      g.circle(ax - r * 0.25, ay - r * 0.15, r * 0.12).fill(0xff5a5a);
      g.circle(ax + r * 0.25, ay - r * 0.15, r * 0.12).fill(0xff5a5a);
      // HP ring
      const frac = a.hp / this.cfg.attacks.bossHp;
      g.rect(ax - r, ay - r - 12, r * 2 * frac, 5).fill(0xff8a8a);
    } else if (a.tier === 'extra') {
      drawStar(g, ax, ay, 7, this.cfg.attacks.attackRadius * S * 1.6, this.cfg.attacks.attackRadius * S * 0.8, 0xff9a3d, 0xffe2bb);
      g.circle(ax, ay, 4).fill(0xffffff);
    } else {
      const r = this.cfg.attacks.attackRadius * S * 0.9;
      // trail
      for (let i = 1; i <= 3; i++) {
        g.circle(ax, ay - i * 7, r * (1 - i * 0.22)).fill({ color: sender.color, alpha: 0.35 - i * 0.09 });
      }
      g.circle(ax, ay, r).fill(sender.color).stroke({ width: 2, color: TIER_OUTLINE });
      if (a.tier === 'reverse') {
        // speed chevrons mark a reversed (angrier) attack
        g.poly([ax - r, ay - r - 4, ax, ay - r + 2, ax + r, ay - r - 4]).stroke({ width: 2, color: 0x9fe8ff });
      }
    }
  }

  private drawHud(seat: number, p: PlayerSim): void {
    const cfg = this.cfg;
    const h = this.hud[seat]!;
    const w = this.fieldW;
    h.clear();

    // HP bar
    const hpFrac = Math.max(0, p.hp / cfg.player.maxHp);
    h.roundRect(0, 26, w, 16, 5).fill(0x1c1c38).stroke({ width: 1, color: 0x3a3a68 });
    if (hpFrac > 0) {
      const color = hpFrac > 0.5 ? 0x6fe87f : hpFrac > 0.25 ? 0xffd75e : 0xff6b6b;
      h.roundRect(1, 27, (w - 2) * hpFrac, 14, 5).fill(color);
    }

    // Fever meter
    h.roundRect(0, 48, w * 0.7, 9, 4).fill(0x1c1c38).stroke({ width: 1, color: 0x3a3a68 });
    const fever = p.feverTicks > 0 ? 1 : p.feverMeter / 100;
    if (fever > 0) {
      h.roundRect(1, 49, (w * 0.7 - 2) * fever, 7, 4).fill(p.feverTicks > 0 ? 0xffd75e : 0xb38aff);
    }

    // Bomb pips
    for (let i = 0; i < p.bombs; i++) {
      h.circle(w * 0.7 + 18 + i * 18, 52, 6).fill(0xff8ab8).stroke({ width: 2, color: 0xffffff });
    }

    // Charge bar (small, under fever)
    if (p.chargeTicks > 0) {
      const frac = Math.min(1, p.chargeTicks / cfg.shot.chargeTicksLv2);
      h.rect(0, 62, w * 0.7 * frac, 4).fill(frac >= 1 ? 0xffd75e : 0x9fe8ff);
    }
  }
}

function drawStar(
  g: Graphics, cx: number, cy: number, points: number,
  outer: number, inner: number, fill: number, stroke: number,
): void {
  const path: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const ang = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    path.push(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
  }
  g.poly(path).fill(fill).stroke({ width: 2, color: stroke });
}

function formatTimer(ticksLeft: number): string {
  const sec = Math.max(0, Math.ceil(ticksLeft / 60));
  return `⏱ ${sec}`;
}
