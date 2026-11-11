import { describe, expect, it } from "vitest";
import { GameNotFoundError } from "@application/ports/GameRepository";
import { LoadGame } from "@application/use-cases/GameUseCases";
import type { Game, StoredGame } from "@domain/entities/Game";
import { GAME_SCHEMA_VERSION, GameFromNewerAppError, upgradeGame } from "@domain/services/GameSchema";
import { LocalStorageGameRepository } from "@infrastructure/persistence/LocalStorageRepositories";

/** Una partida como las que guardaba la app antes de tener versión: sin las listas añadidas después. */
const legacy = (extra: Partial<StoredGame> = {}): StoredGame => ({
  id: "g",
  name: "Antigua",
  mode: "manual",
  scriptId: "trouble-brewing",
  scriptName: "Trouble Brewing",
  players: [],
  demonBluffs: [],
  phase: { kind: "night", number: 2 },
  nightStep: 3,
  nominations: [],
  status: "in_progress",
  log: [],
  joinCode: "ABCDE",
  createdAt: "2026-10-28T20:00:00.000Z",
  updatedAt: "2026-10-28T21:00:00.000Z",
  ...extra,
});

describe("versión de las partidas guardadas", () => {
  it("una partida sin versión se pone al día con las listas vacías", () => {
    const game = upgradeGame(legacy());
    expect(game.schemaVersion).toBe(GAME_SCHEMA_VERSION);
    expect(game).toMatchObject({ fabledIds: [], nightDeaths: [], nightRevivals: [], dayDeaths: [], extraCharacterIds: [] });
    // El resto no cambia.
    expect(game).toMatchObject({ name: "Antigua", phase: { kind: "night", number: 2 }, nightStep: 3, updatedAt: "2026-10-28T21:00:00.000Z" });
  });

  it("conserva lo que ya tenía", () => {
    const game = upgradeGame(legacy({ nightDeaths: ["p1"], fabledIds: ["sentinel"] }));
    expect(game.nightDeaths).toEqual(["p1"]);
    expect(game.fabledIds).toEqual(["sentinel"]);
  });

  it("una partida al día queda igual", () => {
    const current = upgradeGame(legacy({ dayDeaths: ["p2"] }));
    expect(upgradeGame(current)).toEqual(current);
  });

  it("no abre una partida guardada por una versión más nueva de la app", () => {
    expect(() => upgradeGame(legacy({ schemaVersion: GAME_SCHEMA_VERSION + 1 }))).toThrow(GameFromNewerAppError);
  });

  it("el repositorio del navegador devuelve la partida ya al día", async () => {
    const repo = new LocalStorageGameRepository();
    await repo.save(legacy({ id: "vieja" }) as Game);
    const game = await repo.get("vieja");
    expect(game?.schemaVersion).toBe(GAME_SCHEMA_VERSION);
    expect(game?.nightRevivals).toEqual([]);
    await repo.delete("vieja");
  });

  it("cargar una partida que no existe avisa con GameNotFoundError", async () => {
    await expect(new LoadGame(new LocalStorageGameRepository()).execute("no-existe")).rejects.toBeInstanceOf(GameNotFoundError);
  });
});
