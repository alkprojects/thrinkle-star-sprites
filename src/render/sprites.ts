/**
 * Procedural pixel-art sprite factory. Every organic game object is drawn once into a
 * tiny offscreen canvas (1 internal unit = 1 px) and cached as a NEAREST texture, so it
 * upscales into crisp Neo-Geo-style pixels. Sprites are drawn centered; the renderer
 * sets anchor 0.5. All art is ORIGINAL — evoking Twinkle Star Sprites' cute fantasy
 * look without reproducing any ADK asset.
 */
import { Texture } from 'pixi.js';
import type { AttackTheme, CharacterDef } from '../config/characters';
import { bake, pixCircle, pixStar, px, rgba, shade } from './pixutil';

const OUTLINE = '#2a1a3a';

const cache = new Map<string, Texture>();
function cached(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = bake(w, h, (ctx) => draw(ctx));
  cache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Zako (popcorn fairies) — color-coded by remaining HP per GAME_MECHANICS §3.1.
// ---------------------------------------------------------------------------

export const ZAKO_TIER_COLORS: Record<number, number> = {
  5: 0xb46cff, // purple
  4: 0x5b8cff, // blue
  3: 0x5fd36a, // green
  2: 0xffe04d, // yellow
  1: 0xff5d5d, // red
};

/** A round fairy with a twinkle on its head, two big eyes and a smile. `frame` flaps wings. */
export function zakoTex(tier: number, frame: number): Texture {
  const base = ZAKO_TIER_COLORS[tier] ?? ZAKO_TIER_COLORS[1]!;
  return cached(`zako:${tier}:${frame}`, 16, 16, (ctx) => {
    const cx = 8;
    const cy = 9;
    const r = 5.5;
    const wing = frame % 2 === 0 ? 0 : 1;
    // wings
    ctx.fillStyle = rgba(shade(base, 0.55), 0.9);
    ctx.fillRect(1, cy - 1 - wing, 3, 3);
    ctx.fillRect(12, cy - 1 - wing, 3, 3);
    // body outline + body
    pixCircle(ctx, cx, cy, r + 1, OUTLINE);
    pixCircle(ctx, cx, cy, r, rgba(base));
    // highlight
    pixCircle(ctx, cx - 1.5, cy - 1.5, 2, rgba(shade(base, 0.5)));
    // eyes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 3, cy - 1, 2, 3);
    ctx.fillRect(cx + 1, cy - 1, 2, 3);
    ctx.fillStyle = '#241038';
    ctx.fillRect(cx - 2, cy, 1, 2);
    ctx.fillRect(cx + 2, cy, 1, 2);
    // smile
    ctx.fillStyle = '#241038';
    ctx.fillRect(cx - 1, cy + 3, 3, 1);
    // head twinkle
    pixStar(ctx, cx, 2, 4, 2.2, 0.9, '#fff6d0');
  });
}

// ---------------------------------------------------------------------------
// Player sprites — three ORIGINAL caricature humans (24×28 chibi, our art).
// ---------------------------------------------------------------------------

export function playerTex(def: CharacterDef, frame: number): Texture {
  return cached(`player:${def.name}:${frame}`, 24, 28, (ctx) => {
    if (def.kind === 'danny') drawDanny(ctx, def, frame);
    else if (def.kind === 'tyleru') drawTyleru(ctx, def, frame);
    else drawAlex(ctx, def, frame);
  });
}

/** A small spinning frisbee disc (Danny's signature object). */
function drawDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: number, r = 4): void {
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - r, cy - 1, r * 2 + 1, 3);
  ctx.fillStyle = rgba(color);
  ctx.fillRect(cx - r + 1, cy, r * 2 - 1, 1);
  ctx.fillStyle = rgba(shade(color, 0.4));
  ctx.fillRect(cx - 1, cy, 3, 1);
}

