import type { Game, StoredGame } from "../entities/Game";

// Las partidas se guardan enteras (en el navegador o en Supabase) y duran más que la versión de
// la app que las creó. Al cargarlas se ponen al día aquí, así el resto del código siempre trabaja
// con una partida completa.
//
// Para cambiar el formato: sube GAME_SCHEMA_VERSION y añade a UPGRADES lo que hay que hacer para
// pasar de la versión anterior a la nueva.

export const GAME_SCHEMA_VERSION = 1;

/** La app es más antigua que la partida (p. ej. un móvil con la versión anterior en caché). */
export class GameFromNewerAppError extends Error {
  constructor() {
    super("Esta partida se guardó con una versión más nueva de la app. Recarga la página para actualizarla.");
    this.name = "GameFromNewerAppError";
  }
}

type Upgrade = (game: StoredGame) => StoredGame;

/** UPGRADES[n] pasa una partida de la versión n a la n + 1. */
const UPGRADES: Upgrade[] = [
  // 0 → 1: las partidas sin versión pueden no tener estas listas (se añadieron más tarde).
  (game) => ({
    ...game,
    fabledIds: game.fabledIds ?? [],
    nightDeaths: game.nightDeaths ?? [],
    nightRevivals: game.nightRevivals ?? [],
    dayDeaths: game.dayDeaths ?? [],
    extraCharacterIds: game.extraCharacterIds ?? [],
  }),
];

/** Pone al día una partida guardada con cualquier versión anterior. */
export function upgradeGame(stored: StoredGame): Game {
  const from = stored.schemaVersion ?? 0;
  if (from > GAME_SCHEMA_VERSION) throw new GameFromNewerAppError();
  let game = stored;
  for (let version = from; version < GAME_SCHEMA_VERSION; version++) game = UPGRADES[version](game);
  return { ...game, schemaVersion: GAME_SCHEMA_VERSION } as Game;
}
