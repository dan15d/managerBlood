import { defaultAlignment, isStorytellerTeam, type Character } from "@domain/entities/Character";
import type { Game, GameMode, Player } from "@domain/entities/Game";
import type { Script } from "@domain/entities/Script";
import type { Seat } from "@domain/entities/Table";
import { phaseLabel } from "@domain/services/GameRules";
import { shuffle, type RandomFn } from "@domain/services/Random";
import { applySetupEffects, seatMarionette } from "@domain/services/SetupGenerator";
import { gameCharacterIds, jinxesAmong } from "@domain/services/SpecialRules";
import { validateSelection } from "@domain/services/SetupRules";
import type { AiStoryteller } from "../ports/AiStoryteller";
import type { CharacterCatalog } from "../ports/CharacterCatalog";
import type { GameRepository, GameSummary } from "../ports/GameRepository";
import type { IdGenerator } from "../ports/IdGenerator";
import type { TablePublisher } from "../ports/TableGateway";

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
  /** Fábulas y Lóricos en juego (no son jugadores). */
  fabledIds?: string[];
  aiNotes?: string;
  /** Sala de la que sale la partida: mismo id y código, y los asientos de quienes se unieron (en orden). */
  table?: { gameId: string; joinCode: string; seats: Seat[] };
}

export class CreateGame {
  constructor(
    private readonly repo: GameRepository,
    private readonly catalog: CharacterCatalog,
    private readonly ids: IdGenerator,
    private readonly random: RandomFn,
    private readonly publisher: TablePublisher,
  ) {}

  async execute(input: CreateGameInput): Promise<Game> {
    if (input.table && input.table.seats.length !== input.playerNames.length) {
      throw new Error("Los asientos de la sala no coinciden con los jugadores.");
    }
    const names = input.playerNames.map((n, i) => n.trim() || `Jugador ${i + 1}`);
    const bag = input.characterIds.map((id) => {
      const c = this.catalog.get(id);
      if (!c) throw new Error(`Personaje desconocido: ${id}`);
      return c;
    });
    const fabled = (input.fabledIds ?? []).map((id) => this.catalog.get(id)).filter((c): c is Character => !!c && isStorytellerTeam(c.team));
    const travellerSeats = Object.keys(input.travellers ?? {}).map(Number);
    const errors = validateSelection(names.length - travellerSeats.length, [...bag, ...fabled]).filter((i) => i.level === "error");
    if (errors.length) throw new Error(errors.map((e) => e.message).join(" "));

    const seatsForBag = names.map((_, seat) => seat).filter((seat) => !travellerSeats.includes(seat));
    const assignment = input.assignment ?? {};
    // Lo que queda en la bolsa tras quitar lo asignado a mano (puede haber fichas repetidas con el Papa).
    const left = [...input.characterIds];
    for (const id of Object.values(assignment)) {
      const i = left.indexOf(id);
      if (i >= 0) left.splice(i, 1);
    }
    const remaining = shuffle(left, this.random);

    let players: Player[] = names.map((name, seat) => {
      const characterId = input.travellers?.[seat] ?? assignment[seat] ?? (seatsForBag.includes(seat) ? remaining.shift() : undefined);
      if (!characterId) throw new Error(`Falta el personaje del asiento ${seat + 1}.`);
      const character = this.catalog.get(characterId)!;
      const seatInfo = input.table?.seats[seat];
      return {
        id: seatInfo?.id ?? this.ids.uuid(),
        userId: seatInfo?.userId,
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

    // Al sacarlos de la bolsa, la Marioneta se sienta junto al Demonio (a mano, lo decide el Narrador).
    if (!input.assignment) players = seatMarionette(players, this.catalog.map(), this.random);
    const setup = applySetupEffects(players, this.catalog.map(), this.random, () => this.ids.uuid());
    players = setup.players;
    const log = setup.log;

    const now = new Date().toISOString();
    const game: Game = {
      id: input.table?.gameId ?? this.ids.uuid(),
      name: input.name.trim() || `${input.script.name} · ${new Date().toLocaleDateString("es-ES")}`,
      mode: input.mode,
      scriptId: input.script.id,
      scriptName: input.script.name,
      scriptCharacterIds: input.script.characterIds,
      players,
      fabledIds: fabled.map((c) => c.id),
      demonBluffs: input.bluffIds.slice(0, 3),
      phase: { kind: "night", number: 1 },
      nightStep: 0,
      nominations: [],
      status: "in_progress",
      log: [`Partida creada con ${players.length} jugadores.`, ...log].map((text) => ({ at: now, phase: "Preparación", text })),
      aiNotes: input.aiNotes,
      joinCode: input.table?.joinCode ?? this.ids.joinCode(),
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.save(game);
    await this.publisher.publish(game, this.catalog.map());
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

/** Guarda el Grimorio y publica en la mesa lo que pueden ver los jugadores. */
export class SaveGame {
  constructor(
    private readonly repo: GameRepository,
    private readonly publisher: TablePublisher,
    private readonly catalog: CharacterCatalog,
  ) {}

  async execute(game: Game) {
    await this.repo.save(game);
    await this.publisher.publish(game, this.catalog.map());
  }
}

export class DeleteGame {
  constructor(
    private readonly repo: GameRepository,
    private readonly publisher: TablePublisher,
  ) {}

  async execute(id: string) {
    await this.repo.delete(id);
    await this.publisher.remove(id);
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
    const jinxes = jinxesAmong(gameCharacterIds(game), this.catalog.jinxes());
    return this.ai.advise({ game, characters: this.catalog.map(), jinxes, question: question.trim() });
  }
}

export class TestAiConnection {
  constructor(private readonly ai: AiStoryteller) {}
  execute() {
    return this.ai.checkConnection();
  }
}
