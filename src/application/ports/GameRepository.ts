import type { Game } from "@domain/entities/Game";
import type { Unsubscribe } from "./TableGateway";

export interface GameSummary {
  id: string;
  name: string;
  scriptName: string;
  playerCount: number;
  phaseLabel: string;
  status: Game["status"];
  updatedAt: string;
}

/** Otro dispositivo guardó la partida después de que este la cargara: no se pisa su versión. */
export class GameConflictError extends Error {
  constructor() {
    super("La partida ha cambiado en otro dispositivo.");
    this.name = "GameConflictError";
  }
}

export interface GameRepository {
  list(): Promise<GameSummary[]>;
  get(id: string): Promise<Game | null>;
  /**
   * Guarda la partida. Con `expectUpdatedAt` solo la guarda si la versión guardada sigue siendo esa
   * (la última que vio este dispositivo); si otro la ha cambiado entretanto, lanza GameConflictError.
   */
  save(game: Game, expectUpdatedAt?: string): Promise<void>;
  delete(id: string): Promise<void>;
  /** Avisa cuando la partida cambia desde otro sitio (otro dispositivo, otra pestaña); con null si se borra. */
  watch(id: string, onChange: (game: Game | null) => void): Unsubscribe;
}
