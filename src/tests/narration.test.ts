import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog } from "@infrastructure/catalog/StaticCatalog";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { infoHints } from "@domain/services/NightInfo";
import { buildNightOrder, keepNightStep } from "@domain/services/NightOrder";
import { publicPlayers, seatSecret } from "@domain/services/TableView";

// Fallos de la narración: protecciones que no deberían valer, la hoja de noche que salta de paso,
// lo que ve el móvil de noche y avisos que no cuadraban.

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
    phase: { kind: "night", number: 2 },
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

let next = 0;
const reminder = (source: string, label: string) => ({ id: `r${next++}`, sourceCharacterId: source, label });
const attack = (g: Game, target: string, demon = "imp") => rules.applyReminderChoice(g, target, reminder(demon, "Muerto"), map);

describe("Protecciones", () => {
  it("el «A salvo» de un Monje que es el Borracho no protege", () => {
    let g = game(["imp", "poisoner", "drunk", "chef", "empath", "soldier", "washerwoman"]);
    g.players[2].shownCharacterId = "monk";
    g = rules.addReminder(g, "p3", reminder("monk", "A salvo"));
    expect(attack(g, "p3").game.players[3].alive).toBe(false);
  });

  it("el de un Monje envenenado tampoco; el de un Monje sano, sí", () => {
    let g = game(["imp", "poisoner", "monk", "chef", "empath", "soldier", "washerwoman"]);
    g = rules.addReminder(g, "p3", reminder("monk", "A salvo"));
    expect(attack(g, "p3").game.players[3].alive).toBe(true);
    g = rules.addReminder(g, "p2", reminder("poisoner", "Envenenado"));
    expect(attack(g, "p3").game.players[3].alive).toBe(false);
  });

  it("la Dama del té protege a sus vecinos buenos del Demonio y de la ejecución", () => {
    const g = game(["imp", "poisoner", "chef", "tealady", "empath", "soldier", "washerwoman"]);
    expect(attack(g, "p2").game.players[2].alive).toBe(true);
    const executed = rules.execute({ ...g, phase: { kind: "day", number: 2 } }, "p4");
    expect(executed.players[4].alive).toBe(true);
    // Si un vecino es malo, no protege a nadie.
    const evilNeighbour = game(["imp", "poisoner", "chef", "tealady", "spy", "soldier", "washerwoman"]);
    expect(attack(evilNeighbour, "p2").game.players[2].alive).toBe(false);
  });
});

describe("El Demonio que no mata esta noche", () => {
  it("si el Exorcista le ha elegido, el ataque no mata y avisa", () => {
    const g = rules.addReminder(game(["imp", "poisoner", "exorcist", "chef", "empath"]), "p0", reminder("exorcist", "Elegido"));
    const result = attack(g, "p3");
    expect(result.game.players[3].alive).toBe(true);
    expect(result.message).toContain("Exorcista");
    expect(rules.demonBlocked(g, "imp")).toContain("Exorcista");
  });

  it("si la Princesa ejecuta en su primer día, esa noche el Demonio no mata; la siguiente, sí", () => {
    let g = game(["imp", "poisoner", "princess", "chef", "empath", "monk", "soldier"], { phase: { kind: "day", number: 1 } });
    g = rules.nominate(g, "p2", "p3", "n1");
    for (const v of ["p0", "p1", "p2", "p4"]) g = rules.toggleVote(g, "n1", v);
    g = rules.execute(rules.closeNomination(g, "n1"), "p3");
    // El aviso sobrevive al anochecer: es justo para esa noche.
    expect(rules.expiringReminders(g).some((e) => e.reminder.label === "No mata")).toBe(false);
    g = rules.startNight(g);
    expect(attack(g, "p4").game.players[4].alive).toBe(true);
    g = rules.startNight(rules.startDay(g));
    expect(attack(g, "p4").game.players[4].alive).toBe(false);
  });

  it("atacar a un muerto no dice que muere esta noche", () => {
    const g = rules.killPlayer(game(["imp", "poisoner", "chef", "empath", "monk"]), "p2");
    expect(attack(g, "p2").message).toContain("ya estaba muerto");
  });
});

describe("Hoja de noche", () => {
  it("si cambia en mitad de la noche, el Narrador sigue en el mismo paso", () => {
    let g = game(["imp", "poisoner", "chef", "empath", "monk", "soldier", "washerwoman"]);
    const impIndex = buildNightOrder(g, map).findIndex((s) => s.key === "char:imp");
    g = { ...g, nightStep: impIndex };
    const before = attack(g, "p0").game;
    const after = keepNightStep(before, rules.succeedDemon(before, rules.demonSuccession(before, map)!, "p1", map), map);
    expect(buildNightOrder(after, map)[after.nightStep].key).toBe("char:imp");
  });

  it("moverse por la hoja sigue funcionando", () => {
    const g = game(["imp", "poisoner", "chef", "empath", "monk"]);
    expect(keepNightStep(g, rules.setNightStep(g, 2), map).nightStep).toBe(2);
  });
});

describe("Lo que ve el jugador", () => {
  it("con Tor, quien muere de noche no ve su personaje hasta el amanecer", () => {
    let g = rules.killPlayer(game(["imp", "poisoner", "chef", "empath", "monk"], { fabledIds: ["tor"] }), "p2");
    const seen = () => seatSecret(g.players[2], map, g.fabledIds, publicPlayers(g, map)[2].alive);
    expect(seen()).toEqual({});
    g = rules.startDay(g);
    expect(seen().characterId).toBe("chef");
  });
});

describe("Información de la noche", () => {
  it("el Enterrador no aprende nada si el ejecutado sobrevive", () => {
    const g = rules.startNight(rules.execute(game(["imp", "poisoner", "sailor", "undertaker", "monk"], { phase: { kind: "day", number: 1 } }), "p2"));
    expect(infoHints(g, catalog.get("undertaker")!, map)[0].text).toContain("no murió");
  });

  it("para la Pitonisa, quien cuida a Lil' Monsta es el Demonio", () => {
    let g = game(["poisoner", "spy", "fortuneteller", "chef", "empath"], { extraCharacterIds: ["lilmonsta"] });
    g = rules.addReminder(g, "p1", reminder("lilmonsta", "Es el Demonio"));
    expect(infoHints(g, catalog.get("fortuneteller")!, map)[0].text).toContain("2. J2");
  });
});
