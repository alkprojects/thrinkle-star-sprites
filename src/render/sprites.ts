/**
 * Procedural pixel-art sprite factory. Every organic game object is drawn once into a
 * tiny offscreen canvas (1 internal unit = 1 px) and cached as a NEAREST texture, so it
 * upscales into crisp Neo-Geo-style pixels. Sprites are drawn centered; the renderer
 * sets anchor 0.5. All art is ORIGINAL — evoking Twinkle Star Sprites' cute fantasy
 * look without reproducing any ADK asset.
 */
import { Texture } from 'pixi.js';
import type { CharacterDef } from '../config/characters';
import { bake, pixCircle, pixStar, rgba, shade } from './pixutil';

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
// Player chibis — three original magical-fantasy archetypes.
// ---------------------------------------------------------------------------

export function playerTex(def: CharacterDef, frame: number): Texture {
  return cached(`player:${def.name}:${frame}`, 24, 28, (ctx) => {
    if (def.kind === 'witch') drawWitch(ctx, def, frame);
    else if (def.kind === 'comet') drawComet(ctx, def, frame);
    else drawFirefly(ctx, def, frame);
  });
}

const SKIN = '#ffe0c2';

function drawWitch(ctx: CanvasRenderingContext2D, def: CharacterDef, frame: number): void {
  const cx = 12;
  const bob = frame % 2;
  const top = 4 + bob;
  // broom (under the witch)
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(3, 23, 18, 2);
  ctx.fillStyle = '#d9a441';
  ctx.fillRect(19, 21, 4, 5);
  // dress/body
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - 5, top + 9, 11, 11);
  ctx.fillStyle = rgba(def.color);
  ctx.fillRect(cx - 4, top + 10, 9, 9);
  ctx.fillStyle = rgba(shade(def.color, 0.35));
  ctx.fillRect(cx - 4, top + 10, 3, 9);
  // head
  pixCircle(ctx, cx, top + 6, 4.5, OUTLINE);
  pixCircle(ctx, cx, top + 6, 3.6, SKIN);
  // hair
  ctx.fillStyle = rgba(def.hair);
  ctx.fillRect(cx - 4, top + 3, 8, 2);
  ctx.fillRect(cx - 5, top + 4, 2, 5);
  ctx.fillRect(cx + 3, top + 4, 2, 5);
  // eyes
  ctx.fillStyle = '#3a2150';
  ctx.fillRect(cx - 2, top + 6, 1, 2);
  ctx.fillRect(cx + 1, top + 6, 1, 2);
  // witch hat
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - 6, top + 2, 12, 2);
  pixStar(ctx, cx + 1, top - 3, 3, 5, 2, rgba(shade(def.color, -0.1)));
  ctx.fillStyle = rgba(shade(def.color, -0.1));
  ctx.fillRect(cx - 5, top + 1, 10, 2);
  // hat band accent
  ctx.fillStyle = rgba(def.accent);
  ctx.fillRect(cx - 5, top + 2, 10, 1);
  // little star wand sparkle
  pixStar(ctx, 4, top + 12, 4, 2.4, 1, rgba(def.accent));
}

function drawComet(ctx: CanvasRenderingContext2D, def: CharacterDef, frame: number): void {
  const cx = 12;
  const bob = frame % 2;
  const top = 5 + bob;
  // star/comet tail trailing up-left
  pixStar(ctx, 5, 22 - bob, 4, 3, 1.4, rgba(def.accent, 0.9));
  pixStar(ctx, 8, 18 - bob, 4, 2, 1, rgba(def.color, 0.8));
  // body (a little suit)
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - 5, top + 9, 11, 11);
  ctx.fillStyle = rgba(def.color);
  ctx.fillRect(cx - 4, top + 10, 9, 9);
  ctx.fillStyle = rgba(shade(def.color, -0.25));
  ctx.fillRect(cx - 4, top + 14, 9, 2);
  // head
  pixCircle(ctx, cx, top + 6, 4.5, OUTLINE);
  pixCircle(ctx, cx, top + 6, 3.6, SKIN);
  // spiky hair
  ctx.fillStyle = rgba(def.hair);
  ctx.fillRect(cx - 4, top + 2, 8, 3);
  ctx.fillRect(cx - 5, top + 4, 2, 3);
  ctx.fillRect(cx + 3, top + 4, 2, 3);
  ctx.fillStyle = rgba(shade(def.hair, 0.3));
  ctx.fillRect(cx - 2, top, 2, 3);
  // goggles
  ctx.fillStyle = rgba(def.accent);
  ctx.fillRect(cx - 3, top + 5, 2, 2);
  ctx.fillRect(cx + 1, top + 5, 2, 2);
  ctx.fillStyle = '#3a2150';
  ctx.fillRect(cx - 2, top + 6, 1, 1);
  ctx.fillRect(cx + 2, top + 6, 1, 1);
}

