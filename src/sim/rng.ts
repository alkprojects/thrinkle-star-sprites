/** Deterministic seeded RNG (sfc32). The ONLY source of randomness allowed in the sim. */
export interface Rng {
  /** Float in [0, 1) */
  next(): number;
  /** Integer in [0, n) */
  int(n: number): number;
  /** Float in [min, max) */
  range(min: number, max: number): number;
  /** Serializable internal state */
  state(): [number, number, number, number];
}

function fromWords(s: [number, number, number, number]): Rng {
  let [a, b, c, d] = s;

  function next(): number {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const out = (t + d) | 0;
    c = (c + out) | 0;
    return (out >>> 0) / 4294967296;
  }

  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (min, max) => min + next() * (max - min),
    state: () => [a, b, c, d],
  };
}

export function createRng(seed: number): Rng {
  const rng = fromWords([
    seed >>> 0,
    (seed ^ 0x9e3779b9) >>> 0,
    (seed ^ 0x85ebca6b) >>> 0,
    (seed ^ 0xc2b2ae35) >>> 0,
  ]);
  // Warm up — early sfc32 outputs correlate with weak seeds
  for (let i = 0; i < 12; i++) rng.next();
  return rng;
}

export function rngFromState(s: [number, number, number, number]): Rng {
  return fromWords(s);
}
