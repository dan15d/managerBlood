import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog } from "@infrastructure/catalog/StaticCatalog";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { buildNightOrder } from "@domain/services/NightOrder";

// Intercambios de personaje: el Encantador de serpientes (con bando) y el Barbero (sin bando).

const catalog = new StaticCharacterCatalog();
const map = catalog.map();

function game(ids: string[]): Game {
  const players: Player[] = ids.map((characterId, seat) => ({
    id: `p${seat}`,
    seat,
    name: `J${seat + 1}`,
    characterId,
    alignment: ["minion", "demon"].includes(catalog.get(characterId)!.team) ? "evil" : "good",
    alive: true,
    ghostVoteUsed: false,
    reminders: [],
  }));
  return {
    id: "g",
    name: "Prueba",
    mode: "manual",
    scriptId: "",
    scriptName: "",
    players,
    demonBluffs: [],
    phase: { kind: "night", number: 2 },
    nightStep: 0,
    nominations: [],
    status: "in_progress",
    log: [],
    joinCode: "ABCDE",
    createdAt: "",
    updatedAt: "",
  };
}

const ids = ["vortox", "cerenovus", "snakecharmer", "clockmaker", "dreamer", "oracle", "flowergirl"];
const charm = (g: Game, target: string) =>
  rules.applyReminderChoice(g, target, { id: "c", sourceCharacterId: "snakecharmer", label: "Envenenado" }, map);

describe("Encantador de serpientes", () => {
  it("si elige al Demonio, intercambian personajes y bandos y el antiguo Demonio queda envenenado", () => {
    const { game: g, message } = charm(game(ids), "p0");
    expect(g.players[2]).toMatchObject({ characterId: "vortox", alignment: "evil" });
    expect(g.players[0]).toMatchObject({ characterId: "snakecharmer", alignment: "good" });
    expect(g.players[0].reminders.map((r) => `${r.sourceCharacterId}/${r.label}`)).toEqual(["snakecharmer/Envenenado"]);
    expect(message).toContain("ha elegido al Demonio");
    // El veneno es para siempre: no se propone quitarlo al anochecer.
    expect(rules.expiringReminders(g)).toEqual([]);
    // La partida sigue: hay un Demonio vivo y la hoja de noche despierta al nuevo.
    expect(rules.victoryHint(g, map)).toBeNull();
    expect(buildNightOrder(g, map).find((s) => s.key === "char:vortox")?.playerIds).toEqual(["p2"]);
  });

  it("si elige a otro, no pasa nada", () => {
    const { game: g, message } = charm(game(ids), "p3");
    expect(g.players.map((p) => p.characterId)).toEqual(ids);
    expect(message).toContain("no es el Demonio");
  });

  it("si está envenenado (o es el Borracho), no hay intercambio", () => {
    const poisoned = rules.addReminder(game(ids), "p2", { id: "e", sourceCharacterId: "cerenovus", label: "Envenenado" });
    expect(charm(poisoned, "p0").game.players[0].characterId).toBe("vortox");
    const drunk = game(["vortox", "cerenovus", "drunk", "clockmaker", "dreamer"]);
    drunk.players[2].shownCharacterId = "snakecharmer";
    expect(charm(drunk, "p0").message).toContain("no tiene habilidad");
  });
});

describe("Barbero", () => {
  it("intercambia personajes pero cada uno conserva su bando", () => {
    const g = rules.swapCharacters(game(["imp", "poisoner", "barber", "chef", "empath"]), "p1", "p3", map);
    expect(g.players[1]).toMatchObject({ characterId: "chef", alignment: "evil" });
    expect(g.players[3]).toMatchObject({ characterId: "poisoner", alignment: "good" });
  });

  it("lo que cree ser el Borracho viaja con su personaje", () => {
    const g0 = game(["imp", "drunk", "chef", "empath", "monk"]);
    g0.players[1].shownCharacterId = "empath";
    const g = rules.swapCharacters(g0, "p1", "p2", map);
    expect(g.players[2]).toMatchObject({ characterId: "drunk", shownCharacterId: "empath" });
    expect(g.players[1].shownCharacterId).toBeUndefined();
  });
});
