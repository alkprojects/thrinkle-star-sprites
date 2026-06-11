/**
 * Bright fantasy-sky field backgrounds — the colourful, whimsical settings Twinkle Star
 * Sprites plays over, instead of a dark starfield. Each seat gets a themed sky baked at
 * the field's native resolution (so it bands into soft pixel gradients on upscale) plus a
 * tiling cloud strip the renderer scrolls for parallax.
 */
import { Texture } from 'pixi.js';
import { bake, pixCircle, pixStar, rgba } from './pixutil';

export type SkyTheme = 'dawn' | 'day' | 'dusk';

interface ThemePalette {
  top: number;
  mid: number;
  low: number;
  cloud: number;
  cloudShade: number;
  orb: number; // sun/moon
  hill: number;
}

const THEMES: Record<SkyTheme, ThemePalette> = {
  dawn: { top: 0x3b2a6a, mid: 0xff9ec4, low: 0xffe0a8, cloud: 0xffd9ec, cloudShade: 0xffb0d0, orb: 0xfff1b0, hill: 0xc77ab0 },
  day: { top: 0x2a6cd0, mid: 0x73c4ff, low: 0xd6f1ff, cloud: 0xffffff, cloudShade: 0xcfe6ff, orb: 0xfff6c8, hill: 0x6fb86f },
  dusk: { top: 0x281a5a, mid: 0x8a52b8, low: 0xff9ed0, cloud: 0xe9c4ff, cloudShade: 0xb98ad8, orb: 0xffd0e6, hill: 0x6a4a9a },
};

function lerp(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Static sky: vertical gradient + a soft orb + distant hills. */
export function skyTex(theme: SkyTheme, w: number, h: number): Texture {
  const p = THEMES[theme];
  return bake(w, h, (ctx) => {
    // banded vertical gradient (top→mid in upper 60%, mid→low below)
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const col = t < 0.55 ? lerp(p.top, p.mid, t / 0.55) : lerp(p.mid, p.low, (t - 0.55) / 0.45);
      ctx.fillStyle = rgba(col);
      ctx.fillRect(0, y, w, 1);
    }
    // soft orb (sun/moon) upper area
    const ox = Math.round(w * 0.72);
    const oy = Math.round(h * 0.16);
    pixCircle(ctx, ox, oy, 16, rgba(p.orb, 0.25));
    pixCircle(ctx, ox, oy, 12, rgba(p.orb, 0.55));
    pixCircle(ctx, ox, oy, 8, rgba(p.orb, 0.95));
    // faint twinkles up top
    for (let i = 0; i < 18; i++) {
      const sx = (i * 53) % w;
      const sy = (i * 31) % Math.round(h * 0.45);
      pixStar(ctx, sx, sy, 4, 1.4, 0.6, rgba(0xffffff, 0.35));
    }
    // distant rolling hills along the bottom
    ctx.fillStyle = rgba(p.hill, 0.85);
    for (let x = 0; x < w; x++) {
      const hillH = 14 + Math.round(Math.sin(x * 0.08) * 5 + Math.sin(x * 0.21) * 3);
      ctx.fillRect(x, h - hillH, 1, hillH);
    }
    ctx.fillStyle = rgba(lerp(p.hill, 0x000000, 0.2), 0.5);
    ctx.fillRect(0, h - 4, w, 4);
  });
}

/** A horizontally tiling band of fluffy clouds (transparent gaps) for parallax scroll. */
export function cloudStripTex(theme: SkyTheme, w: number, h: number): Texture {
  const p = THEMES[theme];
  return bake(w, h, (ctx) => {
    const puff = (cx: number, cy: number, scale: number) => {
      pixCircle(ctx, cx, cy, 6 * scale, rgba(p.cloudShade, 0.85));
      pixCircle(ctx, cx - 5 * scale, cy + 1, 4 * scale, rgba(p.cloudShade, 0.85));
      pixCircle(ctx, cx + 5 * scale, cy + 1, 4 * scale, rgba(p.cloudShade, 0.85));
      pixCircle(ctx, cx, cy - 1, 5 * scale, rgba(p.cloud, 0.92));
      pixCircle(ctx, cx - 4 * scale, cy, 3 * scale, rgba(p.cloud, 0.92));
      pixCircle(ctx, cx + 4 * scale, cy, 3 * scale, rgba(p.cloud, 0.92));
    };
    // a few clouds placed so the strip tiles seamlessly in x
    puff(Math.round(w * 0.18), Math.round(h * 0.4), 1.1);
    puff(Math.round(w * 0.55), Math.round(h * 0.65), 0.85);
    puff(Math.round(w * 0.82), Math.round(h * 0.35), 1.0);
  });
}

export { THEMES };
