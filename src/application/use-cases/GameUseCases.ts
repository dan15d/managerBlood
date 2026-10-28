import { defaultAlignment } from "@domain/entities/Character";
import type { Game, GameMode, Player } from "@domain/entities/Game";
import type { Script } from "@domain/entities/Script";
import { phaseLabel } from "@domain/services/GameRules";
import { shuffle, type RandomFn } from "@domain/services/Random";
import { validateSelection } from "@domain/services/SetupRules";
import type { AiStoryteller } from "../ports/AiStoryteller";
import type { CharacterCatalog } from "../ports/CharacterCatalog";
import type { GameRepository, GameSummary } from "../ports/GameRepository";
import type { IdGenerator } from "../ports/IdGenerator";

export interface CreateGameInput {
  name: string;
  mode: GameMode;
  script: Script;
  playerNames: string[];
  characterIds: string[];
  bluffIds: string[];
  decoys: Record<string, string>;
  /** Asiento → personaje. Si falta, los personajes se reparten al azar (como sacarlos de la bolsa). */
  assignment?: Record<number, string>;
  /** Viajeros elegidos por los jugadores que sobran (más de 15). Asiento → personaje. */
  travellers?: Record<number, string>;
  aiNotes?: string;
}

export class CreateGame {
  constructor(
    private readonly repo: GameRepository,
    private readonly catalog: CharacterCatalog,
    private readonly ids: IdGenerator,
    private readonly random: RandomFn,
  ) {}

  async execute(input: CreateGameInput): Promise<Game> {
    const names = input.playerNames.map((n, i) => n.trim() || `Jugador ${i + 1}`);
    const bag = input.characterIds.map((id) => {
      const c = this.catalog.get(id);
      if (!c) throw new Error(`Personaje desconocido: ${id}`);
      return c;
    });
    const travellerSeats = Object.keys(input.travellers ?? {}).map(Number);
    const errors = validateSelection(names.length - travellerSeats.length, bag).filter((i) => i.level === "error");
    if (errors.length) throw new Error(errors.map((e) => e.message).join(" "));

    const seatsForBag = names.map((_, seat) => seat).filter((seat) => !travellerSeats.includes(seat));
    const assignment = input.assignment ?? {};
    const assigned = new Set(Object.values(assignment));
    const remaining = shuffle(input.characterIds.filter((id) => !assigned.has(id)), this.random);

    const players: Player[] = names.map((name, seat) => {
      const characterId = input.travellers?.[seat] ?? assignment[seat] ?? (seatsForBag.includes(seat) ? remaining.shift() : undefined);
      if (!characterId) throw new Error(`Falta el personaje del asiento ${seat + 1}.`);
      const character = this.catalog.get(characterId)!;
      return {
        id: this.ids.uuid(),
        seat,
        name,
        characterId,
        shownCharacterId: input.decoys[characterId],
        alignment: defaultAlignment(character.team),
        alive: true,
        ghostVoteUsed: false,
        reminders: [],
      };
    });

    const now = new Date().toISOString();
    const game: Game = {
      id: this.ids.uuid(),
      name: input.name.trim() || `${input.script.name} · ${new Date().toLocaleDateString("es-ES")}`,
      mode: input.mode,
      scriptId: input.script.id,
      scriptName: input.script.name,
      players,
      demonBluffs: input.bluffIds.slice(0, 3),
      phase: { kind: "night", number: 1 },
      nightStep: 0,
      nominations: [],
      status: "in_progress",
      log: [{ at: now, phase: "Preparación", text: `Partida creada con ${players.length} jugadores.` }],
      aiNotes: input.aiNotes,
      joinCode: this.ids.joinCode(),
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.save(game);
    return game;
  }
}

export class ListGames {
  constructor(private readonly repo: GameRepository) {}
  async execute(): Promise<GameSummary[]> {
    const list = await this.repo.list();
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

export class LoadGame {
  constructor(private readonly repo: GameRepository) {}
  async execute(id: string): Promise<Game> {
    const game = await this.repo.get(id);
    if (!game) throw new Error("No encuentro esa partida.");
    return game;
  }
}

export class SaveGame {
  constructor(private readonly repo: GameRepository) {}
  execute(game: Game) {
    return this.repo.save(game);
  }
}

export class DeleteGame {
  constructor(private readonly repo: GameRepository) {}
  execute(id: string) {
    return this.repo.delete(id);
  }
}

export const summarize = (game: Game): GameSummary => ({
  id: game.id,
  name: game.name,
  scriptName: game.scriptName,
  playerCount: game.players.length,
  phaseLabel: game.status === "finished" ? (game.winner === "good" ? "Ganó el Bien" : "Ganó el Mal") : phaseLabel(game.phase),
  status: game.status,
  updatedAt: game.updatedAt,
});

/** Consulta al narrador de IA sobre la partida en curso (información falsa, dudas de reglas…). */
export class AskAiAdvice {
  constructor(
    private readonly ai: AiStoryteller,
    private readonly catalog: CharacterCatalog,
  ) {}

  execute(game: Game, question: string): Promise<string> {
    if (!question.trim()) throw new Error("Escribe la pregunta.");
    return this.ai.advise({ game, characters: this.catalog.map(), question: question.trim() });
  }
}

export class TestAiConnection {
  constructor(private readonly ai: AiStoryteller) {}
  execute() {
    return this.ai.checkConnection();
  }
}