function drawDanny(ctx: CanvasRenderingContext2D, def: CharacterDef, frame: number): void {
  const cx = 11;
  const bob = frame % 2;
  const top = 4 + bob;
  const skin = rgba(def.skin);
  // chubby torso in a green tee
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - 7, top + 12, 15, 12);
  ctx.fillStyle = rgba(def.color);
  ctx.fillRect(cx - 6, top + 13, 13, 10);
  ctx.fillStyle = rgba(shade(def.color, -0.28));
  ctx.fillRect(cx - 6, top + 19, 13, 4); // belly shadow
  // stubby arms
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - 9, top + 13, 3, 6);
  ctx.fillRect(cx + 7, top + 13, 3, 6);
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 8, top + 14, 2, 4);
  ctx.fillRect(cx + 8, top + 14, 2, 4);
  // big round head
  pixCircle(ctx, cx, top + 6, 5.5, OUTLINE);
  pixCircle(ctx, cx, top + 6, 4.6, skin);
  // blonde bowl hair
  ctx.fillStyle = rgba(def.hair);
  ctx.fillRect(cx - 5, top + 1, 11, 3);
  ctx.fillRect(cx - 6, top + 3, 2, 3);
  ctx.fillRect(cx + 4, top + 3, 2, 3);
  ctx.fillStyle = rgba(shade(def.hair, 0.35));
  ctx.fillRect(cx - 3, top + 1, 4, 1);
  // rosy cheeks + eyes + grin
  ctx.fillStyle = rgba(0xff8a8a, 0.7);
  ctx.fillRect(cx - 4, top + 7, 2, 2);
  ctx.fillRect(cx + 2, top + 7, 2, 2);
  ctx.fillStyle = '#3a2150';
  ctx.fillRect(cx - 2, top + 5, 1, 2);
  ctx.fillRect(cx + 1, top + 5, 1, 2);
  ctx.fillRect(cx - 2, top + 8, 4, 1);
  // a frisbee spinning at his side
  drawDisc(ctx, 20, top + 15 + bob, def.accent, 3);
}

function drawTyleru(ctx: CanvasRenderingContext2D, def: CharacterDef, frame: number): void {
  const cx = 11;
  const bob = frame % 2;
  const top = 4 + bob;
  const skin = rgba(def.skin);
  // heavyset torso in a dark burgundy tee
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - 8, top + 12, 17, 12);
  ctx.fillStyle = rgba(def.color);
  ctx.fillRect(cx - 7, top + 13, 15, 10);
  ctx.fillStyle = rgba(shade(def.color, -0.3));
  ctx.fillRect(cx - 7, top + 19, 15, 4);
  // arms
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - 10, top + 13, 3, 6);
  ctx.fillRect(cx + 8, top + 13, 3, 6);
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 9, top + 14, 2, 4);
  ctx.fillRect(cx + 9, top + 14, 2, 4);
  // big round head, jowly
  pixCircle(ctx, cx, top + 6, 5.6, OUTLINE);
  pixCircle(ctx, cx, top + 6, 4.7, skin);
  // thinning dark hair: only sides + a sparse top wisp, bald crown
  ctx.fillStyle = rgba(def.hair);
  ctx.fillRect(cx - 5, top + 3, 2, 4);
  ctx.fillRect(cx + 4, top + 3, 2, 4);
  ctx.fillRect(cx - 4, top + 2, 8, 1); // receding hairline
  px(ctx, cx - 1, top + 1, 2, 1, rgba(def.hair)); // lonely wisp
  // tired eyes (with bags) + flat mouth
  ctx.fillStyle = '#3a2150';
  ctx.fillRect(cx - 2, top + 6, 1, 1);
  ctx.fillRect(cx + 1, top + 6, 1, 1);
  ctx.fillStyle = rgba(shade(def.skin, -0.18));
  ctx.fillRect(cx - 2, top + 7, 1, 1);
  ctx.fillRect(cx + 1, top + 7, 1, 1);
  // stubble (dark speckle across jaw)
  ctx.fillStyle = rgba(0x2a2018, 0.45);
  ctx.fillRect(cx - 4, top + 9, 8, 2);
  ctx.fillStyle = '#3a2150';
  ctx.fillRect(cx - 1, top + 9, 3, 1);
  // a film reel by his side
  filmReel(ctx, 20, top + 15 + bob, def.accent, 3.5);
}

