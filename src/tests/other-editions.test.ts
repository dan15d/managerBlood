import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog } from "@infrastructure/catalog/StaticCatalog";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { buildNightOrder } from "@domain/services/NightOrder";
import { seededRandom } from "@domain/services/Random";
import { applySetupEffects } from "@domain/services/SetupGenerator";

// Personajes de otras ediciones que cambian quién gana, quién muere, cómo se vota o qué se sabe.

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

let next = 0;
const reminder = (source: string, label: string) => ({ id: `r${next++}`, sourceCharacterId: source, label });
const night = (g: Game, number: number): Game => ({ ...g, phase: { kind: "night", number } });
const day = (g: Game, number: number): Game => ({ ...g, phase: { kind: "day", number }, executedToday: undefined, nominations: [] });
const kill = (g: Game, target: string, demon = "imp") => rules.applyReminderChoice(night(g, 2), target, reminder(demon, "Muerto"), map).game;
/** Nomina, vota con los dados, cierra y devuelve la partida. */
function vote(g: Game, nominator: string, nominee: string, voters: string[]): Game {
  const id = `n${next++}`;
  let after = rules.nominate(g, nominator, nominee, id);
  for (const v of voters) after = rules.toggleVote(after, id, v);
  return rules.closeNomination(after, id);
}

describe("Gemela malvada", () => {
  const ids = ["imp", "eviltwin", "chef", "empath", "monk", "soldier", "washerwoman"];
  const withTwin = (g: Game) => rules.addReminder(g, "p2", reminder("eviltwin", "Gemelo"));

  it("al empezar se marca a un gemelo bueno", () => {
    let n = 0;
    const { players } = applySetupEffects(game(ids).players, map, seededRandom(2), () => `t${n++}`);
    const twins = players.filter((p) => p.reminders.some((r) => r.label === "Gemelo"));
    expect(twins).toHaveLength(1);
    expect(twins[0].alignment).toBe("good");
  });

  it("si ejecutan al gemelo bueno, gana el Mal", () => {
    expect(rules.victoryHint(rules.execute(withTwin(game(ids)), "p2"), map)?.winner).toBe("evil");
  });

  it("muerto el Demonio, los buenos no ganan mientras vivan las dos gemelas", () => {
    const g = rules.execute(withTwin(game(ids)), "p0");
    expect(rules.victoryHint(g, map)).toBeNull();
    expect(rules.victoryNote(g, map)).toContain("Gemela malvada");
    expect(rules.victoryHint(rules.killPlayer(g, "p1"), map)?.winner).toBe("good");
  });
});

describe("Mente maestra", () => {
  const ids = ["imp", "mastermind", "chef", "empath", "monk", "soldier", "washerwoman"];

  it("ejecutado el Demonio se juega un día más; si se ejecuta a un bueno, gana el Mal", () => {
    let g = rules.execute(game(ids), "p0", map);
    expect(g.mastermindDay).toBe(3);
    expect(rules.victoryHint(g, map)).toBeNull();
    expect(rules.victoryNote(g, map)).toContain("Mente maestra");
    g = rules.execute(day(g, 3), "p2", map);
    expect(rules.victoryHint(g, map)?.winner).toBe("evil");
  });

  it("si ese día se ejecuta a un malo o no hay ejecución, gana el Bien", () => {
    const g = day(rules.execute(game(ids), "p0", map), 3);
    expect(rules.victoryHint(rules.execute(g, "p1", map), map)?.winner).toBe("good");
    expect(rules.duskVictory(g, map)?.winner).toBe("good");
  });
});

describe("Hereje", () => {
  it("invierte el ganador", () => {
    const g = rules.execute(game(["imp", "poisoner", "heretic", "chef", "empath", "monk", "soldier"]), "p0");
    expect(rules.victoryHint(g, map)?.winner).toBe("evil");
    expect(rules.victoryHint(g, map)?.reason).toContain("Hereje");
  });
});

describe("Marinero, Bufón y Abogado del diablo", () => {
  const ids = ["imp", "devilsadvocate", "sailor", "fool", "chef", "empath", "monk"];

  it("el Marinero sano no muere por el Demonio ni ejecutado; borracho, sí", () => {
    expect(kill(game(ids), "p2").players[2].alive).toBe(true);
    const executed = rules.execute(game(ids), "p2");
    expect(executed.players[2].alive).toBe(true);
    expect(executed.executedToday).toBe("p2");
    const drunk = rules.addReminder(game(ids), "p2", reminder("sailor", "Borracho"));
    expect(kill(drunk, "p2").players[2].alive).toBe(false);
  });

  it("el Bufón se salva la primera vez y pierde su habilidad", () => {
    let g = kill(game(ids), "p3");
    expect(g.players[3].alive).toBe(true);
    expect(g.players[3].reminders.map((r) => r.label)).toContain("Sin habilidad");
    g = rules.execute(day(g, 3), "p3");
    expect(g.players[3].alive).toBe(false);
  });

  it("el elegido por el Abogado del diablo sobrevive a la ejecución", () => {
    const g = rules.addReminder(game(ids), "p4", reminder("devilsadvocate", "Sobrevive ejecución"));
    expect(rules.execute(g, "p4").players[4].alive).toBe(true);
  });
});

describe("Abuela", () => {
  it("si el Demonio mata a su nieto, ella también muere", () => {
    let g = game(["imp", "poisoner", "grandmother", "chef", "empath", "monk", "soldier"]);
    g = rules.addReminder(g, "p3", reminder("grandmother", "Nieto"));
    g = kill(g, "p3");
    expect(g.players[2].alive).toBe(false);
  });
});

