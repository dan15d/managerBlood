import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog } from "@infrastructure/catalog/StaticCatalog";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { buildNightOrder } from "@domain/services/NightOrder";

// Personajes de Trouble Brewing (y otros) que cambian quién gana, cómo se vota o quién se despierta.

const catalog = new StaticCharacterCatalog();
const map = catalog.map();

function game(ids: string[], extra: Partial<Game> = {}): Game {
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
    phase: { kind: "day", number: 2 },
    nightStep: 0,
    nominations: [],
    status: "in_progress",
    log: [],
    joinCode: "ABCDE",
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

const reminder = (playerId: string, source: string, label: string) => ({ id: `${playerId}-${label}`, sourceCharacterId: source, label });
const tb = ["imp", "poisoner", "saint", "mayor", "virgin", "chef", "empath", "ravenkeeper"];

describe("Santo", () => {
  it("si lo ejecutan, gana el Mal; envenenado, no", () => {
    expect(rules.victoryHint(rules.execute(game(tb), "p2"), map)).toEqual({ winner: "evil", reason: "Han ejecutado al Santo." });
    const poisoned = rules.addReminder(game(tb), "p2", reminder("p2", "poisoner", "Envenenado"));
    expect(rules.victoryHint(rules.execute(poisoned, "p2"), map)).toBeNull();
  });

  it("si muere de otra forma, no pasa nada", () => {
    expect(rules.victoryHint(rules.killPlayer(game(tb), "p2"), map)).toBeNull();
  });
});

describe("Alcalde", () => {
  const threeAlive = (g: Game) => ["p2", "p4", "p5", "p6", "p7"].reduce((acc, id) => rules.killPlayer(acc, id), g);

  it("con 3 vivos y sin ejecución, su equipo gana al anochecer", () => {
    expect(rules.duskVictory(threeAlive(game(tb)), map)?.winner).toBe("good");
  });

  it("no gana si hubo ejecución, si quedan más de 3 o si está envenenado", () => {
    const g = threeAlive(game(tb));
    expect(rules.duskVictory({ ...g, executedToday: "p6" }, map)).toBeNull();
    expect(rules.duskVictory(game(tb), map)).toBeNull();
    expect(rules.duskVictory(rules.addReminder(g, "p3", reminder("p3", "poisoner", "Envenenado")), map)).toBeNull();
  });
});

describe("Virgen", () => {
  it("si la nomina un Aldeano por primera vez, ese Aldeano es ejecutado en el acto", () => {
    const g = rules.nominate(game(tb), "p5", "p4", "n1");
    const result = rules.virginNomination(g, "p5", "p4", map);
    expect(result.executes).toBe(true);
    const after = rules.executeNow(result.game, "p5");
    expect(after.players[5].alive).toBe(false);
    expect(after.executedToday).toBe("p5");
    expect(after.nominations.every((n) => n.closed)).toBe(true);
  });

  it("solo la primera vez, y no si nomina alguien que no es Aldeano", () => {
    const first = rules.virginNomination(rules.nominate(game(tb), "p1", "p4", "n1"), "p1", "p4", map);
    expect(first.executes).toBe(false);
    // Ya ha perdido su habilidad: aunque luego la nomine un Aldeano, no pasa nada.
    const again = rules.virginNomination(first.game, "p5", "p4", map);
    expect(again.executes).toBe(false);
  });

  it("si nomina el Espía, decide el Narrador", () => {
    const g = game(["imp", "spy", "virgin", "chef", "empath"]);
    const result = rules.virginNomination(rules.nominate(g, "p1", "p2", "n1"), "p1", "p2", map);
    expect(result).toMatchObject({ executes: false, spy: true });
  });
});

describe("Ejecutar sin votación", () => {
  it("ejecuta aunque nadie haya votado y cierra la votación abierta", () => {
    const g = rules.executeNow(rules.nominate(game(tb), "p5", "p6", "n1"), "p6", "El Juez fuerza la ejecución.");
    expect(g.players[6].alive).toBe(false);
    expect(g.nominations[0].closed).toBe(true);
    expect(g.log.some((l) => l.text.includes("Juez"))).toBe(true);
    expect(() => rules.executeNow(g, "p7")).toThrow("Solo hay una ejecución");
  });
});

describe("Personajes que actúan al morir", () => {
  it("el Guardián de cuervos se despierta solo si muere esta noche", () => {
    let g = game(tb, { phase: { kind: "night", number: 2 } });
    const step = () => buildNightOrder(g, map).find((s) => s.key === "char:ravenkeeper")!;
    expect(step()).toMatchObject({ dead: true, deathNote: { wake: false } });
    g = rules.killPlayer(g, "p7", "muere por el Diablillo");
    expect(step()).toMatchObject({ dead: false, deathNote: { wake: true } });
    // La noche siguiente ya no se despierta.
    g = rules.startNight(rules.startDay(g));
    expect(step().deathNote?.wake).toBe(false);
  });
});

describe("Burócrata y Ladrón", () => {
  it("el voto del elegido por el Burócrata vale 3 y el del Ladrón resta 1", () => {
    let g = game([...tb, "bureaucrat", "thief"]);
    g = rules.addReminder(g, "p5", reminder("p5", "bureaucrat", "3 votos"));
    g = rules.addReminder(g, "p6", reminder("p6", "thief", "Voto negativo"));
    g = rules.nominate(g, "p3", "p1", "n1");
    for (const v of ["p5", "p6", "p7"]) g = rules.toggleVote(g, "n1", v);
    expect(rules.voteCount(g, g.nominations[0])).toBe(3 - 1 + 1);
    g = rules.closeNomination(g, "n1");
    // 10 vivos: hacen falta 5 votos, y 3 no llegan.
    expect(rules.onTheBlock(g)).toBeNull();
  });

  it("sus recordatorios caducan al anochecer", () => {
    const g = rules.addReminder(game(tb), "p5", reminder("p5", "bureaucrat", "3 votos"));
    expect(rules.expiringReminders(g).map((e) => e.reminder.label)).toEqual(["3 votos"]);
  });
});
