import type { SimState } from './types';

/** FNV-1a over the serialized state — used by determinism tests and (later) netplay desync checks. */
export function hashState(s: SimState): number {
  const str = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
