/**
 * Low-level pixel-art helpers. Everything organic in the game is *baked* once into a
 * tiny canvas at 1:1 (one sim/internal unit = one canvas pixel) and uploaded as a
 * NEAREST-filtered texture. The whole scene is then drawn at this low internal
 * resolution and scaled up by an integer factor, so it stays crisp and blocky — the
 * Neo Geo look. Smooth vector Graphics are reserved for axis-aligned bars/panels,
 * which stay pixel-perfect under integer scaling.
 */
import { CanvasSource, Texture } from 'pixi.js';

export interface Pic {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** A fresh offscreen canvas with smoothing disabled (so scaled draws stay crisp). */
export function makeCanvas(w: number, h: number): Pic {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** Wrap a canvas in a NEAREST-filtered Pixi texture (the pixel-art upscale rule). */
export function texFromCanvas(canvas: HTMLCanvasElement): Texture {
  const source = new CanvasSource({ resource: canvas, scaleMode: 'nearest' });
  return new Texture({ source });
}

/** Draw a sprite at low res via a callback, return it as a nearest texture. */
export function bake(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Texture {
  const { canvas, ctx } = makeCanvas(w, h);
  draw(ctx, canvas.width, canvas.height);
  return texFromCanvas(canvas);
}

export function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

/** rgba css string from a 0xRRGGBB int + alpha. */
export function rgba(n: number, a = 1): string {
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}

/** Single crisp pixel-rect. */
export function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Lighten/darken a 0xRRGGBB color toward white/black by t∈[-1,1]. */
export function shade(n: number, t: number): number {
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const mix = (c: number) => (t >= 0 ? c + (255 - c) * t : c * (1 + t));
  const cl = (c: number) => Math.max(0, Math.min(255, Math.round(c)));
  return (cl(mix(r)) << 16) | (cl(mix(g)) << 8) | cl(mix(b));
}

/** Filled circle drawn on the pixel grid (no AA) by scanning rows — looks blocky on upscale. */
export function pixCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  const r2 = r * r;
  for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
    const span = Math.floor(Math.sqrt(Math.max(0, r2 - y * y)));
    if (span <= 0 && y * y > r2) continue;
    ctx.fillRect(Math.round(cx - span), Math.round(cy + y), span * 2 + 1, 1);
  }
}

/** Ring (stroked circle) on the pixel grid. */
export function pixRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  thickness: number,
  color: string,
): void {
  ctx.fillStyle = color;
  const rOut = r;
  const rIn = r - thickness;
  const rOut2 = rOut * rOut;
  const rIn2 = rIn * rIn;
  for (let y = -Math.ceil(rOut); y <= Math.ceil(rOut); y++) {
    for (let x = -Math.ceil(rOut); x <= Math.ceil(rOut); x++) {
      const d2 = x * x + y * y;
      if (d2 <= rOut2 && d2 >= rIn2) ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
    }
  }
}

/**
 * Draw an N-point star into the pixel grid (filled), pointing up.
 * Used for the twinkle motif throughout (zako, banners, sparkles).
 */
export function pixStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  points: number,
  rOuter: number,
  rInner: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}
