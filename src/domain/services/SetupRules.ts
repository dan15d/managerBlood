import type { Character, Team } from "../entities/Character";
import { isGoodTeam, TEAM_LABEL, TEAMS_IN_BAG } from "../entities/Character";
import { POPE } from "./SpecialRules";

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
  /** Sin Demonio en la bolsa: su sitio lo ocupa un Aldeano (Invocador). */
  noDemon?: boolean;
  /** Sin Esbirros ni Demonio: todos sus sitios los ocupan Aldeanos (Ateo). */
  noEvil?: boolean;
  /** Cuántas fichas iguales puede haber en la bolsa (Tonto del pueblo). */
  copies?: number;
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
  atheist: { noEvil: true, note: "No hay malos" },
  summoner: { noDemon: true, note: "No hay Demonio" },
  villageidiot: { copies: 3, note: "+0 a +2 Tontos del pueblo" },
  bountyhunter: { note: "1 Aldeano es malo" },
  marionette: { note: "Junto al Demonio" },
};

/** Incompatibilidades que prohíben que dos personajes empiecen a la vez en juego. */
export const INCOMPATIBLE: readonly [string, string][] = [
  ["heretic", "baron"],
  ["heretic", "godfather"],
  ["heretic", "pithag"],
  ["heretic", "spy"],
  ["heretic", "widow"],
  ["heretic", "lleech"],
  ["legion", "engineer"],
];

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
  const mods = [...new Set(characters.map((c) => c.id))].map((id) => SETUP_MODIFIERS[id]).filter(Boolean);
  for (const mod of mods) {
    if (mod.noEvil || mod.noDemon) {
      options = options.map((d) => {
        const removed = mod.noEvil ? d.minion + d.demon : d.demon;
        return { ...d, townsfolk: d.townsfolk + removed, minion: mod.noEvil ? 0 : d.minion, demon: 0 };
      });
      continue;
    }
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

/**
 * Comprueba una selección de personajes para la bolsa y explica qué falla. Puede incluir las
 * Fábulas y Lóricos en juego: no van a la bolsa, pero algunos cambian la preparación
 * (el Centinela, un Forastero más o menos; el Papa, buenos repetidos).
 */
export function validateSelection(playerCount: number, characters: Character[]): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const bagSize = Math.min(playerCount, MAX_BAG_PLAYERS);
  const inBag = characters.filter((c) => TEAMS_IN_BAG.includes(c.team));
  const counts = countByTeam(inBag);
  const ids = new Set(inBag.map((c) => c.id));

  if (inBag.length !== bagSize) {
    issues.push({
      level: "error",
      message: `Hay ${inBag.length} personajes en la bolsa y deben ser ${bagSize}.`,
    });
  }
  const withoutDemon = inBag.some((c) => SETUP_MODIFIERS[c.id]?.noDemon || SETUP_MODIFIERS[c.id]?.noEvil);
  if (counts.demon < 1 && !withoutDemon) issues.push({ level: "error", message: "Falta el Demonio." });

  const options = allowedDistributions(playerCount, characters);
  if (inBag.length === bagSize && !options.some((d) => sameDistribution(d, counts))) {
    const expected = options
      .map((d) => `${d.townsfolk} ${TEAM_LABEL.townsfolk.plural}, ${d.outsider} ${TEAM_LABEL.outsider.plural}, ${d.minion} ${TEAM_LABEL.minion.plural}, ${d.demon} ${TEAM_LABEL.demon.singular}`)
      .join(" o ");
    issues.push({ level: "error", message: `El reparto no cuadra. Se espera: ${expected}.` });
  }

  for (const c of inBag.filter((x, i) => inBag.indexOf(x) === i)) {
    const mod = SETUP_MODIFIERS[c.id];
    if (mod?.requires?.some((req) => !ids.has(req))) {
      issues.push({ level: "error", message: `${c.name} necesita ${mod.note.replace("+", "")} en la bolsa.` });
    }
  }
  // Con el Papa puede haber buenos repetidos; el Tonto del pueblo trae sus copias. El Mal nunca.
  const pope = characters.some((c) => c.id === POPE);
  for (const id of ids) {
    const copies = inBag.filter((c) => c.id === id);
    const allowed = SETUP_MODIFIERS[id]?.copies ?? (pope && isGoodTeam(copies[0].team) ? bagSize : 1);
    if (copies.length > allowed) {
      issues.push({
        level: "error",
        message: allowed > 1 ? `Puede haber hasta ${allowed} ${copies[0].name}.` : `${copies[0].name} está repetido.${pope ? " Solo los buenos pueden repetirse." : ""}`,
      });
    }
  }
  for (const [a, b] of INCOMPATIBLE) {
    const first = inBag.find((c) => c.id === a);
    const second = inBag.find((c) => c.id === b);
    if (first && second) issues.push({ level: "error", message: `${first.name} y ${second.name} no pueden estar los dos en juego.` });
  }
  if (playerCount < 7 && inBag.some((c) => c.edition === "bmr" || c.edition === "snv")) {
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
  const counts = countByTeam(characters.filter((c) => TEAMS_IN_BAG.includes(c.team)));
  return options.find((d) => sameDistribution(d, counts)) ?? options[0];
}

export { countByTeam };
