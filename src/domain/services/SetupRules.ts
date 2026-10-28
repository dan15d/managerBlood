import type { Character, Team } from "../entities/Character";
import { TEAM_LABEL } from "../entities/Character";

export interface Distribution {
  townsfolk: number;
  outsider: number;
  minion: number;
  demon: number;
}

export const MIN_PLAYERS = 5;
/** A partir de 16 jugadores, los que sobran juegan como Viajeros. */
export const MAX_BAG_PLAYERS = 15;
export const MAX_PLAYERS = 20;

// Hoja de preparación del reglamento.
const BASE: Record<number, Distribution> = {
  5: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
  6: { townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
  7: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
  8: { townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
  9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  10: { townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
  11: { townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
  12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  13: { townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
  14: { townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
  15: { townsfolk: 9, outsider: 2, minion: 3, demon: 1 },
};

export function baseDistribution(playerCount: number): Distribution {
  const bag = Math.min(Math.max(playerCount, MIN_PLAYERS), MAX_BAG_PLAYERS);
  return { ...BASE[bag] };
}

export const travellerCount = (playerCount: number) => Math.max(0, playerCount - MAX_BAG_PLAYERS);

/** Los Viajeros son opcionales, pero en la bolsa siempre tiene que haber al menos 5 jugadores. */
export const maxTravellers = (playerCount: number) => Math.max(0, playerCount - MIN_PLAYERS);

/**
 * Asiento de cada Viajero. Se respeta el que haya elegido el Narrador (si es válido y no está
 * repetido); el resto ocupa los últimos asientos libres. Devuelve asiento → personaje.
 */
export function travellerSeats(playerCount: number, travellerIds: string[], chosen: Record<string, number> = {}): Record<number, string> {
  const taken = new Set<number>();
  const result: Record<number, string> = {};
  for (const id of travellerIds) {
    const seat = chosen[id];
    if (seat !== undefined && seat >= 0 && seat < playerCount && !taken.has(seat)) {
      taken.add(seat);
      result[seat] = id;
    }
  }
  let free = playerCount - 1;
  for (const id of travellerIds) {
    if (Object.values(result).includes(id)) continue;
    while (taken.has(free)) free--;
    if (free < 0) break;
    taken.add(free);
    result[free] = id;
  }
  return result;
}

/**
 * Personajes con corchetes en su ficha. Cada opción de `outsiders` es un ajuste válido
 * (el Padrino puede ser +1 o −1; el Globo, +0 o +1). `requires` añade personajes a la bolsa.
 */
export interface SetupModifier {
  outsiders?: number[];
  minions?: number[];
  requires?: string[];
  note: string;
}

export const SETUP_MODIFIERS: Record<string, SetupModifier> = {
  baron: { outsiders: [2], note: "+2 Forasteros" },
  godfather: { outsiders: [-1, 1], note: "−1 o +1 Forastero" },
  fanggu: { outsiders: [1], note: "+1 Forastero" },
  vigormortis: { outsiders: [-1], note: "−1 Forastero" },
  balloonist: { outsiders: [0, 1], note: "+0 o +1 Forastero" },
  hermit: { outsiders: [0, -1], note: "−0 o −1 Forastero" },
  sentinel: { outsiders: [-1, 0, 1], note: "−1, +0 o +1 Forastero" },
  xaan: { outsiders: [1, 2, 3], note: "Forasteros = X" },
  lilmonsta: { minions: [1], note: "+1 Esbirro" },
  lordoftyphon: { minions: [1], note: "+1 Esbirro" },
  huntsman: { requires: ["damsel"], note: "+la Damisela" },
  choirboy: { requires: ["king"], note: "+el Rey" },
};

/** Personajes que no saben quiénes son: se les enseña otra ficha. */
export const DECOYS: Record<string, Team> = {
  drunk: "townsfolk",
  lunatic: "demon",
  marionette: "townsfolk",
};

export interface SetupIssue {
  level: "error" | "warning";
  message: string;
}

const countByTeam = (characters: Character[]): Distribution => {
  const d: Distribution = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const c of characters) if (c.team in d) d[c.team as keyof Distribution]++;
  return d;
};

/**
 * Todas las distribuciones válidas para los personajes elegidos, combinando los ajustes
 * de cada personaje con corchetes. Los Aldeanos rellenan lo que falte.
 */
export function allowedDistributions(playerCount: number, characters: Character[]): Distribution[] {
  const base = baseDistribution(playerCount);
  let options: Distribution[] = [base];
  for (const c of characters) {
    const mod = SETUP_MODIFIERS[c.id];
    if (!mod) continue;
    const next: Distribution[] = [];
    for (const d of options) {
      for (const o of mod.outsiders ?? [0]) {
        for (const m of mod.minions ?? [0]) {
          const outsider = Math.max(0, d.outsider + o);
          const minion = d.minion + m;
          const townsfolk = d.townsfolk - (outsider - d.outsider) - (minion - d.minion);
          if (townsfolk >= 0) next.push({ ...d, outsider, minion, townsfolk });
        }
      }
    }
    options = next;
  }
  const key = (d: Distribution) => `${d.townsfolk}/${d.outsider}/${d.minion}/${d.demon}`;
  return [...new Map(options.map((d) => [key(d), d])).values()];
}

export const sameDistribution = (a: Distribution, b: Distribution) =>
  a.townsfolk === b.townsfolk && a.outsider === b.outsider && a.minion === b.minion && a.demon === b.demon;

/** Comprueba una selección de personajes para la bolsa y explica qué falla. */
export function validateSelection(playerCount: number, characters: Character[]): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const bagSize = Math.min(playerCount, MAX_BAG_PLAYERS);
  const inBag = characters.filter((c) => c.team !== "traveller" && c.team !== "fabled");
  const counts = countByTeam(inBag);

  if (inBag.length !== bagSize) {
    issues.push({
      level: "error",
      message: `Hay ${inBag.length} personajes en la bolsa y deben ser ${bagSize}.`,
    });
  }
  if (counts.demon < 1) issues.push({ level: "error", message: "Falta el Demonio." });

  const options = allowedDistributions(playerCount, inBag);
  if (inBag.length === bagSize && !options.some((d) => sameDistribution(d, counts))) {
    const expected = options
      .map((d) => `${d.townsfolk} ${TEAM_LABEL.townsfolk.plural}, ${d.outsider} ${TEAM_LABEL.outsider.plural}, ${d.minion} ${TEAM_LABEL.minion.plural}, ${d.demon} ${TEAM_LABEL.demon.singular}`)
      .join(" o ");
    issues.push({ level: "error", message: `El reparto no cuadra. Se espera: ${expected}.` });
  }

  const ids = new Set(inBag.map((c) => c.id));
  for (const c of inBag) {
    const mod = SETUP_MODIFIERS[c.id];
    if (mod?.requires?.some((req) => !ids.has(req))) {
      issues.push({ level: "error", message: `${c.name} necesita ${mod.note.replace("+", "")} en la bolsa.` });
    }
  }
  if (ids.size !== inBag.length) issues.push({ level: "error", message: "Hay personajes repetidos." });
  if (playerCount < 7 && characters.some((c) => c.edition === "bmr" || c.edition === "snv")) {
    issues.push({
      level: "warning",
      message: "Con menos de 7 jugadores, Bad Moon Rising y Sects & Violets pueden quedar desequilibrados.",
    });
  }
  return issues;
}

/** Lo que se espera para cada equipo con lo que ya se ha elegido (para los contadores de la UI). */
export function targetDistribution(playerCount: number, characters: Character[]): Distribution {
  const options = allowedDistributions(playerCount, characters);
  const counts = countByTeam(characters);
  return options.find((d) => sameDistribution(d, counts)) ?? options[0];
}

export { countByTeam };
