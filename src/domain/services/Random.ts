/** Fuente de aleatoriedad inyectable (en los tests se usa una con semilla). */
export type RandomFn = () => number;

export function shuffle<T>(items: readonly T[], random: RandomFn): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const pick = <T>(items: readonly T[], random: RandomFn): T | undefined =>
  items.length ? items[Math.floor(random() * items.length)] : undefined;

/** Generador con semilla (mulberry32) para pruebas reproducibles. */
export function seededRandom(seed: number): RandomFn {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