function drawFirefly(ctx: CanvasRenderingContext2D, def: CharacterDef, frame: number): void {
  const cx = 12;
  const bob = frame % 2;
  const top = 5 + bob;
  const flap = frame % 2 === 0 ? 0 : 1;
  // big glowing wings
  ctx.fillStyle = rgba(def.accent, 0.55);
  pixCircle(ctx, cx - 6, top + 8 - flap, 4, rgba(def.accent, 0.5));
  pixCircle(ctx, cx + 6, top + 8 - flap, 4, rgba(def.accent, 0.5));
  ctx.fillStyle = rgba(shade(def.color, 0.5), 0.7);
  pixCircle(ctx, cx - 6, top + 8 - flap, 2.5, rgba(shade(def.color, 0.6), 0.8));
  pixCircle(ctx, cx + 6, top + 8 - flap, 2.5, rgba(shade(def.color, 0.6), 0.8));
  // body (glowing abdomen)
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - 4, top + 8, 9, 12);
  ctx.fillStyle = rgba(def.color);
  ctx.fillRect(cx - 3, top + 9, 7, 10);
  ctx.fillStyle = rgba(shade(def.color, 0.4));
  ctx.fillRect(cx - 3, top + 15, 7, 4); // glowing tail
  // head
  pixCircle(ctx, cx, top + 6, 4, OUTLINE);
  pixCircle(ctx, cx, top + 6, 3.2, SKIN);
  // antennae
  ctx.fillStyle = rgba(def.hair);
  ctx.fillRect(cx - 3, top, 1, 3);
  ctx.fillRect(cx + 3, top, 1, 3);
  pixStar(ctx, cx - 3, top - 1, 4, 1.6, 0.8, rgba(def.accent));
  pixStar(ctx, cx + 3, top - 1, 4, 1.6, 0.8, rgba(def.accent));
  // eyes
  ctx.fillStyle = '#3a2150';
  ctx.fillRect(cx - 2, top + 5, 1, 2);
  ctx.fillRect(cx + 1, top + 5, 1, 2);
}

// ---------------------------------------------------------------------------
// Fireballs / reverses — comet projectiles colored by sender.
// ---------------------------------------------------------------------------