describe("Cultivador de opio", () => {
  const ids = ["imp", "poisoner", "poppygrower", "chef", "empath", "monk", "soldier"];
  const kinds = (g: Game) => buildNightOrder(g, map).map((s) => s.kind);

  it("mientras vive no hay información del Mal; la noche en que muere, sí", () => {
    expect(kinds(night(game(ids), 1))).not.toContain("minion_info");
    let g = rules.killPlayer(day(game(ids), 2), "p2");
    g = rules.startNight(g);
    const steps = buildNightOrder(g, map);
    const poppy = steps.findIndex((s) => s.key === "char:poppygrower");
    expect(steps.findIndex((s) => s.kind === "minion_info")).toBe(poppy + 1);
    // La noche siguiente ya no.
    expect(kinds(rules.startNight(rules.startDay(g)))).not.toContain("minion_info");
  });

  it("borracho o envenenado no impide la información de la primera noche", () => {
    const g = rules.addReminder(night(game(ids), 1), "p2", reminder("poisoner", "Envenenado"));
    expect(kinds(g)).toContain("minion_info");
  });
});

describe("Carnicero", () => {
  it("tras la ejecución puede nominar otra vez y puede haber una segunda ejecución", () => {
    const ids = ["imp", "poisoner", "butcher", "chef", "empath", "monk", "soldier"];
    let g = rules.execute(vote(game(ids), "p3", "p4", ["p0", "p1", "p2", "p3"]), "p4");
    expect(rules.canNominate(g, "p5", "p6")).toBe("Ya ha habido una ejecución hoy.");
    expect(rules.butcherCanNominate(g)).toBe(true);
    g = vote(g, "p2", "p1", ["p0", "p2", "p3"]);
    expect(rules.onTheBlock(g)?.playerId).toBe("p1");
    g = rules.execute(g, "p1");
    expect(g.players[1].alive).toBe(false);
    expect(rules.canNominate(g, "p2", "p6")).not.toBeNull();
  });
});

describe("Banshee", () => {
  const ids = ["imp", "poisoner", "banshee", "chef", "empath", "monk", "soldier"];

  it("muerta por el Demonio, nomina y vota dos veces aunque esté muerta", () => {
    let g = day(kill(game(ids), "p2"), 3);
    expect(g.players[2].reminders.map((r) => r.label)).toContain("Tiene habilidad");
    expect(rules.canNominate(g, "p2", "p0")).toBeNull();
    g = vote(g, "p2", "p0", ["p2"]);
    expect(rules.voteCount(g, g.nominations[0])).toBe(2);
    expect(g.players[2].ghostVoteUsed).toBe(false);
    expect(rules.canNominate(g, "p2", "p1")).toBeNull();
    g = vote(g, "p2", "p1", []);
    expect(rules.canNominate(g, "p2", "p3")).toContain("ya ha nominado");
  });
});

describe("Voudon", () => {
  it("solo votan él y los muertos, sin gastar su voto, y basta un voto", () => {
    let g = game(["imp", "poisoner", "voudon", "chef", "empath", "monk", "soldier"]);
    g = rules.killPlayer(g, "p6");
    expect(rules.voteThreshold(g)).toBe(1);
    expect(() => vote(g, "p3", "p1", ["p4"])).toThrow("Voudon");
    g = vote(g, "p3", "p1", ["p6"]);
    expect(g.players[6].ghostVoteUsed).toBe(false);
    expect(rules.onTheBlock(g)?.playerId).toBe("p1");
    // Un empate no salva al primero: sigue marcado hasta que alguien tenga más votos.
    g = vote(g, "p4", "p0", ["p2"]);
    expect(rules.onTheBlock(g)?.playerId).toBe("p1");
  });
});

describe("Exilio de Viajeros", () => {
  const ids = ["imp", "poisoner", "chef", "empath", "monk", "soldier", "thief"];

  it("votan todos, hace falta la mitad de todos los jugadores y no es una ejecución", () => {
    let g = rules.killPlayer(game(ids), "p5");
    g = rules.callExile(g, "p6", "e1", map);
    for (const v of ["p0", "p1", "p2", "p5"]) g = rules.toggleVote(g, "e1", v);
    g = rules.closeNomination(g, "e1");
    expect(g.players[6].alive).toBe(false);
    expect(g.players[5].ghostVoteUsed).toBe(false);
    expect(g.executedToday).toBeUndefined();
    expect(rules.canNominate(g, "p2", "p3")).toBeNull();
  });

  it("con pocos votos no se exilia, y solo se puede pedir una vez al día", () => {
    let g = rules.callExile(game(ids), "p6", "e1", map);
    g = rules.closeNomination(rules.toggleVote(g, "e1", "p0"), "e1");
    expect(g.players[6].alive).toBe(true);
    expect(rules.canExile(g, "p6", map)).toContain("ya se ha pedido");
    expect(rules.canExile(g, "p2", map)).toContain("Viajeros");
  });
});

describe("Picota tras la ejecución", () => {
  it("después de ejecutar ya no hay nadie en la picota (salvo la nominación del Carnicero)", () => {
    const ids = ["imp", "poisoner", "chef", "empath", "monk", "soldier", "washerwoman"];
    const g = rules.execute(vote(game(ids), "p2", "p3", ["p0", "p1", "p2", "p4"]), "p3");
    expect(rules.onTheBlock(g)).toBeNull();
  });
});
