import type { Character, CharacterPair, Jinx } from "../entities/Character";
import type { Game } from "../entities/Game";

// Fábulas, Lóricos e incompatibilidades (jinxes): lo que cambia la preparación o la noche.
// El resto de sus efectos los resuelve el Narrador con los recordatorios.

/** Con incompatibilidades en el guion, el Djinn está en juego para que todos conozcan la regla. */
export const DJINN = "djinn";
/** Los malos reciben su información inicial aunque haya menos de 7 jugadores. */
export const TOYMAKER = "toymaker";
/** Nadie conoce su personaje hasta morir y no hay información de Esbirros ni Demonio. */
export const TOR = "tor";
/** Puede haber personajes buenos repetidos. */
export const POPE = "pope";
/** El Narrador puede asignar personajes a jugadores concretos. */
export const GARDENER = "gardener";

/** Incompatibilidades (o interacciones) cuyos dos personajes están entre los dados. */
export function jinxesAmong<T extends CharacterPair>(characterIds: Iterable<string>, pairs: T[]): T[] {
  const ids = new Set(characterIds);
  return pairs.filter((j) => ids.has(j.characterIds[0]) && ids.has(j.characterIds[1]));
}

/** Incompatibilidades (o interacciones) de un personaje con los demás dados. */
export const jinxesOf = <T extends CharacterPair>(characterId: string, others: Iterable<string>, pairs: T[]): T[] =>
  jinxesAmong([characterId, ...others], pairs).filter((j) => j.characterIds.includes(characterId));

/**
 * Fábulas y Lóricos con los que empieza una partida de este guion: los que trae el guion
 * y el Djinn si alguno de sus personajes tiene una incompatibilidad con otro.
 */
export function defaultFabled(scriptCharacters: Character[], jinxes: Jinx[]): string[] {
  const own = scriptCharacters.filter((c) => c.team === "fabled" || c.team === "loric").map((c) => c.id);
  const djinn = jinxesAmong(scriptCharacters.map((c) => c.id), jinxes).length > 0 ? [DJINN] : [];
  return [...new Set([...own, ...djinn])];
}

export const hasFabled = (game: Pick<Game, "fabledIds">, id: string) => (game.fabledIds ?? []).includes(id);

/** Personajes del Grimorio (de jugadores, los que creen ser y las Fábulas), para buscar incompatibilidades. */
export const gameCharacterIds = (game: Game) => [
  ...new Set([
    ...game.players.flatMap((p) => [p.characterId, p.shownCharacterId].filter((id): id is string => !!id)),
    ...(game.fabledIds ?? []),
  ]),
];
