import type { Character, Team } from "../entities/Character";
import { pick, shuffle, type RandomFn } from "./Random";
import {
  allowedDistributions,
  baseDistribution,
  DECOYS,
  MAX_BAG_PLAYERS,
  SETUP_MODIFIERS,
  validateSelection,
  type Distribution,
} from "./SetupRules";

const byTeam = (characters: Character[], team: Team) => characters.filter((c) => c.team === team);

/**
 * Elige al azar una bolsa válida de personajes del guion. Se usa en el modo manual
 * («Al azar») y como plan B si la IA no responde.
 */
export function randomSelection(playerCount: number, scriptCharacters: Character[], random: RandomFn): Character[] {
  const bagSize = Math.min(playerCount, MAX_BAG_PLAYERS);
  for (let attempt = 0; attempt < 200; attempt++) {
    const base = baseDistribution(playerCount);
    const demons = shuffle(byTeam(scriptCharacters, "demon"), random).slice(0, base.demon);
    let minions = shuffle(byTeam(scriptCharacters, "minion"), random).slice(0, base.minion);

    // La distribución final depende del Demonio y los Esbirros (Barón, Fang Gu…).
    const target = pick(allowedDistributions(playerCount, [...demons, ...minions]), random) as Distribution;
    if (target.minion > minions.length) {
      const extra = byTeam(scriptCharacters, "minion").filter((m) => !minions.includes(m));
      minions = [...minions, ...shuffle(extra, random).slice(0, target.minion - minions.length)];
    }

    const outsiders = shuffle(byTeam(scriptCharacters, "outsider"), random).slice(0, target.outsider);
    const townsfolk = shuffle(byTeam(scriptCharacters, "townsfolk"), random).slice(0, target.townsfolk);
    let bag = [...demons, ...minions, ...outsiders, ...townsfolk];

    // Personajes que obligan a meter otro (Cazador → Damisela, Niño del coro → Rey).
    for (const c of [...bag]) {
      for (const req of SETUP_MODIFIERS[c.id]?.requires ?? []) {
        if (bag.some((b) => b.id === req)) continue;
        const needed = scriptCharacters.find((s) => s.id === req);
        const victim = needed && [...bag].reverse().find((b) => b.team === needed.team && b.id !== c.id);
        if (needed && victim) bag = bag.map((b) => (b === victim ? needed : b));
      }
    }

    if (bag.length === bagSize && !validateSelection(playerCount, bag).some((i) => i.level === "error")) {
      return bag;
    }
  }
  throw new Error("No he encontrado un reparto válido con este guion y este número de jugadores.");
}

/**
 * Para el Borracho, el Lunático… elige qué ficha creerán tener (un personaje que no está en juego).
 * Devuelve id real → id mostrado.
 */
export function pickDecoys(
  inPlay: Character[],
  scriptCharacters: Character[],
  random: RandomFn,
  preferred: Record<string, string> = {},
): Record<string, string> {
  const used = new Set(inPlay.map((c) => c.id));
  const result: Record<string, string> = {};
  for (const c of inPlay) {
    const team = DECOYS[c.id];
    if (!team) continue;
    const wanted = preferred[c.id];
    const candidates = scriptCharacters.filter((s) => s.team === team && !used.has(s.id));
    const chosen = candidates.find((s) => s.id === wanted) ?? pick(candidates, random);
    if (chosen) {
      result[c.id] = chosen.id;
      used.add(chosen.id);
    }
  }
  return result;
}

/** Tres personajes buenos que no están en juego para que el Demonio farolee (2 Aldeanos y 1 Forastero si se puede). */
export function pickBluffs(excludedIds: Iterable<string>, scriptCharacters: Character[], random: RandomFn): string[] {
  const excluded = new Set(excludedIds);
  const free = (team: Team) => shuffle(scriptCharacters.filter((c) => c.team === team && !excluded.has(c.id)), random);
  const townsfolk = free("townsfolk");
  const outsiders = free("outsider");
  const bluffs = [...townsfolk.slice(0, 2), ...outsiders.slice(0, 1)];
  for (const c of townsfolk.slice(2)) if (bluffs.length < 3) bluffs.push(c);
  return bluffs.map((c) => c.id);
}
