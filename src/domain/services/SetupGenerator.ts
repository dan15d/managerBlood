import { isGoodTeam, type Character, type Team } from "../entities/Character";
import type { Player } from "../entities/Game";
import { pick, shuffle, type RandomFn } from "./Random";
import {
  allowedDistributions,
  baseDistribution,
  DECOYS,
  isDealt,
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

    if (bag.filter(isDealt).length === bagSize && !validateSelection(playerCount, bag).some((i) => i.level === "error")) {
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
    // La Marioneta no puede creer ser el Rey si está el Niño del coro (wiki: interacción Marioneta-Rey).
    const forbidden = c.id === "marionette" && used.has("choirboy") ? "king" : undefined;
    const candidates = scriptCharacters.filter((s) => s.team === team && !used.has(s.id) && s.id !== forbidden);
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

/**
 * La Marioneta empieza junto al Demonio. Si al sacar de la bolsa ha caído lejos, cambia la
 * ficha con un vecino del Demonio (nunca con un Viajero).
 */
export function seatMarionette(players: Player[], characters: Map<string, Character>, random: RandomFn): Player[] {
  const team = (p: Player) => characters.get(p.characterId)?.team;
  const marionette = players.find((p) => p.characterId === "marionette");
  const demon = players.find((p) => team(p) === "demon");
  if (!marionette || !demon) return players;
  const n = players.length;
  const neighbours = players.filter((p) => p.seat === (demon.seat + 1) % n || p.seat === (demon.seat - 1 + n) % n);
  if (neighbours.includes(marionette)) return players;
  const other = pick(neighbours.filter((p) => team(p) !== "traveller" && p !== demon), random);
  if (!other) return players;
  const swap = (p: Player, from: Player): Player => ({
    ...p,
    characterId: from.characterId,
    shownCharacterId: from.shownCharacterId,
    alignment: from.alignment,
  });
  return players.map((p) => (p === marionette ? swap(p, other) : p === other ? swap(p, marionette) : p));
}

/**
 * Lo que la preparación hace después de repartir: el Cazarrecompensas vuelve malo a un Aldeano
 * y, si hay varios Tontos del pueblo, uno está borracho. Devuelve los jugadores y qué se ha hecho.
 */
export function applySetupEffects(
  players: Player[],
  characters: Map<string, Character>,
  random: RandomFn,
  newId: () => string,
): { players: Player[]; log: string[] } {
  const log: string[] = [];
  let result = players;
  if (players.some((p) => p.characterId === "bountyhunter")) {
    const target = pick(players.filter((p) => characters.get(p.characterId)?.team === "townsfolk" && p.characterId !== "bountyhunter"), random);
    if (target) {
      result = result.map((p) => (p.id === target.id ? { ...p, alignment: "evil" } : p));
      log.push(`${target.name} es el Aldeano malo del Cazarrecompensas: díselo cuando le enseñes su personaje.`);
    }
  }
  const idiots = result.filter((p) => p.characterId === "villageidiot");
  if (idiots.length > 1) {
    const drunk = pick(idiots, random)!;
    result = result.map((p) =>
      p.id === drunk.id ? { ...p, reminders: [...p.reminders, { id: newId(), sourceCharacterId: "villageidiot", label: "Borracho" }] } : p,
    );
    log.push(`${drunk.name} es el Tonto del pueblo borracho.`);
  }
  // No Dashii: los Aldeanos más cercanos a cada lado están envenenados desde el principio.
  for (const demon of result.filter((p) => p.characterId === "nodashii")) {
    const poisoned = nearestTownsfolk(result, demon, characters);
    const ids = new Set(poisoned.map((p) => p.id));
    result = result.map((p) =>
      ids.has(p.id) ? { ...p, reminders: [...p.reminders, { id: newId(), sourceCharacterId: "nodashii", label: "Envenenado" }] } : p,
    );
    if (poisoned.length) log.push(`${poisoned.map((p) => p.name).join(" y ")}: envenenados por el No Dashii (Aldeanos vecinos).`);
  }
  // Gemela malvada y Abuela: un jugador bueno al azar con su recordatorio (se puede cambiar a mano).
  const marks: [string, string, string][] = [
    ["eviltwin", "Gemelo", "es el gemelo bueno de la Gemela malvada"],
    ["grandmother", "Nieto", "es el nieto de la Abuela"],
  ];
  for (const [source, label, text] of marks) {
    if (!result.some((p) => p.characterId === source)) continue;
    const good = result.filter((p) => p.alignment === "good" && p.characterId !== source && isGoodTeam(characters.get(p.characterId)?.team ?? "traveller"));
    const chosen = pick(good, random);
    if (!chosen) continue;
    result = result.map((p) => (p.id === chosen.id ? { ...p, reminders: [...p.reminders, { id: newId(), sourceCharacterId: source, label }] } : p));
    log.push(`${chosen.name} ${text}.`);
  }
  return { players: result, log };
}

/** El Aldeano más cercano a cada lado de un jugador (saltando a los que no son Aldeanos). */
export function nearestTownsfolk(players: Player[], from: Player, characters: Map<string, Character>): Player[] {
  const seated = [...players].sort((a, b) => a.seat - b.seat);
  const n = seated.length;
  const at = seated.findIndex((p) => p.id === from.id);
  const walk = (dir: 1 | -1) => {
    for (let k = 1; k < n; k++) {
      const p = seated[(at + dir * k + n) % n];
      if (characters.get(p.characterId)?.team === "townsfolk") return p;
    }
    return undefined;
  };
  return [...new Set([walk(-1), walk(1)].filter((p): p is Player => !!p))];
}
