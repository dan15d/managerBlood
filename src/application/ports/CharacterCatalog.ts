import type { Character, Jinx } from "@domain/entities/Character";

/** Fuente de personajes (oficiales y, en el futuro, homebrew). */
export interface CharacterCatalog {
  all(): Character[];
  get(id: string): Character | undefined;
  /** Mapa id → personaje, para las reglas del dominio. */
  map(): Map<string, Character>;
  /** Incompatibilidades oficiales entre personajes. */
  jinxes(): Jinx[];
}
