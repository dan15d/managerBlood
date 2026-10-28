import type { Game } from "@domain/entities/Game";

export interface GameSummary {
  id: string;
  name: string;
  scriptName: string;
  playerCount: number;
  phaseLabel: string;
  status: Game["status"];
  updatedAt: string;
}

export interface GameRepository {
  list(): Promise<GameSummary[]>;
  get(id: string): Promise<Game | null>;
  save(game: Game): Promise<void>;
  delete(id: string): Promise<void>;
}
