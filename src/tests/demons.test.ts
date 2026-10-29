import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog, StaticOfficialScripts } from "@infrastructure/catalog/StaticCatalog";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { choiceReminder, infoHints } from "@domain/services/NightInfo";
import { buildNightOrder } from "@domain/services/NightOrder";
import { seededRandom } from "@domain/services/Random";
import { applySetupEffects, randomSelection } from "@domain/services/SetupGenerator";
import { allowedDistributions, validateSelection } from "@domain/services/SetupRules";
import { publicPlayers } from "@domain/services/TableView";

// Demonios cuyas reglas cambian quién muere, quién gana o cómo se prepara la partida.

const catalog = new StaticCharacterCatalog();
const map = catalog.map();
const chars = (ids: string[]) => ids.map((id) => catalog.get(id)!);
const tb = new StaticOfficialScripts().list().find((s) => s.id === "trouble-brewing")!;

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
const choose = (g: Game, target: string, source: string, label: string) => rules.applyReminderChoice(g, target, reminder(source, label), map);
const night = (g: Game, number: number): Game => ({ ...g, phase: { kind: "night", number } });
const day = (g: Game, number: number): Game => ({ ...g, phase: { kind: "day", number }, executedToday: undefined });

describe("Pukka", () => {
  const ids = ["pukka", "poisoner", "chef", "empath", "monk", "soldier", "washerwoman"];

  it("la víctima anterior muere y queda sana; solo hay un envenenado vivo", () => {
    let g = choose(night(game(ids), 1), "p2", "pukka", "Envenenado").game;
    expect(g.players[2].alive).toBe(true);
    g = choose(night(g, 2), "p3", "pukka", "Envenenado").game;
    expect(g.players[2]).toMatchObject({ alive: false, reminders: [] });
    expect(g.players[3].reminders.map((r) => r.label)).toEqual(["Envenenado"]);
    g = choose(night(g, 3), "p6", "pukka", "Envenenado").game;
    expect(g.players[3].alive).toBe(false);
    expect(g.players.filter((p) => p.reminders.some((r) => r.sourceCharacterId === "pukka")).map((p) => p.id)).toEqual(["p6"]);
  });

  it("si la víctima anterior está protegida, no muere y queda sana", () => {
    let g = choose(night(game(ids), 1), "p2", "pukka", "Envenenado").game;
    g = rules.addReminder(night(g, 2), "p2", reminder("innkeeper", "A salvo"));
    const result = choose(g, "p3", "pukka", "Envenenado");
    expect(result.game.players[2].alive).toBe(true);
    expect(result.game.players[2].reminders.some((r) => r.sourceCharacterId === "pukka")).toBe(false);
    expect(result.message).toContain("protegido");
  });
});

describe("Fang Gu", () => {
  it("salta al primer Forastero que elige; el siguiente muere sin más", () => {
    const ids = ["fanggu", "butler", "recluse", "chef", "poisoner", "empath", "monk"];
    let g = choose(game(ids), "p1", "fanggu", "Muerto").game;
    expect(g.players[0].alive).toBe(false);
    expect(g.players[1]).toMatchObject({ characterId: "fanggu", alignment: "evil", alive: true });
    expect(rules.victoryHint(g, map)).toBeNull();
    g = choose(night(g, 3), "p2", "fanggu", "Muerto").game;
    expect(g.players[2]).toMatchObject({ characterId: "recluse", alive: false });
  });
});

describe("Zombuul", () => {
  it("la primera vez parece muerto y la partida sigue; la segunda muere de verdad", () => {
    const ids = ["zombuul", "poisoner", "chef", "empath", "monk", "soldier", "washerwoman"];
    let g = rules.execute(day(game(ids), 2), "p0");
    expect(g.players[0].alive).toBe(false);
    expect(publicPlayers(g, map)[0].alive).toBe(false);
    expect(rules.victoryHint(g, map)).toBeNull();
    expect(rules.demonSuccession(g, map)).toBeNull();
    // Esa noche no ataca: hoy ha muerto alguien (él mismo, en apariencia).
    const n = rules.startNight(g);
    expect(infoHints(n, catalog.get("zombuul")!, map)[0].text).toContain("no despiertes");
    expect(buildNightOrder(n, map).find((s) => s.key === "char:zombuul")?.dead).toBe(false);
    g = rules.execute(rules.startDay(n), "p0");
    expect(rules.victoryHint(g, map)?.winner).toBe("good");
  });

  it("un día sin muertes, despierta para atacar", () => {
    const n = rules.startNight(day(game(["zombuul", "poisoner", "chef", "empath", "monk"]), 1));
    expect(infoHints(n, catalog.get("zombuul")!, map)[0].text).toContain("despierta al Zombuul");
  });
});

describe("Lleech", () => {
  it("la primera noche envenena a su huésped y no muere mientras viva; muere con él", () => {
    expect(choiceReminder("lleech", true)).toBe("Envenenado");
    expect(choiceReminder("lleech", false)).toBe("Muerto");
    const ids = ["lleech", "poisoner", "chef", "empath", "monk", "soldier", "washerwoman"];
    let g = choose(night(game(ids), 1), "p2", "lleech", "Envenenado").game;
    expect(g.players[2].alive).toBe(true);
    g = rules.execute(day(g, 1), "p0");
    expect(g.players[0].alive).toBe(true);
    expect(rules.victoryHint(g, map)).toBeNull();
    g = rules.killPlayer(g, "p2");
    expect(g.players[0].alive).toBe(false);
    expect(rules.victoryHint(g, map)?.winner).toBe("good");
  });
});

