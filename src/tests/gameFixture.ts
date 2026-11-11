import type { Game } from "@domain/entities/Game";
import { GAME_SCHEMA_VERSION } from "@domain/services/GameSchema";

/** Lo que tiene toda partida nueva y los tests no necesitan escribir (se puede sobrescribir). */
export const NEW_GAME: Pick<Game, "schemaVersion" | "fabledIds" | "nightDeaths" | "nightRevivals" | "dayDeaths" | "extraCharacterIds"> = {
  schemaVersion: GAME_SCHEMA_VERSION,
  fabledIds: [],
  nightDeaths: [],
  nightRevivals: [],
  dayDeaths: [],
  extraCharacterIds: [],
};
