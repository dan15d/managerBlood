import type { Alignment } from "./Character";

// Lo que se comparte con los jugadores: nunca el Grimorio, solo lo que se sabe en la mesa
// y lo que cada uno sabe de sí mismo.

/** Un asiento de la sala o de la partida, tal como lo ve el Narrador al montar la mesa. */
export interface Seat {
  id: string;
  seat: number;
  name: string;
  /** Sesión del jugador que se unió desde su móvil; nula si el Narrador lo añadió a mano. */
  userId?: string;
}

/** Información pública de un jugador (la que hay en la Plaza del Pueblo). */
export interface PublicPlayer {
  seat: number;
  name: string;
  alive: boolean;
  ghostVoteUsed: boolean;
}

export type TableStatus = "lobby" | "in_progress" | "finished";

/** Sala abierta por el Narrador, con su código para unirse. */
export interface Lobby {
  gameId: string;
  joinCode: string;
  scriptId: string;
  scriptName: string;
  characterIds: string[];
  status: TableStatus;
}

/** Lo que ve un jugador en su móvil. */
export interface PlayerView {
  gameId: string;
  seatId: string;
  seat: number;
  name: string;
  scriptName: string;
  characterIds: string[];
  status: TableStatus;
  phaseLabel?: string;
  winner?: Alignment;
  /** Personaje que cree ser (el Borracho ve su Aldeano falso). Sin repartir aún: undefined. */
  characterId?: string;
  alignment?: Alignment;
  alive: boolean;
  ghostVoteUsed: boolean;
  players: PublicPlayer[];
}
