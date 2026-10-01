/**
 * SFC32 (Small Fast Counting) PRNG — 128-bit state, extremely high quality,
 * no external dependencies. Deterministic given the same seed string.
 *
 * Reference: Chris Doty-Humphrey's PractRand library.
 */

export interface Rng {
  /** Uniform float in [0, 1) */
  next(): number;
  /** Uniform integer in [min, max] (inclusive) */
  nextInt(min: number, max: number): number;
  /** Pick a random element from a non-empty array */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates shuffle — returns a new array */
  shuffle<T>(items: readonly T[]): T[];
  /** Box-Muller normal deviate */
  nextGaussian(mean?: number, stddev?: number): number;
  /** Fork a child RNG with a deterministic sub-seed */
  fork(label: string): Rng;
}

/** FNV-1a 32-bit hash — maps string seed to a 32-bit integer. */
function fnv1a32(s: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function makeSfc32(a: number, b: number, c: number, d: number): Rng {
  let _a = a | 0;
  let _b = b | 0;
  let _c = c | 0;
  let _d = d | 0;

  function next(): number {
    const t = (_a + _b + _d) | 0;
    _d = (_d + 1) | 0;
    _a = _b ^ (_b >>> 9);
    _b = (_c + (_c << 3)) | 0;
    _c = ((_c << 21) | (_c >>> 11)) + t;
    return (t >>> 0) / 0x1_0000_0000;
  }

  function nextInt(min: number, max: number): number {
    if (min > max) throw new RangeError(`min (${min}) > max (${max})`);
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('pick() called on empty array');
    const item = items[nextInt(0, items.length - 1)];
    // noUncheckedIndexedAccess: index is always valid by construction
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return item!;
  }

  function shuffle<T>(items: readonly T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = nextInt(0, i);
      const tmp = arr[i];
      arr[i] = arr[j] as T;
      arr[j] = tmp as T;
    }
    return arr;
  }

  function nextGaussian(mean = 0, stddev = 1): number {
    // Box-Muller transform (uses two uniform samples)
    const u1 = next();
    const u2 = next();
    const z = Math.sqrt(-2 * Math.log(u1 + Number.EPSILON)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stddev;
  }

  function fork(label: string): Rng {
    // Derive child seed deterministically from parent state + label
    const childSeed = fnv1a32(`${_a}:${_b}:${_c}:${_d}:${label}`);
    return createRng(`${label}:${childSeed}`);
  }

  return { next, nextInt, pick, shuffle, nextGaussian, fork };
}

/**
 * Create a seeded deterministic RNG.
 * The same seed string always produces the same sequence.
 */
export function createRng(seed: string): Rng {
  const h1 = fnv1a32(seed);
  const h2 = fnv1a32(`${seed}\x01`);
  const h3 = fnv1a32(`${seed}\x02`);
  const h4 = fnv1a32(`${seed}\x03`);
  const rng = makeSfc32(h1, h2, h3, h4);
  // Warm up — discard first few outputs to avoid seed-correlation artefacts
  for (let i = 0; i < 15; i++) rng.next();
  return rng;
}