function drawAlex(ctx: CanvasRenderingContext2D, def: CharacterDef, frame: number): void {
  const cx = 11;
  const bob = frame % 2;
  const top = 4 + bob;
  const skin = rgba(def.skin);
  // bare muscular torso (tan), broad shoulders, pec + ab shading
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - 7, top + 11, 15, 9);
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 6, top + 12, 13, 7);
  ctx.fillStyle = rgba(shade(def.skin, -0.18));
  ctx.fillRect(cx - 1, top + 12, 1, 7); // chest centre line
  ctx.fillRect(cx - 4, top + 16, 9, 1); // ab line
  // blue shorts
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - 6, top + 19, 13, 5);
  ctx.fillStyle = rgba(def.color);
  ctx.fillRect(cx - 5, top + 20, 11, 3);
  // big arms (flexed)
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - 10, top + 11, 3, 8);
  ctx.fillRect(cx + 8, top + 11, 3, 8);
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 9, top + 12, 2, 6);
  ctx.fillRect(cx + 9, top + 12, 2, 6);
  // head, brown hair
  pixCircle(ctx, cx, top + 6, 5, OUTLINE);
  pixCircle(ctx, cx, top + 6, 4.1, skin);
  ctx.fillStyle = rgba(def.hair);
  ctx.fillRect(cx - 4, top + 1, 9, 3);
  ctx.fillRect(cx - 5, top + 3, 2, 2);
  ctx.fillRect(cx + 4, top + 3, 2, 2);
  ctx.fillStyle = rgba(shade(def.hair, 0.3));
  ctx.fillRect(cx + 1, top + 1, 3, 1);
  // black sunglasses across the eyes + smirk
  ctx.fillStyle = '#15151f';
  ctx.fillRect(cx - 4, top + 5, 9, 2);
  ctx.fillStyle = rgba(0xffffff, 0.7);
  ctx.fillRect(cx - 3, top + 5, 1, 1);
  ctx.fillStyle = '#3a2150';
  ctx.fillRect(cx, top + 8, 3, 1);
  // a dumbbell in hand
  dumbbell(ctx, 19, top + 14 + bob, def.accent, 4);
}

/** A film reel: outlined circle with reel holes (Tyleru's object). */
function filmReel(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: number, r: number): void {
  pixCircle(ctx, cx, cy, r + 0.6, OUTLINE);
  pixCircle(ctx, cx, cy, r, rgba(color));
  pixCircle(ctx, cx, cy, r * 0.32, OUTLINE);
  // reel holes
  ctx.fillStyle = rgba(shade(color, -0.4));
  for (let a = 0; a < 4; a++) {
    const ang = (a / 4) * Math.PI * 2 + 0.4;
    px(ctx, cx + Math.cos(ang) * r * 0.6, cy + Math.sin(ang) * r * 0.6, 1, 1, rgba(shade(color, -0.4)));
  }
}

/** A dumbbell: two plates joined by a bar (Alex's object). */
function dumbbell(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: number, w: number): void {
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - w, cy - 2, w * 2 + 1, 4);
  ctx.fillStyle = rgba(color);
  ctx.fillRect(cx - w + 0.5, cy - 2, 2, 4); // left plate
  ctx.fillRect(cx + w - 1.5, cy - 2, 2, 4); // right plate
  ctx.fillStyle = '#c8d0e0';
  ctx.fillRect(cx - w + 2.5, cy - 0.5, w * 2 - 5, 1); // chrome bar
}

