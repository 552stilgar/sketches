// Seeded hash + PRNG core, ported from forge/params.mjs (prism lineage:
// hex hash -> seed -> mulberry32), extended with hierarchical derivation.
// All randomness in the generator flows through this module. No Math.random.

export type Prng = () => number;

/** 32-bit string hash (imul-31, forge lineage). */
export function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

/**
 * Derive a child seed from a parent seed plus any number of labels.
 * derive(seed, "structure"), derive(seed, "kit", socketId), ...
 * Deterministic, order-sensitive, avalanched so sibling labels decorrelate.
 */
export function derive(seed: number, ...labels: (string | number)[]): number {
  let h = seed | 0;
  for (const label of labels) {
    const lh = typeof label === "number" ? label | 0 : hashString(label);
    h = Math.imul(h ^ lh, 0x9e3779b1) | 0;
    // finalizer round (murmur3-style) so consecutive integer labels decorrelate
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) | 0;
    h ^= h >>> 13;
  }
  return h | 0;
}

/** mulberry32 stream over a seed — returns () => float in [0, 1). */
export function stream(seed: number): Prng {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- draw helpers -----------------------------------------------------------

/** Uniform float in [lo, hi). */
export function range(rng: Prng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/** Uniform integer in [lo, hi] inclusive. */
export function int(rng: Prng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Uniform pick from a non-empty array. */
export function pick<T>(rng: Prng, arr: readonly T[]): T {
  const v = arr[Math.floor(rng() * arr.length)];
  if (v === undefined) throw new Error("pick from empty array");
  return v;
}

/** Master seed shown to the user as 8 hex chars. */
export function seedToHex(seed: number): string {
  return (seed >>> 0).toString(16).padStart(8, "0");
}

export function hexToSeed(hex: string): number {
  const n = Number.parseInt(hex, 16);
  if (Number.isNaN(n)) throw new Error(`invalid seed hex: ${hex}`);
  return n | 0;
}
