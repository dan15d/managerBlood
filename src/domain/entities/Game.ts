import type { Alignment } from "./Character";

export type GameMode = "manual" | "ai";
export type GameStatus = "in_progress" | "finished";

export interface ReminderToken {
  id: string;
  /** Personaje que pone el recordatorio (p. ej. "poisoner"), o "custom". */
  sourceCharacterId: string;
  label: string;
}

export interface Player {
  id: string;
  seat: number;
  name: string;
  /** Personaje real (lo que ve el Narrador en el Grimorio). */
  characterId: string;
  /** Lo que cree ser el jugador si difiere (Borracho, Lunático…). */
  shownCharacterId?: string;
  alignment: Alignment;
  alive: boolean;
  /** Los muertos tienen un único voto para el resto de la partida. */
  ghostVoteUsed: boolean;
  reminders: ReminderToken[];
  notes?: string;
  /** Reservado para cuando los jugadores se unan desde su móvil. */
  userId?: string;
}

export type Phase = { kind: "night"; number: number } | { kind: "day"; number: number };

export interface Nomination {
  id: string;
  nominatorId: string;
  nomineeId: string;
  voterIds: string[];
  closed: boolean;
}

export interface GameLogEntry {
  at: string;
  phase: string;
  text: string;
}

export interface Game {
  id: string;
  name: string;
  mode: GameMode;
  scriptId: string;
  scriptName: string;
  /** Personajes del guion, para que los jugadores vean la lista aunque el guion sea personalizado. */
  scriptCharacterIds?: string[];
  players: Player[];
  /** Fábulas y Lóricos en juego: los usa el Narrador, no son jugadores y toda la mesa los conoce. */
  fabledIds?: string[];
  demonBluffs: string[];
  phase: Phase;
  /** Paso de la hoja de noche en el que va el Narrador. */
  nightStep: number;
  nominations: Nomination[];
  executedToday?: string;
  status: GameStatus;
  winner?: Alignment;
  log: GameLogEntry[];
  /** Explicación y consejos que dio la IA al preparar la partida. */
  aiNotes?: string;
  /** Código corto para que los jugadores se unan (fase futura). */
  joinCode: string;
  createdAt: string;
  updatedAt: string;
}