describe("Lil' Monsta", () => {
  it("no va en la bolsa y su hueco lo ocupa un Esbirro", () => {
    expect(allowedDistributions(7, chars(["lilmonsta"]))).toEqual([{ townsfolk: 5, outsider: 0, minion: 2, demon: 0 }]);
    expect(validateSelection(7, chars(["lilmonsta", "poisoner", "spy", "chef", "empath", "monk", "soldier", "washerwoman"]))).toEqual([]);
    const pool = [...chars(tb.characterIds).filter((c) => c.team !== "demon" && c.team !== "traveller"), catalog.get("lilmonsta")!];
    const bag = randomSelection(8, pool, seededRandom(4));
    expect(bag.filter((c) => c.id !== "lilmonsta")).toHaveLength(8);
  });

  it("despierta a los Esbirros, eligen quién lo cuida y si muere ganan los buenos", () => {
    const ids = ["poisoner", "spy", "chef", "empath", "monk", "soldier", "washerwoman"];
    let g = game(ids, { phase: { kind: "night", number: 1 }, extraCharacterIds: ["lilmonsta"] });
    const steps = buildNightOrder(g, map);
    expect(steps.find((s) => s.key === "char:lilmonsta")?.playerIds).toEqual(["p0", "p1"]);
    expect(steps.some((s) => s.kind === "minion_info")).toBe(false);
    expect(choiceReminder("lilmonsta", true)).toBe("Es el Demonio");
    g = choose(g, "p1", "lilmonsta", "Es el Demonio").game;
    g = rules.execute(day(g, 1), "p1");
    expect(rules.victoryHint(g, map)?.winner).toBe("good");
  });

  it("con la Mujer escarlata viva, pasa a cuidarlo ella", () => {
    const ids = ["scarletwoman", "spy", "chef", "empath", "monk", "soldier", "washerwoman"];
    let g = game(ids, { phase: { kind: "night", number: 1 }, extraCharacterIds: ["lilmonsta"] });
    g = choose(g, "p1", "lilmonsta", "Es el Demonio").game;
    g = rules.execute(day(g, 1), "p1");
    const s = rules.demonSuccession(g, map)!;
    expect(s.babysitter).toBe(true);
    g = rules.succeedDemon(g, s, "p0", map);
    expect(g.players[0]).toMatchObject({ characterId: "scarletwoman" });
    expect(g.players[0].reminders.map((r) => r.label)).toContain("Es el Demonio");
    expect(rules.victoryHint(g, map)).toBeNull();
  });
});

describe("Vortox y Leviatán", () => {
  it("con Vortox, un día sin ejecución gana el Mal", () => {
    const g = day(game(["vortox", "poisoner", "chef", "empath", "monk"]), 2);
    expect(rules.duskVictory(g, map)?.winner).toBe("evil");
    expect(rules.duskVictory(rules.execute(g, "p2"), map)).toBeNull();
  });

  it("Leviatán gana al terminar el día 5 o con el segundo bueno ejecutado", () => {
    const ids = ["leviathan", "poisoner", "chef", "empath", "monk", "soldier", "washerwoman"];
    expect(rules.duskVictory(day(game(ids), 4), map)).toBeNull();
    expect(rules.duskVictory(day(game(ids), 5), map)?.winner).toBe("evil");
    let g = rules.execute(day(game(ids), 1), "p2");
    expect(rules.victoryHint(g, map)).toBeNull();
    g = rules.execute(day(g, 2), "p3");
    expect(rules.victoryHint(g, map)?.winner).toBe("evil");
  });
});

describe("Shabaloth", () => {
  it("su «Muerto» no caduca al anochecer y «Vivo» regurgita al jugador", () => {
    let g = choose(game(["shabaloth", "poisoner", "chef", "empath", "monk", "soldier", "washerwoman"]), "p2", "shabaloth", "Muerto").game;
    expect(g.players[2].alive).toBe(false);
    expect(rules.expiringReminders(g)).toEqual([]);
    g = choose(night(g, 3), "p2", "shabaloth", "Vivo").game;
    expect(g.players[2].alive).toBe(true);
    expect(g.players[2].reminders.map((r) => r.label)).toEqual(["Vivo"]);
  });
});

describe("No Dashii", () => {
  it("envenena desde el principio al Aldeano más cercano a cada lado", () => {
    // Asientos: Chef, Mayordomo, No Dashii, Envenenador, Recluso, Empático, Monje.
    const g = game(["chef", "butler", "nodashii", "poisoner", "recluse", "empath", "monk"]);
    let n = 0;
    const { players } = applySetupEffects(g.players, map, seededRandom(1), () => `n${n++}`);
    const poisoned = players.filter((p) => p.reminders.some((r) => r.sourceCharacterId === "nodashii")).map((p) => p.characterId);
    expect(poisoned.sort()).toEqual(["chef", "empath"]);
  });
});
