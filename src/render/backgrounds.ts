/**
 * Field backgrounds — the original flies over bright, continuously SCROLLING top-down
 * terrain (forests, paths, rivers, giant mushrooms), NOT a static sky. That downward
 * terrain flow is a big part of its sense of speed (FIDELITY_GAPS §0b, confirmed from the
 * real ROM). We build two vertically-tiling layers per theme — an opaque ground tile and
 * a translucent canopy/feature tile — and the renderer scrolls them at slightly different
 * speeds for parallax. All art is ORIGINAL.
 */
import { Texture } from 'pixi.js';
import { bake, pixCircle, px, rgba, shade } from './pixutil';

export type TerrainTheme = 'meadow' | 'cinema' | 'sunny';

interface TerrainPalette {
  ground: number;     // base grass / sand
  groundAlt: number;  // mottling
  path: number;       // winding trail
  water: number;
  waterDeep: number;
  tree: number;       // canopy
  treeShade: number;
  bloom: number;      // flowers / lights / umbrellas
  cap: number;        // mushroom cap / prop accent
}

const THEMES: Record<TerrainTheme, TerrainPalette> = {
  // Danny — bright fairytale meadow/forest (the classic FORRETT look).
  meadow: { ground: 0x5fb84a, groundAlt: 0x4f9e3a, path: 0xc9a25e, water: 0x4f9be0, waterDeep: 0x3573b8, tree: 0x2f7a34, treeShade: 0x236028, bloom: 0xffe04d, cap: 0xe85a5a },
  // Tyleru — moody twilight studio-backlot forest.
  cinema: { ground: 0x5a4a72, groundAlt: 0x4a3a60, path: 0x2a2535, water: 0x3a4a7a, waterDeep: 0x2a3560, tree: 0x3c2f60, treeShade: 0x2c2248, bloom: 0xe6cf63, cap: 0xb05ad0 },
  // Alex — sunny beach / boardwalk.
  sunny: { ground: 0xecd28a, groundAlt: 0xd8b86a, path: 0xc08a52, water: 0x2fb8e0, waterDeep: 0x1f8fc0, tree: 0x3aa85a, treeShade: 0x2c8246, bloom: 0xff5a5a, cap: 0xffffff },
};

/** Tiny deterministic LCG so terrain bakes identically every load (no flicker). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const themeSeed: Record<TerrainTheme, number> = { meadow: 0x1111, cinema: 0x2222, sunny: 0x3333 };

/**
 * Opaque ground tile (grass/sand base + a meandering path + a water patch + mottling).
 * Seamless in Y: features stay clear of the top/bottom edges; the path uses a period
 * that divides h so it reconnects across the tile boundary.
 */
export function groundTileTex(theme: TerrainTheme, w: number, h: number): Texture {
  const p = THEMES[theme];
  const rnd = lcg(themeSeed[theme]);
  return bake(w, h, (ctx) => {
    // base + horizontal mottling bands
    ctx.fillStyle = rgba(p.ground);
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(rnd() * w);
      const y = Math.floor(rnd() * h);
      const c = rnd() < 0.5 ? p.groundAlt : shade(p.ground, 0.12);
      px(ctx, x, y, 2, 1, rgba(c, 0.6));
    }
    // a water patch (kept mid-tile so vertical tiling never clips it)
    const wx = Math.floor(w * (0.15 + rnd() * 0.2));
    const wy = Math.floor(h * 0.5);
    for (let yy = -10; yy <= 10; yy++) {
      const span = Math.round(Math.sqrt(Math.max(0, 100 - yy * yy)) * (1.1 + 0.3 * Math.sin(yy * 0.6)));
      ctx.fillStyle = rgba(p.water);
      ctx.fillRect(wx - span, wy + yy, span * 2, 1);
    }
    pixCircle(ctx, wx, wy, 6, rgba(p.waterDeep));
    px(ctx, wx - 3, wy - 3, 2, 1, rgba(0xffffff, 0.5)); // glint
    // winding path down the field (period divides h → tiles seamlessly)
    const period = h / 2;
    const pathW = 9;
    for (let y = 0; y < h; y++) {
      const cx = w * 0.62 + Math.sin((y / period) * Math.PI * 2) * (w * 0.16);
      ctx.fillStyle = rgba(p.path);
      ctx.fillRect(Math.round(cx - pathW / 2), y, pathW, 1);
      ctx.fillStyle = rgba(shade(p.path, -0.2), 0.6);
      ctx.fillRect(Math.round(cx - pathW / 2), y, 1, 1);
      ctx.fillRect(Math.round(cx + pathW / 2 - 1), y, 1, 1);
    }
  });
}

/**
 * Translucent canopy/feature tile (tree crowns, mushrooms, rocks/props) that parallaxes
 * over the ground. Features are placed within [marginY, h-marginY] so vertical tiling
 * doesn't visibly clip them.
 */
export function canopyTileTex(theme: TerrainTheme, w: number, h: number): Texture {
  const p = THEMES[theme];
  const rnd = lcg(themeSeed[theme] ^ 0xabcd);
  const marginY = 16;
  return bake(w, h, (ctx) => {
    const feature = (): void => {
      const x = Math.round(rnd() * w);
      const y = Math.round(marginY + rnd() * (h - marginY * 2));
      const kind = rnd();
      if (kind < 0.55) {
        // round tree crown with a shadow + highlight
        const r = 6 + Math.floor(rnd() * 5);
        pixCircle(ctx, x + 1, y + 2, r, rgba(0x000000, 0.18));
        pixCircle(ctx, x, y, r, rgba(p.treeShade));
        pixCircle(ctx, x, y, r - 1, rgba(p.tree));
        pixCircle(ctx, x - r * 0.3, y - r * 0.3, r * 0.4, rgba(shade(p.tree, 0.25)));
      } else if (kind < 0.78) {
        // mushroom / prop with a spotted cap
        pixCircle(ctx, x, y, 5, rgba(0x000000, 0.16));
        ctx.fillStyle = rgba(0xf2e3c8);
        ctx.fillRect(x - 2, y, 4, 5); // stalk
        pixCircle(ctx, x, y - 1, 5, rgba(p.cap));
        ctx.fillStyle = rgba(0xffffff, 0.85);
        px(ctx, x - 2, y - 2, 1, 1, rgba(0xffffff, 0.85));
        px(ctx, x + 1, y - 1, 1, 1, rgba(0xffffff, 0.85));
      } else if (kind < 0.9) {
        // rock
        pixCircle(ctx, x, y, 4, rgba(0x000000, 0.16));
        pixCircle(ctx, x, y, 4, rgba(0x8a8a96));
        pixCircle(ctx, x - 1, y - 1, 2, rgba(0xb0b0bc));
      } else {
        // bloom / light / umbrella accent
        pixCircle(ctx, x, y, 2, rgba(p.bloom));
        px(ctx, x, y, 1, 1, rgba(0xffffff, 0.8));
      }
    };
    for (let i = 0; i < 14; i++) feature();
  });
}

export { THEMES };
