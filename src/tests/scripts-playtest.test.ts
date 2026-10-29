import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog } from "@infrastructure/catalog/StaticCatalog";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { infoHints } from "@domain/services/NightInfo";
import { buildNightOrder } from "@domain/services/NightOrder";

// Casos que salieron al jugar Bad Moon Rising y Sects & Violets en la web publicada.

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
let ids = 0;
const r = (source: string, label: string) => ({ id: `${source}-${label}-${ids++}`, sourceCharacterId: source, label });
const choose = (g: Game, target: string, source: string, label: string) => rules.applyReminderChoice(g, target, r(source, label), map);
const alive = (g: Game, id: string) => g.players.find((p) => p.id === id)!.alive;

describe("Bad Moon Rising", () => {
  // Asientos: Lunático, Pukka, Abuela, Asesino, Marinero, Posadero, Exorcista, Dama del té.
  const bmr = () => game(["lunatic", "pukka", "grandmother", "assassin", "sailor", "innkeeper", "exorcist", "tealady"]);

  it("Pukka: envenena primero, así que la Dama del té que elige ya no protege a su vecino", () => {
    let g = rules.addReminder(bmr(), "p6", r("pukka", "Envenenado"));
    // Si envenena a otro, la Dama del té sana protege a su vecino (J7).
    const saved = choose(g, "p5", "pukka", "Envenenado");
    expect(alive(saved.game, "p6")).toBe(true);
    expect(saved.message).toContain("protegido");
    // Si envenena a la Dama del té, el vecino muere.
    g = choose(g, "p7", "pukka", "Envenenado").game;
    expect(alive(g, "p6")).toBe(false);
    expect(g.players[7].reminders.some((x) => x.sourceCharacterId === "pukka")).toBe(true);
    expect(g.players[6].reminders.some((x) => x.sourceCharacterId === "pukka")).toBe(false);
  });

  it("Pukka que elige otra vez al mismo: muere y sigue envenenado", () => {
    let g = rules.addReminder(bmr(), "p2", r("pukka", "Envenenado"));
    g = choose(g, "p2", "pukka", "Envenenado").game;
    expect(alive(g, "p2")).toBe(false);
    expect(g.players[2].reminders.filter((x) => x.sourceCharacterId === "pukka")).toHaveLength(1);
  });

  it("Asesino: mata aunque esté protegido, una vez por partida", () => {
    let g = choose(bmr(), "p2", "innkeeper", "A salvo").game;
    const first = choose(g, "p2", "assassin", "Muerto");
    expect(alive(first.game, "p2")).toBe(false);
    expect(first.message).toContain("aunque estuviera protegido");
    // El Marinero tampoco se salva, y la segunda vez ya no tiene habilidad.
    g = choose(first.game, "p4", "assassin", "Muerto").game;
    expect(alive(g, "p4")).toBe(true);
  });

  it("Asesino borracho o envenenado: no mata, pero gasta la habilidad", () => {
    const g = rules.addReminder(bmr(), "p3", r("sailor", "Borracho"));
    const result = choose(g, "p2", "assassin", "Muerto");
    expect(alive(result.game, "p2")).toBe(true);
    expect(result.message).toContain("no tiene habilidad");
  });

  it("Padrino: le paran el Posadero y la Dama del té, no el Monje", () => {
    const g = game(["godfather", "imp", "monk", "innkeeper", "fool", "chef", "tealady", "soldier"]);
    expect(alive(choose(choose(g, "p3", "monk", "A salvo").game, "p3", "godfather", "Muerto").game, "p3")).toBe(false);
    expect(alive(choose(choose(g, "p2", "innkeeper", "A salvo").game, "p2", "godfather", "Muerto").game, "p2")).toBe(true);
    // J6 (Chef) y J8 (Soldado) son los vecinos buenos de la Dama del té.
    expect(alive(choose(g, "p5", "godfather", "Muerto").game, "p5")).toBe(true);
    expect(alive(choose(g, "p7", "godfather", "Muerto").game, "p7")).toBe(true);
    const fool = choose(g, "p4", "godfather", "Muerto");
    expect(alive(fool.game, "p4")).toBe(true);
    expect(fool.message).toContain("Bufón");
  });

  it("el Lunático solo se despierta en su paso, no también en el del Demonio que cree ser", () => {
    const g = bmr();
    g.players[0].shownCharacterId = "zombuul";
    const keys = buildNightOrder(g, map).map((s) => s.key);
    expect(keys).toContain("char:lunatic");
    expect(keys).not.toContain("char:zombuul");
    // El Borracho, en cambio, sí despierta como el que cree ser.
    const drunk = game(["drunk", "imp", "poisoner", "chef", "empath"]);
    drunk.players[0].shownCharacterId = "monk";
    expect(buildNightOrder(drunk, map).map((s) => s.key)).toContain("char:monk");
  });
});

describe("Sects & Violets", () => {
  it("Gemela malvada: la primera noche dice quién es su gemelo", () => {
    let g = game(["eviltwin", "fanggu", "klutz", "clockmaker", "oracle"], { phase: { kind: "night", number: 1 } });
    const hint = () => infoHints(g, catalog.get("eviltwin")!, map)[0]?.text;
    expect(hint()).toContain("Falta");
    g = rules.addReminder(g, "p4", r("eviltwin", "Gemelo"));
    expect(hint()).toContain("El gemelo bueno es J5 (Oráculo)");
  });
});

describe("Textos del catálogo", () => {
  it("no tienen HTML", () => {
    for (const c of catalog.all()) {
      for (const text of [c.ability, c.firstNightReminder, c.otherNightReminder]) expect(text ?? "", c.id).not.toMatch(/<\/?[a-z][^>]*>/i);
    }
  });
});
