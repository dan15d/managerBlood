import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog } from "@infrastructure/catalog/StaticCatalog";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { choiceReminder, infoHints } from "@domain/services/NightInfo";
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

describe("Habilidades de Bad Moon Rising y Sects & Violets", () => {
  it("un Demonio borracho o envenenado no mata (también el Diablillo del Marinero)", () => {
    const g = rules.addReminder(game(["imp", "sailor", "poisoner", "chef", "empath"]), "p0", r("sailor", "Borracho"));
    const result = choose(g, "p3", "imp", "Muerto");
    expect(alive(result.game, "p3")).toBe(true);
    expect(result.message).toContain("borracho o envenenado");
  });

  it("Matón: el primero que le elige queda borracho y el Matón pasa a su bando; el segundo, no", () => {
    const g = game(["imp", "goon", "poisoner", "chef", "empath"]);
    const first = choose(g, "p1", "imp", "Muerto");
    expect(alive(first.game, "p1")).toBe(true);
    expect(first.game.players[1].alignment).toBe("evil");
    expect(first.game.players[0].reminders.some((x) => x.sourceCharacterId === "goon" && x.label === "Borracho")).toBe(true);
    expect(first.message).toContain("es el Matón");
    // Ya ha elegido alguien esta noche: el Envenenador le envenena sin más.
    const second = choose(first.game, "p1", "poisoner", "Envenenado");
    expect(second.game.players[2].reminders.some((x) => x.sourceCharacterId === "goon")).toBe(false);
  });

  it("Profesor: resucita a un Aldeano muerto, una vez", () => {
    let g = rules.killPlayer(rules.killPlayer(game(["professor", "imp", "poisoner", "chef", "empath"]), "p3"), "p2");
    expect(choose(g, "p2", "professor", "Vivo").message).toContain("no es Aldeano");
    const revived = choose(g, "p3", "professor", "Vivo");
    expect(alive(revived.game, "p3")).toBe(true);
    g = rules.killPlayer(revived.game, "p4");
    expect(alive(choose(g, "p4", "professor", "Vivo").game, "p4")).toBe(false);
  });

  it("Niña de la Luna: su elegido muere si es bueno, y su paso no se salta por estar muerta", () => {
    let g = rules.killPlayer(game(["moonchild", "imp", "poisoner", "chef", "empath"]), "p0");
    expect(buildNightOrder(g, map).find((s) => s.key === "char:moonchild")?.dead).toBe(false);
    expect(alive(choose(g, "p2", "moonchild", "Muerto").game, "p2")).toBe(true);
    g = choose(g, "p3", "moonchild", "Muerto").game;
    expect(alive(g, "p3")).toBe(false);
    expect(buildNightOrder(g, map).find((s) => s.key === "char:moonchild")?.dead).toBe(true);
  });

  it("Juglar: si se ejecuta a un Esbirro, todos los demás están borrachos hasta el crepúsculo de mañana", () => {
    let g = game(["minstrel", "imp", "poisoner", "chef", "empath"], { phase: { kind: "day", number: 1 } });
    g = rules.execute(g, "p2", map);
    const drunk = (x: Game) => x.players.filter((p) => p.reminders.some((r) => r.sourceCharacterId === "minstrel")).map((p) => p.id);
    expect(drunk(g)).toEqual(["p1", "p2", "p3", "p4"]);
    // Ese crepúsculo aún no caduca.
    expect(rules.expiringReminders(g).some((e) => e.reminder.sourceCharacterId === "minstrel")).toBe(false);
    g = rules.startNight(g);
    expect(infoHints(g, catalog.get("empath")!, map)[0].caveats.join(" ")).toContain("Juglar");
    // El Demonio borracho no mata.
    expect(alive(choose(g, "p3", "imp", "Muerto").game, "p3")).toBe(true);
    // Al día siguiente caduca en el crepúsculo.
    g = rules.startDay(g);
    expect(rules.expiringReminders(g).filter((e) => e.reminder.sourceCharacterId === "minstrel")).toHaveLength(4);
  });

  it("Cortesano: una sola vez; el Padrino no mata la primera noche", () => {
    let g = choose(game(["courtier", "imp", "godfather", "chef", "empath"]), "p1", "courtier", "Borracho 1").game;
    expect(alive(choose(g, "p3", "imp", "Muerto").game, "p3")).toBe(true);
    expect(choose(g, "p4", "courtier", "Borracho 1").message).toContain("ya usó");
    expect(choiceReminder("godfather", true)).toBeUndefined();
    expect(choiceReminder("godfather", false)).toBe("Muerto");
  });

  it("Filósofo: gana la habilidad elegida, despierta como ese personaje y emborracha a quien lo tiene", () => {
    const g = game(["philosopher", "imp", "witch", "dreamer", "empath"], { phase: { kind: "night", number: 1 } });
    const result = rules.philosopherChoose(g, "p0", "dreamer", map);
    expect(result.game.players[0].characterId).toBe("dreamer");
    expect(result.game.players[0].alignment).toBe("good");
    expect(result.game.players[0].reminders.some((x) => x.label === "Es el Filósofo")).toBe(true);
    expect(result.game.players[3].reminders.some((x) => x.sourceCharacterId === "philosopher" && x.label === "Borracho")).toBe(true);
    expect(buildNightOrder(result.game, map).find((s) => s.key === "char:dreamer")?.playerIds).toEqual(["p0", "p3"]);
    expect(() => rules.philosopherChoose(g, "p0", "witch", map)).toThrow();
  });

  it("Pit-Hag: convierte a un jugador (conserva su bando) salvo en un personaje en juego", () => {
    const g = game(["pithag", "vortox", "dreamer", "empath", "oracle"]);
    expect(choose(g, "p2", "pithag", "Elegido").game).toBe(g);
    expect(rules.pitHagChoose(g, "p2", "empath", map).message).toContain("ya está en juego");
    const demon = rules.pitHagChoose(g, "p2", "nodashii", map);
    expect(demon.game.players[2].characterId).toBe("nodashii");
    expect(demon.game.players[2].alignment).toBe("good");
    expect(demon.message).toContain("las muertes de esta noche las decides tú");
    const poisoned = rules.addReminder(g, "p0", r("custom", "Envenenado"));
    expect(rules.pitHagChoose(poisoned, "p2", "sage", map).game.players[2].characterId).toBe("dreamer");
    expect(choiceReminder("pithag", true)).toBeUndefined();
  });

  it("Sirvienta: quién ha despertado esta noche por su habilidad", () => {
    const g = game(["chambermaid", "imp", "poisoner", "chef", "drunk", "saint"]);
    g.players[4].shownCharacterId = "monk";
    const hint = infoHints(g, catalog.get("chambermaid")!, map)[0].text;
    expect(hint).toContain("J2, J3");
    expect(hint).not.toContain("J5");
    expect(hint).not.toContain("J4");
  });

  it("Vigormortis: el Esbirro que mata conserva su habilidad y sigue despertándose", () => {
    const g = game(["vigormortis", "chef", "witch", "empath", "oracle"]);
    const result = choose(g, "p2", "vigormortis", "Muerto");
    expect(alive(result.game, "p2")).toBe(false);
    expect(result.message).toContain("conserva su habilidad");
    expect(result.message).toContain("J2 o J4");
    expect(buildNightOrder(result.game, map).find((s) => s.key === "char:witch")?.dead).toBe(false);
  });

  it("Tahúr: al tocar a quién elige, dice su personaje", () => {
    const g = game(["gambler", "imp", "poisoner", "chef", "empath"]);
    const result = choose(g, "p3", "gambler", "Elegido");
    expect(result.message).toContain("J4 es Chef. Si el Tahúr no ha acertado, muere");
    expect(result.game).toBe(g);
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