// ---------------------------------------------------------------------------
// Attack "ghosts" — the themed projectiles a chain sends at opponents (frisbee /
// film reel / weight), colored by sender. A destroyed one returns as a flashing
// "reverse"; reflecting that sends a special. size: 0 small … 3 biggest.
// ---------------------------------------------------------------------------

export function attackTex(theme: AttackTheme, color: number, accent: number, size: number, reverse: boolean): Texture {
  const r = [4, 5.5, 7, 8.5][size] ?? 5.5;
  const dim = Math.ceil(r * 2) + 12;
  return cached(`atk:${theme}:${color}:${accent}:${size}:${reverse ? 'r' : 'n'}`, dim, dim, (ctx) => {
    const cx = dim / 2;
    const cy = dim / 2;
    // soft motion trail (objects descend → trail points up)
    for (let i = 1; i <= 3; i++) {
      const tr = r * (1 - i * 0.22);
      pixCircle(ctx, cx, cy - r - i * 2, tr, rgba(shade(color, 0.2), 0.36 - i * 0.1));
    }
    pixCircle(ctx, cx, cy, r + 2, rgba(shade(color, 0.3), 0.3)); // glow
    if (theme === 'frisbee') {
      // flat spinning disc seen edge-on-ish
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(cx - r, cy - r * 0.55, r * 2 + 1, r * 1.1 + 1);
      ctx.fillStyle = rgba(color);
      ctx.fillRect(cx - r + 1, cy - r * 0.55 + 1, r * 2 - 1, r * 1.1 - 1);
      ctx.fillStyle = rgba(accent);
      ctx.fillRect(cx - r + 1, cy - 1, r * 2 - 1, 2); // rim band
      ctx.fillStyle = rgba(shade(color, 0.5));
      pixCircle(ctx, cx, cy, r * 0.3, rgba(shade(color, 0.5)));
    } else if (theme === 'film') {
      // film reel: round, with hub + holes
      pixCircle(ctx, cx, cy, r, OUTLINE);
      pixCircle(ctx, cx, cy, r - 0.7, rgba(color));
      pixCircle(ctx, cx, cy, r * 0.3, OUTLINE);
      ctx.fillStyle = rgba(accent);
      for (let a = 0; a < 5; a++) {
        const ang = (a / 5) * Math.PI * 2;
        px(ctx, cx + Math.cos(ang) * r * 0.62, cy + Math.sin(ang) * r * 0.62, 1, 1, rgba(accent));
      }
    } else {
      // weight plate: thick ring + chrome hub
      pixCircle(ctx, cx, cy, r, OUTLINE);
      pixCircle(ctx, cx, cy, r - 0.7, rgba(color));
      pixCircle(ctx, cx, cy, r * 0.62, rgba(shade(color, -0.25)));
      pixCircle(ctx, cx, cy, r * 0.34, '#c8d0e0');
      px(ctx, cx - r * 0.3, cy - r * 0.3, 1, 1, '#ffffff');
    }
    if (reverse) {
      // flashing return-attack ring (original's green/purple flash → our bright chevrons)
      ctx.fillStyle = '#fff2a8';
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        px(ctx, cx + Math.cos(ang) * (r + 1.5), cy + Math.sin(ang) * (r + 1.5), 1, 1, '#fff2a8');
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Extra ("special") attack — the indestructible creature a Lv2 charge sends.
// One themed beast per character. 24×22.
// ---------------------------------------------------------------------------

export function extraTex(theme: AttackTheme, frame: number): Texture {
  return cached(`extra:${theme}:${frame}`, 24, 22, (ctx) => {
    const cx = 12;
    const cy = 12;
    const w = frame % 2;
    if (theme === 'frisbee') {
      // Danny Donkey: an angry flying donkey head, long ears
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(cx - 6, cy - 9 - w, 3, 7);
      ctx.fillRect(cx + 3, cy - 9 - w, 3, 7);
      ctx.fillStyle = '#c8c2bd';
      ctx.fillRect(cx - 5, cy - 8 - w, 1, 5);
      ctx.fillRect(cx + 4, cy - 8 - w, 1, 5);
      pixCircle(ctx, cx, cy, 8, OUTLINE);
      pixCircle(ctx, cx, cy, 7, '#b8b2ad'); // grey donkey
      ctx.fillStyle = '#8a847e';
      ctx.fillRect(cx - 3, cy + 2, 7, 4); // muzzle
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(cx - 2, cy + 4, 1, 1);
      ctx.fillRect(cx + 2, cy + 4, 1, 1); // nostrils
      ctx.fillStyle = '#5a1414';
      ctx.fillRect(cx - 4, cy - 2, 3, 2);
      ctx.fillRect(cx + 2, cy - 2, 3, 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 4, cy - 2, 1, 1);
      ctx.fillRect(cx + 2, cy - 2, 1, 1);
    } else if (theme === 'film') {
      // Heavy Tyleru: a movie-monster blob with one big eye + fangs
      pixCircle(ctx, cx, cy, 8, OUTLINE);
      pixCircle(ctx, cx, cy, 7, '#5fa85a'); // green kaiju
      pixCircle(ctx, cx, cy + 1, 4, '#7fc878');
      // spikes on top
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(cx - 5, cy - 9 - w, 2, 3);
      ctx.fillRect(cx - 1, cy - 10 - w, 2, 3);
      ctx.fillRect(cx + 3, cy - 9 - w, 2, 3);
      // one big angry eye
      pixCircle(ctx, cx, cy - 1, 3, '#fff');
      pixCircle(ctx, cx, cy - 1, 1.6, '#5a1414');
      // fangs
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 3, cy + 5, 1, 2);
      ctx.fillRect(cx + 2, cy + 5, 1, 2);
    } else {
      // Senseitional Alex: a flexed muscle-arm fist
      pixCircle(ctx, cx, cy - 1, 7, OUTLINE);
      pixCircle(ctx, cx, cy - 1, 6, '#f0c290'); // tan bicep
      pixCircle(ctx, cx, cy - 3, 4, rgba(shade(0xf0c290, 0.2)));
      // fist below
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(cx - 5, cy + 4, 11, 6);
      ctx.fillStyle = '#f0c290';
      ctx.fillRect(cx - 4, cy + 5, 9, 4);
      ctx.fillStyle = rgba(shade(0xf0c290, -0.2));
      for (let i = 0; i < 3; i++) ctx.fillRect(cx - 3 + i * 3, cy + 5, 1, 4); // knuckles
      // angry brow
      ctx.fillStyle = '#5a1414';
      ctx.fillRect(cx - 4, cy - 3 - w, 3, 1);
      ctx.fillRect(cx + 2, cy - 3 - w, 3, 1);
    }
    pixStar(ctx, 2, 3, 4, 2, 1, '#fff2a8');
    pixStar(ctx, 22, 19, 4, 2, 1, '#fff2a8');
  });
}

// ---------------------------------------------------------------------------
// Boss — the big themed beast that hovers on the victim's field. 52×46.
// ---------------------------------------------------------------------------

export function bossTex(theme: AttackTheme, frame: number): Texture {
  return cached(`boss:${theme}:${frame}`, 52, 46, (ctx) => {
    const cx = 26;
    const cy = 24;
    const b = frame % 2;
    if (theme === 'frisbee') {
      // giant donkey
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(cx - 13, cy - 20 - b, 6, 14);
      ctx.fillRect(cx + 7, cy - 20 - b, 6, 14);
      ctx.fillStyle = '#a8a29c';
      ctx.fillRect(cx - 12, cy - 19 - b, 4, 11);
      ctx.fillRect(cx + 8, cy - 19 - b, 4, 11);
      pixCircle(ctx, cx, cy, 18, OUTLINE);
      pixCircle(ctx, cx, cy, 17, '#b8b2ad');
      pixCircle(ctx, cx, cy + 6, 11, '#8a847e'); // muzzle
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(cx - 5, cy + 8, 2, 2);
      ctx.fillRect(cx + 4, cy + 8, 2, 2);
      for (const ex of [-8, 8]) {
        pixCircle(ctx, cx + ex, cy - 4, 4, '#fff');
        pixCircle(ctx, cx + ex, cy - 4, 2, '#3a1a1a');
      }
      // mane tuft
      ctx.fillStyle = '#6a5a3a';
      ctx.fillRect(cx - 2, cy - 22 - b, 4, 4);
    } else if (theme === 'film') {
      // giant film/projector monster
      pixCircle(ctx, cx, cy, 18, OUTLINE);
      pixCircle(ctx, cx, cy, 17, '#5fa85a');
      pixCircle(ctx, cx, cy + 2, 12, '#7fc878');
      // reel-eyes
      for (const ex of [-8, 8]) {
        pixCircle(ctx, cx + ex, cy - 3, 5, OUTLINE);
        pixCircle(ctx, cx + ex, cy - 3, 4, '#e6cf63');
        pixCircle(ctx, cx + ex, cy - 3, 1.4, OUTLINE);
      }
      // dorsal film-strip fins
      ctx.fillStyle = OUTLINE;
      for (let i = -2; i <= 2; i++) ctx.fillRect(cx + i * 6 - 1, cy - 22 - b, 3, 5);
      // fanged grin
      ctx.fillStyle = '#2a3a28';
      ctx.fillRect(cx - 6, cy + 8, 13, 3);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 4; i++) ctx.fillRect(cx - 5 + i * 4, cy + 8, 1, 3);
    } else {
      // giant muscle golem
      pixCircle(ctx, cx, cy, 18, OUTLINE);
      pixCircle(ctx, cx, cy, 17, '#f0c290');
      // pecs + abs
      ctx.fillStyle = rgba(shade(0xf0c290, -0.18));
      ctx.fillRect(cx - 1, cy - 6, 2, 18);
      ctx.fillRect(cx - 8, cy + 2, 17, 1);
      ctx.fillRect(cx - 8, cy + 6, 17, 1);
      // shades
      ctx.fillStyle = '#15151f';
      ctx.fillRect(cx - 9, cy - 5, 18, 3);
      ctx.fillStyle = rgba(0xffffff, 0.7);
      ctx.fillRect(cx - 7, cy - 5, 1, 1);
      // smirk
      ctx.fillStyle = '#7a4a2a';
      ctx.fillRect(cx - 2, cy + 9 + b, 6, 1);
      // raised dumbbell on top
      dumbbell(ctx, cx, cy - 21 - b, 0xff5a5a, 7);
    }
    // spawn-flash and stun tints are applied by the renderer via sprite.tint.
  });
}

// ---------------------------------------------------------------------------
// Death — the reaper. A small hooded skull with a scythe; pursues the player.
// ---------------------------------------------------------------------------

export function deathTex(frame: number): Texture {
  return cached(`death:${frame}`, 22, 26, (ctx) => {
    const cx = 10;
    const sway = frame % 2;
    // scythe (behind)
    ctx.fillStyle = '#6a5a4a';
    ctx.fillRect(cx + 6, 3, 1, 18);
    ctx.fillStyle = '#cfd6e0';
    ctx.fillRect(cx + 3, 3, 5, 1);
    ctx.fillRect(cx + 2, 4, 2, 1);
    // hooded cloak (dark)
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(cx - 6, 6, 13, 18);
    ctx.fillStyle = '#3a2150';
    ctx.fillRect(cx - 5, 7, 11, 16);
    ctx.fillStyle = '#2a1840';
    ctx.fillRect(cx - 5, 7 + sway, 4, 16); // shaded fold
    // ragged hem
    ctx.fillStyle = OUTLINE;
    for (let i = 0; i < 4; i++) ctx.fillRect(cx - 5 + i * 3, 22, 2, 2);
    // skull face in the hood
    pixCircle(ctx, cx, 11, 4, '#e8e4dc');
    ctx.fillStyle = '#101018';
    ctx.fillRect(cx - 2, 10, 2, 2); // eye sockets
    ctx.fillRect(cx + 1, 10, 2, 2);
    ctx.fillStyle = '#ff3a3a';
    ctx.fillRect(cx - 2, 10, 1, 1); // glowing pupils
    ctx.fillRect(cx + 2, 10, 1, 1);
    ctx.fillStyle = '#101018';
    ctx.fillRect(cx - 1, 13, 3, 1); // grin
  });
}

// ---------------------------------------------------------------------------
// Explosions — star-burst flashes. `t` ∈ [0,1] picks a frame.
// ---------------------------------------------------------------------------

const EXPLO_FRAMES = 6;
export function explosionTex(frameIdx: number): Texture {
  const i = Math.max(0, Math.min(EXPLO_FRAMES - 1, frameIdx));
  return cached(`explo:${i}`, 40, 40, (ctx) => {
    const cx = 20;
    const cy = 20;
    const t = i / (EXPLO_FRAMES - 1);
    const rOuter = 5 + t * 14;
    const rInner = rOuter * 0.45;
    const alpha = 1 - t * 0.8;
    // outer warm star
    pixStar(ctx, cx, cy, 6, rOuter, rInner, rgba(0xffb24d, alpha));
    // inner hot star
    pixStar(ctx, cx, cy, 6, rOuter * 0.6, rInner * 0.6, rgba(0xfff0b8, alpha));
    // white core early
    if (t < 0.5) pixCircle(ctx, cx, cy, rOuter * 0.35, rgba(0xffffff, alpha));
    // flung sparkles late
    if (t > 0.3) {
      ctx.fillStyle = rgba(0xfff2a8, alpha);
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2 + 0.4;
        const d = rOuter + 3;
        ctx.fillRect(Math.round(cx + Math.cos(ang) * d), Math.round(cy + Math.sin(ang) * d), 2, 2);
      }
    }
  });
}
export { EXPLO_FRAMES };

/** Fever orb (§6.1): a spinning blue crescent orb. Shoot it (via a chain) for FEVER. */
export function orbTex(frame: number): Texture {
  return cached(`orb:${frame}`, 18, 18, (ctx) => {
    const cx = 9;
    const cy = 9;
    const spin = frame % 4;
    pixCircle(ctx, cx, cy, 8, rgba(0x4488ff, 0.3)); // glow
    pixCircle(ctx, cx, cy, 7, OUTLINE);
    pixCircle(ctx, cx, cy, 6, rgba(0x4488ff));
    pixCircle(ctx, cx, cy, 4.5, rgba(0x6fb0ff));
    // crescent that drifts around as it spins
    const ox = [-1, 0, 1, 0][spin]!;
    const oy = [0, -1, 0, 1][spin]!;
    pixCircle(ctx, cx - 1 + ox, cy - 1 + oy, 3, '#cfe6ff');
    pixCircle(ctx, cx + ox, cy + oy, 2.4, rgba(0x4488ff));
    pixStar(ctx, cx, cy, 4, 2.2, 1, '#ffffff');
  });
}

// ---------------------------------------------------------------------------
// HUD icons.
// ---------------------------------------------------------------------------

/** kind: 'full' | 'half' | 'empty'. */
export function heartTex(kind: 'full' | 'half' | 'empty'): Texture {
  return cached(`heart:${kind}`, 11, 10, (ctx) => {
    const draw = (color: string, xlimit: number) => {
      const rows = [
        '.##.##.',
        '#######',
        '#######',
        '.#####.',
        '..###..',
        '...#...',
      ];
      ctx.fillStyle = color;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r]!;
        for (let c = 0; c < row.length; c++) {
          if (row[c] === '#' && c + 2 <= xlimit) ctx.fillRect(c + 2, r + 2, 1, 1);
        }
      }
    };
    // outline
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(1, 1, 9, 8);
    draw('#3a1a2a', 9); // empty socket base
    if (kind === 'empty') {
      ctx.fillStyle = '#4a2a3a';
      ctx.fillRect(2, 2, 7, 6);
      draw('#5a2a3a', 9);
    } else if (kind === 'half') {
      draw('#5a2a3a', 9);
      draw('#ff4d7a', 5); // left half filled
      draw('#ff9ab8', 4);
    } else {
      draw('#ff4d7a', 9);
      // highlight
      ctx.fillStyle = '#ff9ab8';
      ctx.fillRect(3, 3, 2, 1);
    }
  });
}

