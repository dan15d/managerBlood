import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog } from "@infrastructure/catalog/StaticCatalog";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { infoHints } from "@domain/services/NightInfo";

// Personajes que dependen de quién nomina y quién vota.

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
    phase: { kind: "day", number: 1 },
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
function vote(g: Game, nominator: string, nominee: string, voters: string[]): Game {
  const id = `n${next++}`;
  let after = rules.nominate(g, nominator, nominee, id, map);
  for (const v of voters) after = rules.toggleVote(after, id, v);
  return rules.closeNomination(after, id);
}
const hintAtNight = (g: Game, id: string) => infoHints(rules.startNight(g), catalog.get(id)!, map)[0].text;

describe("Pregonero", () => {
  const ids = ["vortox", "witch", "towncrier", "flowergirl", "dreamer", "oracle", "clockmaker"];

  it("sabe si ha nominado un Esbirro hoy", () => {
    expect(hintAtNight(vote(game(ids), "p1", "p4", []), "towncrier")).toContain("Asiente");
    expect(hintAtNight(vote(game(ids), "p3", "p4", []), "towncrier")).toContain("Niega");
    expect(hintAtNight(game(ids), "towncrier")).toContain("Niega");
  });
});

describe("Florista", () => {
  const ids = ["vortox", "witch", "towncrier", "flowergirl", "dreamer", "oracle", "clockmaker"];

  it("sabe si el Demonio ha votado hoy", () => {
    expect(hintAtNight(vote(game(ids), "p3", "p4", ["p0", "p2"]), "flowergirl")).toContain("Asiente");
    expect(hintAtNight(vote(game(ids), "p3", "p4", ["p1", "p2"]), "flowergirl")).toContain("Niega");
  });
});

describe("Mayordomo", () => {
  const ids = ["imp", "poisoner", "butler", "chef", "empath", "monk", "soldier"];
  const withMaster = (g: Game) => rules.addReminder(g, "p3", reminder("butler", "Señor"));

  it("su voto no cuenta si su señor no vota; si vota, sí", () => {
    const alone = vote(withMaster(game(ids)), "p4", "p1", ["p2", "p5"]);
    expect(rules.voteCount(alone, alone.nominations[0])).toBe(1);
    expect(rules.voteIgnored(alone, alone.nominations[0], alone.players[2])).toContain("Mayordomo");
    const together = vote(withMaster(game(ids)), "p4", "p1", ["p2", "p3"]);
    expect(rules.voteCount(together, together.nominations[0])).toBe(2);
  });

  it("borracho o envenenado, vota libre", () => {
    const g = rules.addReminder(withMaster(game(ids)), "p2", reminder("poisoner", "Envenenado"));
    const voted = vote(g, "p4", "p1", ["p2"]);
    expect(rules.voteCount(voted, voted.nominations[0])).toBe(1);
  });
});

describe("Fanático", () => {
  it("debe votar si hay 5 o más vivos", () => {
    const g = game(["imp", "poisoner", "zealot", "chef", "empath", "monk"]);
    expect(rules.mustVote(g, g.players[2])).toBe(true);
    const fewer = rules.killPlayer(rules.killPlayer(g, "p4"), "p5");
    expect(rules.mustVote(fewer, fewer.players[2])).toBe(false);
  });
});

describe("Bruja", () => {
  const ids = ["imp", "witch", "chef", "empath", "monk", "soldier", "washerwoman"];

  it("su maldito muere al nominar", () => {
    const g = rules.nominate(rules.addReminder(game(ids), "p2", reminder("witch", "Maldito")), "p2", "p3", "n1", map);
    expect(g.players[2].alive).toBe(false);
    expect(g.nominations).toHaveLength(1);
  });

  it("con 3 vivos pierde la habilidad", () => {
    let g = rules.addReminder(game(ids), "p2", reminder("witch", "Maldito"));
    for (const id of ["p4", "p5", "p6", "p3"]) g = rules.killPlayer(g, id);
    expect(rules.nominate(g, "p2", "p0", "n1", map).players[2].alive).toBe(true);
  });
});

describe("Gólem", () => {
  const ids = ["imp", "poisoner", "golem", "chef", "empath", "monk", "soldier"];

  it("si el nominado no es el Demonio, muere; y solo nomina una vez", () => {
    let g = rules.nominate(game(ids), "p2", "p3", "n1", map);
    expect(g.players[3].alive).toBe(false);
    g = { ...g, nominations: [], phase: { kind: "day", number: 2 } };
    expect(rules.canNominate(g, "p2", "p4")).toContain("Gólem");
  });

  it("si nomina al Demonio, no pasa nada", () => {
    expect(rules.nominate(game(ids), "p2", "p0", "n1", map).players[0].alive).toBe(true);
  });
});

describe("Fearmonger", () => {
  const ids = ["imp", "fearmonger", "chef", "empath", "monk", "soldier", "washerwoman"];

  it("si nomina a su elegido y se le ejecuta, su equipo pierde", () => {
    let g = rules.addReminder(game(ids), "p2", reminder("fearmonger", "Terror"));
    g = rules.execute(vote(g, "p1", "p2", ["p0", "p1", "p3", "p4"]), "p2");
    expect(rules.victoryHint(g, map)).toMatchObject({ winner: "evil" });
  });

  it("si nomina otro, no", () => {
    let g = rules.addReminder(game(ids), "p2", reminder("fearmonger", "Terror"));
    g = rules.execute(vote(g, "p3", "p2", ["p0", "p1", "p3", "p4"]), "p2");
    expect(rules.victoryHint(g, map)).toBeNull();
  });
});
