/**
 * Engine-stable math for the sim. IEEE-754 +,-,*,/ are bit-exact across JS engines,
 * but transcendentals (Math.sin, Math.pow) are not — they would desync cross-machine
 * netplay. The sim must use these instead.
 */

const PI = Math.PI; // constant, bit-identical everywhere
const TWO_PI = PI * 2;

/**
 * Bhaskara I's sine approximation — max error ~0.0016, plenty for motion sway,
 * and computed with exact arithmetic only.
 */
export function detSin(x: number): number {
  // wrap into [0, 2π)
  let t = x % TWO_PI;
  if (t < 0) t += TWO_PI;
  const sign = t > PI ? -1 : 1;
  if (t > PI) t -= PI;
  const num = 16 * t * (PI - t);
  return (sign * num) / (5 * PI * PI - 4 * t * (PI - t));
}

/** Integer-exponent power via repeated multiplication — exact-operation only. */
export function ipow(base: number, exp: number): number {
  let result = 1;
  let n = Math.floor(exp);
  let b = base;
  while (n > 0) {
    if (n & 1) result *= b;
    b *= b;
    n >>= 1;
  }
  return result;
}
