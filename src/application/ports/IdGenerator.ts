export interface IdGenerator {
  uuid(): string;
  /** Código corto y legible para unirse a una partida (p. ej. «K7QP»). */
  joinCode(): string;
}