/** size: 0 small / 1 med / 2 big / 3 biggest. Orb is centered so anchor 0.5 hits the sim pos. */
export function fireballTex(senderColor: number, size: number, reverse: boolean): Texture {
  const r = [4, 5.5, 7, 8.5][size] ?? 5.5;
  const dim = Math.ceil(r * 2) + 10;
  return cached(`fb:${senderColor}:${size}:${reverse ? 'r' : 'n'}`, dim, dim, (ctx) => {
    const cx = dim / 2;
    const cy = dim / 2;
    // upward flame trail (motion is downward)
    for (let i = 1; i <= 3; i++) {
      const tr = r * (1 - i * 0.22);
      pixCircle(ctx, cx, cy - r - i * 2, tr, rgba(shade(senderColor, 0.2), 0.4 - i * 0.1));
    }
    // glow
    pixCircle(ctx, cx, cy, r + 2, rgba(shade(senderColor, 0.3), 0.35));
    // body
    pixCircle(ctx, cx, cy, r, OUTLINE);
    pixCircle(ctx, cx, cy, r - 0.6, rgba(senderColor));
    pixCircle(ctx, cx, cy, r * 0.55, rgba(shade(senderColor, 0.55)));
    pixCircle(ctx, cx - r * 0.3, cy - r * 0.3, r * 0.25, '#ffffff');
    if (reverse) {
      // angry chevrons / spikes marking a reflected (faster) attack
      ctx.fillStyle = '#fff2a8';
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        const sx = cx + Math.cos(ang) * (r + 1);
        const sy = cy + Math.sin(ang) * (r + 1);
        ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Extra attack — a cute-but-menacing star-beast that crosses the field.
// ---------------------------------------------------------------------------

export function extraTex(frame: number): Texture {
  return cached(`extra:${frame}`, 24, 22, (ctx) => {
    const cx = 12;
    const cy = 11;
    const ear = frame % 2;
    // ears
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(cx - 7, cy - 8 - ear, 3, 6);
    ctx.fillRect(cx + 4, cy - 8 - ear, 3, 6);
    ctx.fillStyle = '#ff9a3d';
    ctx.fillRect(cx - 6, cy - 7 - ear, 1, 4);
    ctx.fillRect(cx + 5, cy - 7 - ear, 1, 4);
    // body
    pixCircle(ctx, cx, cy, 8, OUTLINE);
    pixCircle(ctx, cx, cy, 7, '#ffb14d');
    pixCircle(ctx, cx, cy + 1, 4, '#ffd27a');
    // angry eyes
    ctx.fillStyle = '#5a1414';
    ctx.fillRect(cx - 4, cy - 2, 3, 2);
    ctx.fillRect(cx + 1, cy - 2, 3, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 4, cy - 2, 1, 1);
    ctx.fillRect(cx + 1, cy - 2, 1, 1);
    // fang mouth
    ctx.fillStyle = '#5a1414';
    ctx.fillRect(cx - 2, cy + 3, 5, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 1, cy + 4, 1, 1);
    ctx.fillRect(cx + 1, cy + 4, 1, 1);
    // sparkle accents
    pixStar(ctx, 2, 3, 4, 2, 1, '#fff2a8');
    pixStar(ctx, 22, 19, 4, 2, 1, '#fff2a8');
  });
}

// ---------------------------------------------------------------------------
// Boss — a big plush star-beast that hovers on the victim's field.
// ---------------------------------------------------------------------------

export function bossTex(frame: number): Texture {
  return cached(`boss:${frame}`, 52, 46, (ctx) => {
    const cx = 26;
    const cy = 24;
    const bounce = frame % 2;
    // ears
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(cx - 14, cy - 18 - bounce, 6, 12);
    ctx.fillRect(cx + 8, cy - 18 - bounce, 6, 12);
    ctx.fillStyle = '#b07aff';
    ctx.fillRect(cx - 13, cy - 17 - bounce, 4, 9);
    ctx.fillRect(cx + 9, cy - 17 - bounce, 4, 9);
    ctx.fillStyle = '#ffaee0';
    ctx.fillRect(cx - 12, cy - 15 - bounce, 2, 5);
    ctx.fillRect(cx + 10, cy - 15 - bounce, 2, 5);
    // body
    pixCircle(ctx, cx, cy, 18, OUTLINE);
    pixCircle(ctx, cx, cy, 17, '#9a6cff');
    pixCircle(ctx, cx, cy + 2, 12, '#b48cff');
    pixCircle(ctx, cx, cy + 4, 7, '#d8c4ff');
    // big eyes
    for (const ex of [-7, 7]) {
      pixCircle(ctx, cx + ex, cy - 3, 4, '#fff');
      pixCircle(ctx, cx + ex + 1, cy - 2, 2, '#3a1a5a');
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx + ex, cy - 5, 1, 1);
    }
    // mouth
    ctx.fillStyle = '#5a1a6a';
    ctx.fillRect(cx - 3, cy + 6, 7, 2);
    ctx.fillStyle = '#ff7ab0';
    ctx.fillRect(cx - 2, cy + 7, 5, 1);
    // cheeks
    ctx.fillStyle = rgba(0xff7ab0, 0.7);
    ctx.fillRect(cx - 11, cy + 2, 3, 2);
    ctx.fillRect(cx + 8, cy + 2, 3, 2);
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
