import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog } from "@infrastructure/catalog/StaticCatalog";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { advanceAfterChoice } from "@domain/services/NightInfo";
import { buildNightOrder } from "@domain/services/NightOrder";

// La hoja de noche pasa sola al siguiente paso cuando elegir jugador era la acción principal.

const catalog = new StaticCharacterCatalog();
const map = catalog.map();

function game(ids: string[], night = 2): Game {
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
    phase: { kind: "night", number: night },
    nightStep: 0,
    nominations: [],
    status: "in_progress",
    log: [],
    joinCode: "ABCDE",
    createdAt: "",
    updatedAt: "",
  };
}

/** La partida en el paso de noche de ese personaje. */
function atStep(g: Game, characterId: string): Game {
  const index = buildNightOrder(g, map).findIndex((s) => s.character?.id === characterId);
  expect(index).toBeGreaterThan(0);
  return { ...g, nightStep: index };
}

const r = (source: string, label: string) => ({ id: `${source}-${label}`, sourceCharacterId: source, label });

/** Toca al jugador con el botón principal del paso y dice si la hoja ha avanzado. */
function choose(g: Game, source: string, label: string, target: string): { advanced: boolean; game: Game } {
  const before = atStep(g, source);
  const after = rules.applyReminderChoice(before, target, r(source, label), map).game;
  const next = advanceAfterChoice(before, after, target, source, label, map);
  return { advanced: next.nightStep === before.nightStep + 1, game: next };
}

describe("La hoja de noche pasa sola tras la elección principal", () => {
  it("el Diablillo mata: pasa al siguiente paso", () => {
    const g = game(["imp", "poisoner", "empath", "monk", "soldier"]);
    const { advanced, game: next } = choose(g, "imp", "Muerto", "p2");
    expect(advanced).toBe(true);
    expect(next.players[2].alive).toBe(false);
  });

  it("el Envenenador y el Monje también", () => {
    const g = game(["imp", "poisoner", "empath", "monk", "soldier"]);
    expect(choose(g, "poisoner", "Envenenado", "p2").advanced).toBe(true);
    expect(choose(g, "monk", "A salvo", "p4").advanced).toBe(true);
  });

  it("el Diablillo que se mata a sí mismo: se queda, hay que enseñar «TÚ ERES»", () => {
    const g = game(["imp", "poisoner", "empath", "monk", "soldier"]);
    const { advanced, game: next } = choose(g, "imp", "Muerto", "p0");
    expect(next.players[0].alive).toBe(false);
    expect(advanced).toBe(false);
  });

  it("el Fang Gu que salta a un Forastero: se queda", () => {
    const g = game(["fanggu", "poisoner", "empath", "butler", "soldier"]);
    const { advanced, game: next } = choose(g, "fanggu", "Muerto", "p3");
    expect(next.players[3].characterId).toBe("fanggu");
    expect(advanced).toBe(false);
  });

  it("quien elige para recibir información se queda: hay que darla", () => {
    const g = game(["imp", "poisoner", "ravenkeeper", "dreamer", "soldier"]);
    expect(choose(g, "dreamer", "Elegido", "p0").advanced).toBe(false);
  });

  it("la Pit-Hag se queda: después se elige el personaje", () => {
    const g = game(["imp", "pithag", "empath", "monk", "soldier"]);
    expect(choose(g, "pithag", "Elegido", "p2").advanced).toBe(false);
  });

  it("el Po y el Al-Hadikhia eligen a varios: se quedan", () => {
    expect(choose(game(["po", "poisoner", "empath", "monk", "soldier"]), "po", "Muerto", "p2").advanced).toBe(false);
    expect(choose(game(["alhadikhia", "poisoner", "empath", "monk", "soldier"]), "alhadikhia", "1", "p2").advanced).toBe(false);
  });

  it("un recordatorio que no es la acción principal no mueve la hoja", () => {
    const g = atStep(game(["imp", "poisoner", "empath", "monk", "soldier"]), "monk");
    const after = rules.placeReminder(g, "p2", r("imp", "Muerto"), 1);
    expect(advanceAfterChoice(g, after, "p2", "imp", "Muerto", map).nightStep).toBe(g.nightStep);
  });

  it("de día no se mueve nada", () => {
    const g: Game = { ...game(["imp", "poisoner", "empath", "monk", "soldier"]), phase: { kind: "day", number: 2 } };
    const after = rules.placeReminder(g, "p2", r("poisoner", "Envenenado"), 1);
    expect(advanceAfterChoice(g, after, "p2", "poisoner", "Envenenado", map).nightStep).toBe(0);
  });
});