/** Bomb stock icon — a circled "B" coin. */
export function bombTex(): Texture {
  return cached('bomb', 12, 12, (ctx) => {
    pixCircle(ctx, 6, 6, 5.5, OUTLINE);
    pixCircle(ctx, 6, 6, 4.6, '#ff8ab8');
    pixCircle(ctx, 5, 5, 2, '#ffc4dd');
    // B
    ctx.fillStyle = '#5a1a3a';
    ctx.fillRect(4, 3, 1, 6);
    ctx.fillRect(5, 3, 2, 1);
    ctx.fillRect(5, 5, 2, 1);
    ctx.fillRect(5, 8, 2, 1);
    ctx.fillRect(7, 4, 1, 1);
    ctx.fillRect(7, 6, 1, 2);
  });
}

/** Small twinkle sparkle for ambient FX and banners. */
export function sparkleTex(color: number, size = 7): Texture {
  return cached(`spark:${color}:${size}`, size * 2, size * 2, (ctx) => {
    pixStar(ctx, size, size, 4, size, size * 0.35, rgba(color));
    pixCircle(ctx, size, size, size * 0.28, '#ffffff');
  });
}

/** The title-screen mascot: one ridiculously happy star (the original's iconic motif, our art). */
export function happyStarTex(): Texture {
  return cached('happystar', 40, 40, (ctx) => {
    const cx = 20;
    const cy = 21;
    // soft layered glow
    pixStar(ctx, cx, cy, 5, 20, 9, rgba(0xffe06a, 0.25));
    pixStar(ctx, cx, cy, 5, 17, 8, rgba(0xffd84d, 0.5));
    // outline + body
    pixStar(ctx, cx, cy, 5, 16, 7.5, OUTLINE);
    pixStar(ctx, cx, cy, 5, 15, 7, '#ffe45a');
    pixStar(ctx, cx, cy, 5, 9, 4.5, '#fff3a8');
    // rosy cheeks
    ctx.fillStyle = rgba(0xff8ab8, 0.8);
    ctx.fillRect(cx - 8, cy + 1, 3, 2);
    ctx.fillRect(cx + 5, cy + 1, 3, 2);
    // big happy eyes
    ctx.fillStyle = '#3a2150';
    ctx.fillRect(cx - 5, cy - 4, 2, 4);
    ctx.fillRect(cx + 3, cy - 4, 2, 4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 5, cy - 4, 1, 1);
    ctx.fillRect(cx + 3, cy - 4, 1, 1);
    // wide smile
    ctx.fillStyle = '#3a2150';
    ctx.fillRect(cx - 4, cy + 3, 8, 1);
    ctx.fillRect(cx - 4, cy + 2, 1, 1);
    ctx.fillRect(cx + 3, cy + 2, 1, 1);
  });
}

/** Warning chevron shown at the top of a field for an incoming attack. */
export function warnTex(color: number): Texture {
  return cached(`warn:${color}`, 14, 12, (ctx) => {
    pixStar(ctx, 7, 6, 3, 6, 2.4, OUTLINE);
    pixStar(ctx, 7, 6, 3, 5, 2, rgba(color));
    ctx.fillStyle = '#fff';
    ctx.fillRect(6, 3, 2, 4);
    ctx.fillRect(6, 8, 2, 1);
  });
}
