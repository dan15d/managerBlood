import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog } from "@infrastructure/catalog/StaticCatalog";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { infoHints } from "@domain/services/NightInfo";
import { buildNightOrder } from "@domain/services/NightOrder";
import { seededRandom } from "@domain/services/Random";
import { applySetupEffects } from "@domain/services/SetupGenerator";

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

describe("Trouble Brewing", () => {
  // Asientos: Exterminador, Diablillo, Mujer escarlata, Recluso, Chef, Empático.
  const tb = () => game(["slayer", "imp", "scarletwoman", "recluse", "chef", "empath"], { phase: { kind: "day", number: 1 } });

  it("Exterminador: si dispara al Demonio, muere (y no es una ejecución)", () => {
    const g = game(["slayer", "imp", "poisoner", "chef", "empath"], { phase: { kind: "day", number: 1 } });
    const shot = rules.slayerShot(g, "p0", "p1", map);
    expect(alive(shot.game, "p1")).toBe(false);
    expect(shot.message).toContain("es el Demonio y muere");
    expect(shot.game.executedToday).toBeUndefined();
    expect(rules.victoryHint(shot.game, map)?.winner).toBe("good");
  });

  it("Exterminador: con la Mujer escarlata y 5 vivos, ella pasa a ser el Demonio", () => {
    const shot = rules.slayerShot(tb(), "p0", "p1", map);
    expect(rules.demonSuccession(shot.game, map)?.heirs.map((p) => p.id)).toEqual(["p2"]);
  });

  it("la Mujer escarlata que pasa a ser el Demonio de día: esa noche se avisa de despertarla", () => {
    const shot = rules.slayerShot(tb(), "p0", "p1", map);
    const s = rules.demonSuccession(shot.game, map)!;
    let g = rules.startNight(rules.succeedDemon(shot.game, s, "p2", map));
    const hint = infoHints(g, catalog.get("imp")!, map).find((h) => h.playerId === "p2")?.text;
    expect(hint).toContain("J3 se ha convertido hoy en Diablillo: despiértale y enséñale TÚ ERES");
    // Al amanecer ya se le ha dicho.
    g = rules.startDay(g);
    expect(g.players[2].reminders.some((x) => x.label === "Nuevo Demonio")).toBe(false);
  });

  it("los avisos de Espía y Recluso concuerdan", () => {
    const g = game(["washerwoman", "imp", "spy", "recluse", "chef"], { phase: { kind: "night", number: 1 } });
    expect(infoHints(g, catalog.get("washerwoman")!, map)[0].caveats[0]).toBe("Espía y Recluso pueden aparecer distintos: decides tú.");
  });

  it("Exterminador: falla con quien no es Demonio, avisa del Recluso y solo dispara una vez", () => {
    let g = rules.slayerShot(tb(), "p0", "p3", map);
    expect(g.message).toContain("Recluso puede registrarse como Demonio");
    expect(alive(g.game, "p3")).toBe(true);
    g = rules.slayerShot(g.game, "p0", "p1", map);
    expect(g.message).toContain("ya había disparado");
    expect(alive(g.game, "p1")).toBe(true);
  });

  it("Exterminador: quien no lo es, o lo es envenenado, no mata", () => {
    expect(alive(rules.slayerShot(tb(), "p4", "p1", map).game, "p1")).toBe(true);
    const poisoned = rules.addReminder(tb(), "p0", r("poisoner", "Envenenado"));
    const shot = rules.slayerShot(poisoned, "p0", "p1", map);
    expect(alive(shot.game, "p1")).toBe(true);
    expect(rules.slayerShot(shot.game, "p0", "p1", map).message).toContain("ya había disparado");
  });

  it("Pitonisa: el falso positivo se pone solo en un jugador bueno", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const players = game(["fortuneteller", "imp", "poisoner", "chef", "empath"]).players;
      const { players: placed, log } = applySetupEffects(players, map, seededRandom(seed), () => `id${seed}`);
      const herring = placed.filter((p) => p.reminders.some((x) => x.sourceCharacterId === "fortuneteller" && x.label === "Falso positivo"));
      expect(herring).toHaveLength(1);
      expect(herring[0].alignment).toBe("good");
      expect(log.join(" ")).toContain("falso positivo de la Pitonisa");
    }
  });
});

describe("Textos del catálogo", () => {
  it("no tienen HTML", () => {
    for (const c of catalog.all()) {
      for (const text of [c.ability, c.firstNightReminder, c.otherNightReminder]) expect(text ?? "", c.id).not.toMatch(/<\/?[a-z][^>]*>/i);
    }
  });
});
