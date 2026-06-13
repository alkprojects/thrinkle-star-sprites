import { Application, Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import type { BalanceConfig } from '../config/balance';
import { CHARACTERS } from '../config/characters';
import type { IncomingAttack, PlayerSim, SimEvent, SimState } from '../sim/types';
import { canopyTileTex, groundTileTex } from './backgrounds';
import { textTexture } from './pixelfont';
import { bake, pixStar, rgba } from './pixutil';
import {
  attackTex, bombTex, bossTex, deathTex, explosionTex, EXPLO_FRAMES, extraTex, happyStarTex,
  heartTex, orbTex, playerTex, sparkleTex, warnTex, zakoTex,
} from './sprites';
import { Label, SpritePool } from './ui';

// --- Internal low-res layout (1 unit = 1 pixel; upscaled by SCALE with nearest) ---
const FW = 160; // field width  (sim units)
const FH = 224; // field height (sim units)
const HUD_TOP = 34;
const HUD_BOT = 16;
const GAP = 6;
const MARGIN = 8;
const MARQUEE = 18;
const COL_H = HUD_TOP + FH + HUD_BOT;
const INTERNAL_W = MARGIN * 2 + FW * 3 + GAP * 2;
const INTERNAL_H = MARQUEE + COL_H + MARGIN;
const SCALE = 3;
const MAX_BOMBS = 3; // original caps the bomb-stock display at 3

const BEZEL = 0x0b0820;

// Self-centered 3-lane view: an attack incoming to a field slides in from the
// screen-side of its sender's lane (left-opponent attacks from the left, etc.)
// over its first SIDE_ENTRY_TICKS, then sits on its true sim x. Pure cosmetics.
const SIDE_ENTRY = true;
const SIDE_ENTRY_TICKS = 18;

interface Popup {
  sprite: Sprite;
  ticks: number;
  life: number;
  vy: number;
}

interface Field {
  col: Container; // whole column (shakes)
  play: Container; // clipped play area (terrain/entities)
  ground: TilingSprite; // scrolling top-down terrain (base)
  canopy: TilingSprite; // scrolling tree-crowns / features (parallax)
  gfx: Graphics; // vector bits: beams, charge ring, fever glow, bars
  pool: SpritePool; // textured entities
  popups: Popup[];
  hearts: Sprite[];
  bombs: Sprite[];
  score: Label;
  koLabel: Label;
  frame: Graphics; // field "walls" — restyled to emphasise the local lane
  name: Sprite; // "<char> (YOU)" / "(CPU)" label — rebuilt when localSeat changes
  anim: number;
}

export class Renderer {
  app = new Application();
  private cfg: BalanceConfig;
  private root = new Container();
  private fields: Field[] = [];
  private shake = [0, 0, 0];
  private timer!: Label;
  private overlay = new Container();
  private overlayDim = new Graphics();
  private overlayItems = new Container();
  private tickCount = 0;
  /** The seat this client "is": its field renders in the centre lane, opponents flank.
   *  Sim is seat-symmetric and untouched — this is pure presentation (see DECISIONS.md). */
  private localSeat: number;

  constructor(cfg: BalanceConfig, localSeat = 0) {
    this.cfg = cfg;
    this.localSeat = ((localSeat % 3) + 3) % 3;
  }

  /** Column index (0=left, 1=centre, 2=right) a seat's field is drawn in.
   *  Rotational so it's consistent for every viewer: centre=localSeat,
   *  left=(localSeat+2)%3, right=(localSeat+1)%3. */
  private laneOf(seat: number): number {
    if (seat === this.localSeat) return 1;
    if (seat === (this.localSeat + 2) % 3) return 0;
    return 2; // (localSeat + 1) % 3
  }

  /** Internal-pixel x of the left edge of a seat's column. */
  private colXOf(seat: number): number {
    return MARGIN + this.laneOf(seat) * (FW + GAP);
  }

  async init(parent: HTMLElement): Promise<void> {
    await this.app.init({
      background: BEZEL,
      width: INTERNAL_W * SCALE,
      height: INTERNAL_H * SCALE,
      antialias: false, // pixel-art: hard edges
      roundPixels: true,
      preserveDrawingBuffer: import.meta.env.DEV,
    });
    if (import.meta.env.DEV) (window as unknown as { __app: Application }).__app = this.app;
    this.app.ticker.stop(); // the game loop drives render() explicitly
    parent.appendChild(this.app.canvas);

    this.root.scale.set(SCALE);
    this.app.stage.addChild(this.root);

    // Starry bezel behind the columns
    const bezel = new Sprite(bezelTex());
    this.root.addChild(bezel);

    // Marquee
    const marquee = new Sprite(textTexture('THRINKLE STAR SPRITES', { color: '#ffe9f7', shadow: '#7a2a6a' }));
    marquee.anchor.set(0.5, 0);
    marquee.scale.set(1);
    marquee.position.set(INTERNAL_W / 2, 6);
    this.root.addChild(marquee);
    const ml = new Sprite(sparkleTex(0xffe06a, 6));
    ml.anchor.set(0.5);
    ml.position.set(INTERNAL_W / 2 - 78, 9);
    this.root.addChild(ml);
    const mr = new Sprite(sparkleTex(0xffe06a, 6));
    mr.anchor.set(0.5);
    mr.position.set(INTERNAL_W / 2 + 78, 9);
    this.root.addChild(mr);

    // Timer (Death-reaper stand-in) tucked at the right; no centre overlap with the marquee.
    this.timer = new Label(this.root, { color: '#9fe8ff', shadow: '#1a2a5a', anchor: 1 });
    this.timer.at(INTERNAL_W - MARGIN, 7);

    for (let seat = 0; seat < 3; seat++) this.fields.push(this.buildField(seat));

    // Overlay (title / game over / banners)
    this.overlayDim.rect(0, 0, INTERNAL_W, INTERNAL_H).fill({ color: 0x05030f, alpha: 0.62 });
    this.overlay.addChild(this.overlayDim);
    this.overlay.addChild(this.overlayItems);
    this.root.addChild(this.overlay);

    // Subtle CRT scanlines at device resolution (above everything, uniform & faint).
    const scan = new Sprite(scanlineTex(INTERNAL_W * SCALE, INTERNAL_H * SCALE));
    scan.alpha = 0.1;
    this.app.stage.addChild(scan);

    const resize = () => {
      const availW = window.innerWidth || INTERNAL_W * SCALE;
      const availH = window.innerHeight || INTERNAL_H * SCALE;
      const scale = Math.max(0.1, Math.min(availW / (INTERNAL_W * SCALE), availH / (INTERNAL_H * SCALE)));
      this.app.canvas.style.width = `${INTERNAL_W * SCALE * scale}px`;
      this.app.canvas.style.height = `${INTERNAL_H * SCALE * scale}px`;
    };
    window.addEventListener('resize', resize);
    resize();
    // Headless/early-layout guard: window dims can be 0 at init; re-fit next frame.
    requestAnimationFrame(resize);
  }

  private buildField(seat: number): Field {
    const ch = CHARACTERS[seat]!;
    const colX = this.colXOf(seat);
    const col = new Container();
    col.position.set(colX, MARQUEE);
    this.root.addChild(col);

    // --- Play area (sky + clouds + frame), clipped ---
    const play = new Container();
    play.position.set(0, HUD_TOP);
    col.addChild(play);

    const ground = new TilingSprite({ texture: groundTileTex(ch.theme, FW, FH), width: FW, height: FH });
    play.addChild(ground);
    const canopy = new TilingSprite({ texture: canopyTileTex(ch.theme, FW, 160), width: FW, height: FH });
    play.addChild(canopy);

    const mask = new Graphics();
    mask.rect(0, 0, FW, FH).fill(0xffffff);
    play.addChild(mask);
    play.mask = mask;

    const gfx = new Graphics();
    play.addChild(gfx);
    const pool = new SpritePool(play);

    // Frame border (the field "walls"); the local lane gets a brighter accent.
    const frame = new Graphics();
    this.styleFrame(frame, seat === this.localSeat);
    col.addChild(frame);

    // --- Top HUD: portrait, name, score, hearts ---
    const portrait = new Container();
    portrait.position.set(2, 2);
    const pBg = new Graphics();
    pBg.rect(0, 0, 20, 28).fill(0x140a26).stroke({ width: 1, color: ch.color, alignment: 0 });
    portrait.addChild(pBg);
    const pMask = new Graphics();
    pMask.rect(1, 1, 18, 26).fill(0xffffff);
    portrait.addChild(pMask);
    const pHead = new Sprite(playerTex(ch, 0));
    pHead.anchor.set(0.5, 0.4);
    pHead.position.set(10, 15);
    pHead.scale.set(1);
    pHead.mask = pMask;
    portrait.addChild(pHead);
    col.addChild(portrait);

    const name = new Sprite(this.nameTex(ch, seat));
    name.position.set(24, 3);
    col.addChild(name);

    const score = new Label(col, { color: '#fff6d0', shadow: '#3a1a2a' });
    score.at(24, 12);

    const hearts: Sprite[] = [];
    for (let i = 0; i < this.cfg.player.maxHp; i++) {
      const s = new Sprite(heartTex('full'));
      s.position.set(24 + i * 12, 21);
      col.addChild(s);
      hearts.push(s);
    }

    // --- Bottom HUD: charge gauge (left) + bombs (right) ---
    const botY = HUD_TOP + FH + 2;
    const cg = new Graphics();
    cg.position.set(2, botY);
    col.addChild(cg);
    (col as unknown as { __cg: Graphics }).__cg = cg;

    const bombs: Sprite[] = [];
    for (let i = 0; i < MAX_BOMBS; i++) {
      const s = new Sprite(bombTex());
      s.anchor.set(1, 0);
      s.position.set(FW - 2 - i * 13, botY);
      col.addChild(s);
      bombs.push(s);
    }

    const koLabel = new Label(col, { color: '#ff6b6b', outline: '#3a0a0a', scale: 2, anchor: 0.5 });
    koLabel.at(FW / 2, HUD_TOP + FH / 2);
    koLabel.visible = false;

    return { col, play, ground, canopy, gfx, pool, popups: [], hearts, bombs, score, koLabel, frame, name, anim: 0 };
  }

  /** Build the "<name> (YOU)" / "<name> (CPU)" header texture for a seat. */
  private nameTex(ch: (typeof CHARACTERS)[number], seat: number) {
    const tag = seat === this.localSeat ? ' (YOU)' : ' (CPU)';
    return textTexture(`${ch.name}${tag}`, { color: cssOf(ch.color), shadow: '#1a0a2a' });
  }

  /** Style a field's wall frame; the local lane gets a brighter gold-tinted accent. */
  private styleFrame(frame: Graphics, local: boolean): void {
    frame.clear();
    const inner = local ? 0x6a4a2a : 0x2a1a4a;
    const outer = local ? 0xffd86a : 0x6a4a9a;
    frame.rect(0, 0, FW, FH).stroke({ width: 2, color: inner, alignment: 0 });
    frame.rect(-1, -1, FW + 2, FH + 2).stroke({ width: 1, color: outer, alignment: 0 });
  }

  /** Re-point the view at a different local seat (netplay: each client its own; DEV: cycle to verify).
   *  Repositioning happens in draw(); here we refresh the per-lane chrome (YOU label + frame accent). */
  setLocalSeat(seat: number): void {
    this.localSeat = ((seat % 3) + 3) % 3;
    for (let s = 0; s < 3; s++) {
      const f = this.fields[s]!;
      f.name.texture = this.nameTex(CHARACTERS[s]!, s);
      this.styleFrame(f.frame, s === this.localSeat);
    }
  }

  // ----------------------------------------------------------------------
  // Title / overlay
  // ----------------------------------------------------------------------

  /** Tear down overlay sprites between screens — destroy the Sprites but KEEP their
   *  textures (they're shared, cached textures from textTexture()/playerTex()/etc). */
  private clearOverlay(): void {
    for (const c of this.overlayItems.removeChildren()) {
      c.destroy({ children: true, texture: false, textureSource: false });
    }
  }

  showTitle(): void {
    this.overlay.visible = true;
    this.clearOverlay();

    const star = new Sprite(happyStarTex());
    star.anchor.set(0.5);
    star.scale.set(1.6);
    star.position.set(INTERNAL_W / 2, 30);
    this.overlayItems.addChild(star);
    this.titleStar = star;

    const logo = new Sprite(textTexture('THRINKLE STAR SPRITES', { color: '#ffe9f7', outline: '#b02a8a' }));
    logo.anchor.set(0.5);
    logo.scale.set(2);
    logo.position.set(INTERNAL_W / 2, 66);
    this.overlayItems.addChild(logo);

    const sub = new Sprite(textTexture('THREE SPRITES ENTER - ONE SPRITE TWINKLES', { color: '#ffd86a', shadow: '#5a2a1a' }));
    sub.anchor.set(0.5);
    sub.position.set(INTERNAL_W / 2, 86);
    this.overlayItems.addChild(sub);

    // Character line-up (names are long, so space columns wide and label on two lines)
    for (let i = 0; i < 3; i++) {
      const colX = INTERNAL_W / 2 + (i - 1) * 150;
      const s = new Sprite(playerTex(CHARACTERS[i]!, 0));
      s.anchor.set(0.5);
      s.scale.set(2.4);
      s.position.set(colX, 138);
      this.overlayItems.addChild(s);
      const parts = CHARACTERS[i]!.name.split(' ');
      parts.forEach((word, w) => {
        const nm = new Sprite(textTexture(word, { color: cssOf(CHARACTERS[i]!.color), shadow: '#1a0a2a' }));
        nm.anchor.set(0.5);
        nm.position.set(colX, 162 + w * 11);
        this.overlayItems.addChild(nm);
      });
      const tier = new Sprite(textTexture(`PWR ${CHARACTERS[i]!.stats.powerTier}  SPD ${CHARACTERS[i]!.stats.speedTier}`, { color: '#cfe0ff', shadow: '#10204a' }));
      tier.anchor.set(0.5);
      tier.position.set(colX, 186);
      this.overlayItems.addChild(tier);
    }

    const lines = [
      'MOVE: ARROWS / WASD    FIRE: X / SPACE  (HOLD=CHARGE)',
      'BOMB: Z / SHIFT    MUTE: M',
    ];
    lines.forEach((t, i) => {
      const l = new Sprite(textTexture(t, { color: '#cfe0ff', shadow: '#10204a' }));
      l.anchor.set(0.5);
      l.position.set(INTERNAL_W / 2, 196 + i * 12);
      this.overlayItems.addChild(l);
    });

    const press = new Sprite(textTexture('PRESS ENTER TO PLAY', { color: '#ffffff', outline: '#6a1a4a' }));
    press.anchor.set(0.5);
    press.position.set(INTERNAL_W / 2, 240);
    this.overlayItems.addChild(press);
    this.blinker = press;
  }

  private blinker: Sprite | null = null;
  private titleStar: Sprite | null = null;

  showGameOver(winner: number): void {
    this.overlay.visible = true;
    this.titleStar = null;
    this.clearOverlay();
    const name = winner >= 0 ? CHARACTERS[winner]!.name : 'NOBODY';
    const title = winner === 0 ? 'YOU WIN!' : `${name} WINS!`;
    const logo = new Sprite(textTexture(title, { color: '#ffe06a', outline: '#7a3a1a' }));
    logo.anchor.set(0.5);
    logo.scale.set(3);
    logo.position.set(INTERNAL_W / 2, INTERNAL_H * 0.42);
    this.overlayItems.addChild(logo);
    if (winner >= 0) {
      const s = new Sprite(playerTex(CHARACTERS[winner]!, 0));
      s.anchor.set(0.5);
      s.scale.set(3);
      s.position.set(INTERNAL_W / 2, INTERNAL_H * 0.58);
      this.overlayItems.addChild(s);
    }
    const press = new Sprite(textTexture('PRESS ENTER FOR A REMATCH', { color: '#ffffff', shadow: '#3a1a2a' }));
    press.anchor.set(0.5);
    press.position.set(INTERNAL_W / 2, INTERNAL_H * 0.78);
    this.overlayItems.addChild(press);
    this.blinker = press;
  }

  hideOverlay(): void {
    this.overlay.visible = false;
    this.blinker = null;
    this.titleStar = null;
  }

  // ----------------------------------------------------------------------
  // Events → transient visuals
  // ----------------------------------------------------------------------

  applyEvents(events: SimEvent[], state: SimState): void {
    for (const e of events) {
      switch (e.type) {
        case 'player-hit':
          this.shake[e.seat] = 9;
          break;
        case 'bomb':
          this.shake[e.seat] = 14;
          this.popup(e.seat, FW / 2, FH * 0.5, 'BOMB!', '#ffd86a', 2);
          break;
        case 'chain':
          if (e.size >= 4) {
            const p = state.players[e.seat]!;
            this.popup(e.seat, p.x, p.y - 22, `CHAIN ${e.size}`, '#fff3c4', e.size >= 8 ? 2 : 1);
          }
          break;
        case 'reflect': {
          const p = state.players[e.seat]!;
          this.popup(e.seat, p.x, p.y - 30, 'REVERSE!', '#9fe8ff', 1);
          break;
        }
        case 'fever-start':
          this.popup(e.seat, FW / 2, FH * 0.32, 'FEVER!!', '#ffe06a', 3);
          break;
        case 'charge-special': {
          const p = state.players[e.seat]!;
          const msg = e.tier === 'boss' ? 'MAX BOSS!' : 'SPECIAL!';
          this.popup(e.seat, p.x, p.y - 26, msg, e.tier === 'boss' ? '#ff8a8a' : '#9fe8ff', 2);
          break;
        }
        case 'boss-reversed':
          this.popup(e.seat, FW / 2, FH * 0.32, 'REVERSAL!', '#ffd86a', 2);
          break;
        case 'attack-sent':
          if (e.tier === 'boss') this.popup(e.to, FW / 2, FH * 0.2, 'BOSS!', '#ff8a8a', 2);
          break;
        case 'death-spawn':
          this.shake[e.seat] = 10;
          this.popup(e.seat, FW / 2, FH * 0.28, 'DEATH!', '#c8b0ff', 3);
          break;
        case 'death-killed':
          this.popup(e.seat, FW / 2, FH * 0.4, 'BANISHED', '#9fe8ff', 1);
          break;
        case 'death-ko':
          this.shake[e.seat] = 16;
          this.popup(e.seat, FW / 2, FH * 0.5, 'REAPED!', '#ff5a5a', 2);
          break;
        case 'eliminated':
          this.popup(e.seat, FW / 2, FH * 0.5, 'K.O.', '#ff6b6b', 2);
          break;
      }
    }
  }

  private popup(seat: number, x: number, y: number, msg: string, color: string, scale: number): void {
    const f = this.fields[seat]!;
    const tex = textTexture(msg, { color, outline: '#2a0a1a' });
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.scale.set(scale);
    s.position.set(Math.round(this.colXOf(seat) + x), Math.round(MARQUEE + HUD_TOP + y));
    this.root.addChild(s);
    f.popups.push({ sprite: s, ticks: 50, life: 50, vy: -0.5 });
  }

  /** Advance time-based visuals once per SIM TICK (frame-rate independent). */
  tickVisuals(): void {
    this.tickCount++;
    for (let seat = 0; seat < 3; seat++) {
      const f = this.fields[seat]!;
      if (this.shake[seat]! > 0) this.shake[seat]!--;
      f.anim++;
      // Continuous downward terrain flow (the original's sense of speed, FIDELITY_GAPS §0b);
      // the closer canopy parallaxes a touch faster than the ground.
      f.ground.tilePosition.y += 0.85;
      f.canopy.tilePosition.y += 1.15;
      for (const pop of f.popups) {
        pop.ticks--;
        pop.sprite.y += pop.vy;
        pop.sprite.alpha = Math.min(1, pop.ticks / 14);
        if (pop.ticks <= 0) pop.sprite.destroy();
      }
      f.popups = f.popups.filter((p) => p.ticks > 0);
    }
  }

  private frameCount = 0;

  render(): void {
    // Per-frame (not per-tick) so the title/game-over overlay animates even when the sim
    // isn't running (draw() is skipped on those screens).
    this.frameCount++;
    if (this.overlay.visible) {
      if (this.blinker) this.blinker.visible = Math.floor(this.frameCount / 30) % 2 === 0;
      if (this.titleStar) {
        this.titleStar.y = 30 + Math.sin(this.frameCount * 0.05) * 2;
        this.titleStar.rotation = Math.sin(this.frameCount * 0.025) * 0.08;
      }
    }
    this.app.renderer.render(this.app.stage);
  }

  // ----------------------------------------------------------------------
  // Per-frame draw
  // ----------------------------------------------------------------------

  draw(state: SimState): void {
    const cfg = this.cfg;
    const toDeath = cfg.death.startTicks - state.tick;
    this.timer.set(toDeath > 0 ? `DEATH IN ${Math.ceil(toDeath / 60)}` : 'DEATH');

    for (let seat = 0; seat < 3; seat++) {
      const p = state.players[seat]!;
      const f = this.fields[seat]!;
      const ch = CHARACTERS[seat]!;
      const colX = this.colXOf(seat);
      const sh = this.shake[seat]!;
      f.col.position.set(
        colX + (sh > 0 ? Math.round((Math.random() - 0.5) * sh) : 0),
        MARQUEE + (sh > 0 ? Math.round((Math.random() - 0.5) * sh) : 0),
      );

      this.drawHud(seat, p);
      f.koLabel.visible = !p.alive;

      const g = f.gfx;
      g.clear();
      f.pool.begin();

      if (!p.alive) {
        f.ground.alpha = 0.4;
        f.canopy.alpha = 0.25;
        f.pool.end();
        continue;
      }
      f.ground.alpha = 1;
      f.canopy.alpha = 0.95;

      // Fever field glow
      if (p.feverTicks > 0) {
        const pulse = 0.5 + Math.sin(this.tickCount * 0.4) * 0.2;
        g.rect(0, 0, FW, FH).fill({ color: 0xffe06a, alpha: 0.12 * pulse });
        g.rect(1, 1, FW - 2, FH - 2).stroke({ width: 2, color: 0xffe06a, alpha: 0.7 * pulse, alignment: 0 });
      }

      // Incoming-attack warnings (top edge)
      for (const t of state.transit) {
        if (t.target !== seat || t.ticksLeft > 36) continue;
        if (Math.floor(this.tickCount / 4) % 2 === 0) {
          const color = t.tier === 'boss' ? 0xff5a5a : t.tier === 'extra' ? 0xffa94f : CHARACTERS[t.originalSender]!.color;
          f.pool.put(warnTex(color), t.entryX, 6);
        }
      }

      // Zako — colour = current HP tier (a direct readout), size = max tier
      for (const z of p.zako) {
        const tier = Math.max(1, Math.min(5, Math.ceil(z.hp ?? 1)));
        const s = f.pool.put(zakoTex(tier, Math.floor((f.anim + z.id * 7) / 8)), z.x, z.y);
        s.scale.set(1 + ((z.maxHp ?? 1) - 1) * cfg.waves.tierRadiusScale);
      }

      // Fever orbs — detonate with a chain for FEVER
      for (const o of p.orbs) {
        f.pool.put(orbTex(Math.floor(f.anim / 6) % 4), o.x, o.y);
      }

      // Player shots
      for (const shot of p.shots) {
        f.pool.put(sparkleTex(ch.accent, 4), shot.x, shot.y).scale.set(0.8);
      }

      // Charge beams — bright vertical lasers shooting up the field (Attack Stopper)
      for (const beam of p.beams) {
        const bw = beam.halfWidth;
        const topY = Math.max(0, beam.y - 110);
        const h = beam.y - topY + 4;
        g.rect(beam.x - bw, topY, bw * 2, h).fill({ color: ch.color, alpha: 0.28 });
        g.rect(beam.x - bw * 0.5, topY, bw, h).fill({ color: ch.accent, alpha: 0.55 });
        g.rect(beam.x - 1.5, topY, 3, h).fill({ color: 0xffffff, alpha: 0.9 });
        f.pool.put(sparkleTex(0xffffff, 7), beam.x, beam.y).scale.set(1.1);
      }

      // Explosions — scale with blast radius (big purple-zako blasts are bigger)
      for (const ex of p.explosions) {
        const t = 1 - ex.ticksLeft / cfg.chain.explosionTicks;
        const es = f.pool.put(explosionTex(Math.floor(t * EXPLO_FRAMES)), ex.x, ex.y);
        es.scale.set(ex.radius / cfg.chain.explosionRadius);
      }

      // Incoming attacks
      for (const a of p.incoming) this.drawAttack(f, a, seat);

      // Death (the reaper) — pursues this player; contact ends the round
      if (p.death) {
        const d = p.death;
        const ds = f.pool.put(deathTex(Math.floor(f.anim / 8) % 2), d.x, d.y);
        if (d.age < 16 && Math.floor(this.tickCount / 3) % 2 === 0) ds.alpha = 0.5; // fade-in
        if (d.maxHp > 1) {
          const frac = Math.max(0, d.hp / d.maxHp);
          g.rect(d.x - 9, d.y - 16, 18, 3).fill({ color: 0x1a0a1a, alpha: 0.85 });
          g.rect(d.x - 8, d.y - 15, 16 * frac, 1).fill(0xff3a3a);
        }
      }

      // Player
      const flick = p.iframes > 0 && Math.floor(this.tickCount / 3) % 2 === 0;
      if (!flick) {
        const frame = Math.floor(f.anim / 16) % 2;
        const ps = f.pool.put(playerTex(ch, frame), p.x, p.y + 2);
        ps.anchor.set(0.5, 0.62); // feet-ish anchor so the body sits over the hitbox
        // Fever: the character flashes yellow (spec §6).
        if (p.feverTicks > 0 && Math.floor(this.tickCount / 4) % 2 === 0) ps.tint = 0xffe04d;
        // Charge ring
        if (p.chargeTicks >= cfg.shot.chargeTicksLv1) {
          const lv2 = p.chargeTicks >= cfg.shot.chargeTicksLv2;
          const rs = f.pool.put(sparkleTex(lv2 ? 0xffe06a : ch.accent, 8), p.x, p.y);
          const pulse = 1 + Math.sin(this.tickCount * 0.4) * 0.2;
          rs.scale.set(pulse * (lv2 ? 1.3 : 1));
          rs.alpha = 0.85;
          rs.rotation = this.tickCount * 0.1;
        }
      }

      // Dizzy: little stars circling the head after a zako clip (§5.4)
      if (p.dizzyTicks > 0) {
        const a = this.tickCount * 0.2;
        for (let k = 0; k < 3; k++) {
          const ang = a + (k / 3) * Math.PI * 2;
          const ds = f.pool.put(sparkleTex(0xfff2a8, 5), p.x + Math.cos(ang) * 7, p.y - 14 + Math.sin(ang) * 2.5);
          ds.scale.set(0.7);
        }
      }

      f.pool.end();
    }
  }

  private drawAttack(f: Field, a: IncomingAttack, seat: number): void {
    const sender = CHARACTERS[a.originalSender];
    const senderColor = sender?.color ?? 0xffffff;
    const accent = sender?.accent ?? 0xffffff;
    const theme = sender?.attackTheme ?? 'frisbee';
    // Bonus fidelity: slide the attack in from the screen-side of its sender's lane
    // during its first SIDE_ENTRY_TICKS so 3-way pressure reads at a glance. Cosmetic
    // only — the sim x (a.x) is unchanged; hitboxes are unaffected.
    const rx = this.entryX(a, seat);
    if (a.tier === 'boss') {
      const bs = f.pool.put(bossTex(theme, Math.floor(f.anim / 18) % 2), rx, a.y);
      // Spawn telegraph: a brief white flash as the boss materialises (spec §6).
      if (a.age < 48 && Math.floor(this.tickCount / 4) % 2 === 0) {
        bs.tint = 0xffffff;
        bs.alpha = 0.7;
      }
      // HP bar (denominator = this sender's boss HP)
      const maxBossHp = sender?.stats.bossHp ?? this.cfg.attacks.bossHp;
      const frac = Math.max(0, a.hp / maxBossHp);
      f.gfx.rect(rx - 18, a.y - 30, 36, 4).fill({ color: 0x2a0a1a, alpha: 0.8 });
      f.gfx.rect(rx - 17, a.y - 29, 34 * frac, 2).fill(0xff6b8a);
    } else if (a.tier === 'extra') {
      f.pool.put(extraTex(theme, Math.floor(f.anim / 10) % 2), rx, a.y);
    } else {
      const sz = a.maxHp ?? a.hp;
      const size = sz <= 2 ? 0 : sz <= 3 ? 1 : sz <= 4 ? 2 : 3;
      const s = f.pool.put(attackTex(theme, senderColor, accent, size, a.tier === 'reverse'), rx, a.y);
      // A reflected "flashing ghost" pulses bright (the original's flashing reverse).
      if (a.tier === 'reverse' && Math.floor(this.tickCount / 4) % 2 === 0) s.tint = 0xfff2a8;
    }
  }

  /** Render x for an incoming attack: eased from the sender-side field edge to its sim x
   *  over SIDE_ENTRY_TICKS, then exactly a.x. dir<0 → sender's lane is left of this field. */
  private entryX(a: IncomingAttack, seat: number): number {
    if (!SIDE_ENTRY || a.age >= SIDE_ENTRY_TICKS) return a.x;
    const dir = Math.sign(this.laneOf(a.originalSender) - this.laneOf(seat));
    if (dir === 0) return a.x;
    const k = a.age / SIDE_ENTRY_TICKS;
    const ease = 1 - (1 - k) * (1 - k); // ease-out
    const edgeX = dir < 0 ? -6 : FW + 6; // just off the sender-side wall
    return edgeX + (a.x - edgeX) * ease;
  }

  private drawHud(seat: number, p: PlayerSim): void {
    const cfg = this.cfg;
    const f = this.fields[seat]!;
    f.score.set(numStr(p.stats.damageDealt * 100 + p.stats.attacksSent * 250 + p.stats.chains * 50));

    // Hearts
    for (let i = 0; i < cfg.player.maxHp; i++) {
      const remaining = p.hp - i;
      const kind = remaining >= 1 ? 'full' : remaining >= 0.5 ? 'half' : 'empty';
      f.hearts[i]!.texture = heartTex(kind);
    }

    // Bombs (display caps at MAX_BOMBS)
    for (let i = 0; i < MAX_BOMBS; i++) f.bombs[i]!.visible = i < p.bombs;

    // Charge gauge: the banked METER (1 / 2 / MAX) fills from kills and is spent on
    // specials/boss; a live cursor shows how far the current hold has charged.
    const cg = (f.col as unknown as { __cg: Graphics }).__cg;
    cg.clear();
    const gw = 64;
    const gh = 6;
    cg.rect(0, 4, gw, gh).fill(0x1a1030).stroke({ width: 1, color: 0x5a3a7a, alignment: 0 });
    const meter = Math.max(0, Math.min(1, p.chargeMeter));
    const meterCol = meter >= cfg.charge.maxThreshold ? 0xffe06a : meter >= cfg.charge.lv2Threshold ? 0xff8a3d : 0xff4400;
    if (meter > 0) cg.rect(1, 5, (gw - 2) * meter, gh - 2).fill(meterCol);
    // "1 / 2 / MAX" notch dividers
    for (const mark of [cfg.charge.meterLv1Mark, cfg.charge.lv2Threshold]) {
      cg.rect(Math.round(mark * gw), 3, 1, gh + 2).fill(0xfff0c0);
    }
    // live hold-charge cursor (blue → orange Lv1 → gold Lv2 → white MAX)
    if (p.chargeTicks >= 0) {
      const hold = Math.min(1, p.chargeTicks / p.chargeMax);
      const cxp = Math.round(1 + (gw - 2) * hold);
      const lvCol = p.chargeTicks >= p.chargeMax ? 0xffffff
        : p.chargeTicks >= p.chargeLv2 ? 0xffe06a
        : p.chargeTicks >= p.chargeLv1 ? 0xff8a3d : 0x9fe8ff;
      cg.rect(cxp - 1, 2, 2, gh + 4).fill(lvCol);
    }
    // fever meter as a thin underline of the gauge (our meter-based fever stand-in)
    const fever = p.feverTicks > 0 ? 1 : p.feverMeter / 100;
    cg.rect(0, 4 + gh + 1, gw * Math.min(1, fever), 2).fill(p.feverTicks > 0 ? 0xffe06a : 0xb38aff);
  }
}

// ---------------------------------------------------------------------------
// One-off baked textures used by the chrome.
// ---------------------------------------------------------------------------

let _bezel: ReturnType<typeof bake> | null = null;
function bezelTex() {
  if (_bezel) return _bezel;
  _bezel = bake(INTERNAL_W, INTERNAL_H, (ctx, w, h) => {
    ctx.fillStyle = rgba(BEZEL);
    ctx.fillRect(0, 0, w, h);
    // faint vertical gradient + sparse twinkles in the bezel
    for (let i = 0; i < 60; i++) {
      const x = (i * 71) % w;
      const y = (i * 43) % h;
      pixStar(ctx, x, y, 4, 1.2, 0.5, rgba(0xffffff, 0.18 + ((i * 17) % 10) / 50));
    }
  });
  return _bezel;
}

let _scan: ReturnType<typeof bake> | null = null;
function scanlineTex(w: number, h: number) {
  if (_scan && _scan.width === w && _scan.height === h) return _scan;
  _scan = bake(w, h, (ctx, cw, ch) => {
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (let y = 0; y < ch; y += 2) ctx.fillRect(0, y, cw, 1);
  });
  return _scan;
}

function cssOf(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
}

function numStr(n: number): string {
  return String(Math.floor(n)).padStart(6, '0');
}
