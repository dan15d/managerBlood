import type { Character } from "@domain/entities/Character";
import type { Game } from "@domain/entities/Game";
import type { Lobby, PlayerView, Seat } from "@domain/entities/Table";

export type Unsubscribe = () => void;

/** Acceso de Narrador con la contraseña común. */
export interface AdminAuth {
  /** false si este despliegue no admite jugadores (sin nube): entonces todo el mundo es Narrador. */
  readonly required: boolean;
  isAdmin(): Promise<boolean>;
  login(password: string): Promise<boolean>;
  logout(): Promise<void>;
}

/** La sala donde se unen los jugadores, vista desde el Narrador. */
export interface LobbyGateway {
  open(input: { gameId: string; joinCode: string; scriptId: string; scriptName: string; characterIds: string[] }): Promise<Lobby>;
  get(gameId: string): Promise<Lobby | null>;
  listOpen(): Promise<Lobby[]>;
  changeScript(gameId: string, script: { id: string; name: string; characterIds: string[] }): Promise<void>;
  seats(gameId: string): Promise<Seat[]>;
  watchSeats(gameId: string, onChange: (seats: Seat[]) => void): Unsubscribe;
  addSeat(gameId: string, name: string): Promise<void>;
  removeSeat(seatId: string): Promise<void>;
  /** Guarda el orden de los asientos (como estén sentados en la mesa). */
  reorder(gameId: string, seatIds: string[]): Promise<void>;
  close(gameId: string): Promise<void>;
}

/** Publica en la mesa lo que pueden ver los jugadores cada vez que cambia la partida. */
export interface TablePublisher {
  publish(game: Game, characters: Map<string, Character>): Promise<void>;
  remove(gameId: string): Promise<void>;
}

/** El móvil del jugador. */
export interface PlayerGateway {
  join(code: string, name: string): Promise<{ gameId: string; seatId: string }>;
  /** Partidas en las que esta sesión tiene asiento, la más reciente primero. */
  mySeats(): Promise<{ gameId: string; seatId: string }[]>;
  view(gameId: string, seatId: string): Promise<PlayerView | null>;
  watch(gameId: string, seatId: string, onChange: (view: PlayerView | null) => void): Unsubscribe;
  leave(seatId: string): Promise<void>;
}
