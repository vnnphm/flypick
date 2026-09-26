/** Deterministic PRNG (mulberry32). From fly.ai world/src/rng.ts at 40fbeca (MIT). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Independent 32-bit sub-seed for one purpose ("brain", "sides"), so streams never share bits. */
export function subSeed(seed: number, purpose: string): number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (const ch of `:${purpose}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
