import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog, StaticOfficialScripts } from "@infrastructure/catalog/StaticCatalog";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { buildNightOrder } from "@domain/services/NightOrder";
import { seededRandom } from "@domain/services/Random";
import { applySetupEffects, pickBluffs, pickDecoys, randomSelection, seatMarionette } from "@domain/services/SetupGenerator";
import { defaultFabled, jinxesAmong } from "@domain/services/SpecialRules";
import { publicPlayers, seatSecret } from "@domain/services/TableView";
import { allowedDistributions, baseDistribution, maxTravellers, travellerSeats, validateSelection } from "@domain/services/SetupRules";

const catalog = new StaticCharacterCatalog();
const scripts = new StaticOfficialScripts().list();
const chars = (ids: string[]) => ids.map((id) => catalog.get(id)!);
const scriptPool = (id: string) => chars(scripts.find((s) => s.id === id)!.characterIds);

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
    scriptId: "trouble-brewing",
    scriptName: "Trouble Brewing",
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

describe("catálogo", () => {
  it("tiene los tres guiones oficiales con personajes conocidos", () => {
    expect(scripts.map((s) => s.id)).toEqual(["trouble-brewing", "bad-moon-rising", "sects-and-violets"]);
    for (const s of scripts) for (const id of s.characterIds) expect(catalog.get(id), id).toBeDefined();
  });
});

describe("preparación", () => {
  it("usa la tabla oficial", () => {
    expect(baseDistribution(5)).toEqual({ townsfolk: 3, outsider: 0, minion: 1, demon: 1 });
    expect(baseDistribution(12)).toEqual({ townsfolk: 7, outsider: 2, minion: 2, demon: 1 });
    expect(baseDistribution(18)).toEqual(baseDistribution(15));
  });

  it("aplica el Barón (+2 Forasteros) y el Padrino (±1)", () => {
    expect(allowedDistributions(7, chars(["baron"]))).toEqual([{ townsfolk: 3, outsider: 2, minion: 1, demon: 1 }]);
    expect(allowedDistributions(8, chars(["godfather"])).map((d) => d.outsider).sort()).toEqual([0, 2]);
  });

  it("detecta repartos que no cuadran", () => {
    const ok = chars(["washerwoman", "librarian", "investigator", "chef", "empath", "poisoner", "imp"]);
    expect(validateSelection(7, ok)).toEqual([]);
    const bad = chars(["washerwoman", "librarian", "investigator", "chef", "drunk", "poisoner", "imp"]);
    expect(validateSelection(7, bad).some((i) => i.level === "error")).toBe(true);
  });

  it("genera bolsas válidas al azar para todos los guiones y tamaños", () => {
    const random = seededRandom(42);
    for (const s of scripts) {
      for (let n = 5; n <= 15; n++) {
        const bag = randomSelection(n, scriptPool(s.id), random);
        expect(validateSelection(n, bag).filter((i) => i.level === "error"), `${s.id} ${n}`).toEqual([]);
      }
    }
  });

  it("elige faroles buenos fuera de juego y un Aldeano para el Borracho", () => {
    const pool = scriptPool("trouble-brewing");
    const bag = chars(["drunk", "chef", "empath", "poisoner", "imp"]);
    const decoys = pickDecoys(bag, pool, seededRandom(1));
    expect(catalog.get(decoys.drunk)!.team).toBe("townsfolk");
    const bluffs = pickBluffs([...bag.map((c) => c.id), decoys.drunk], pool, seededRandom(2));
    expect(bluffs).toHaveLength(3);
    for (const b of bluffs) expect(bag.some((c) => c.id === b) || b === decoys.drunk).toBe(false);
  });
});

describe("votaciones", () => {
  const ids = ["washerwoman", "librarian", "investigator", "chef", "empath", "poisoner", "imp"];

  it("pide la mitad de los vivos y gasta el voto de los muertos", () => {
    let g = rules.killPlayer(game(ids), "p0");
    expect(rules.voteThreshold(g)).toBe(3);
    g = rules.nominate(g, "p1", "p6", "n1");
    for (const v of ["p0", "p2", "p3"]) g = rules.toggleVote(g, "n1", v);
    g = rules.closeNomination(g, "n1");
    expect(rules.onTheBlock(g)).toEqual({ playerId: "p6", votes: 3 });
    expect(g.players[0].ghostVoteUsed).toBe(true);
    expect(() => rules.nominate(g, "p0", "p5", "n2")).toThrow("vivos");
  });

  it("un empate deja a todos libres", () => {
    let g = game(ids);
    g = rules.nominate(g, "p1", "p6", "n1");
    for (const v of ["p0", "p2", "p3", "p4"]) g = rules.toggleVote(g, "n1", v);
    g = rules.closeNomination(g, "n1");
    g = rules.nominate(g, "p2", "p5", "n2");
    for (const v of ["p0", "p1", "p3", "p4"]) g = rules.toggleVote(g, "n2", v);
    g = rules.closeNomination(g, "n2");
    expect(rules.onTheBlock(g)).toBeNull();
  });

  it("sugiere la victoria del Bien al morir el Demonio", () => {
    const g = rules.execute(game(ids), "p6");
    expect(rules.victoryHint(g, catalog.map())?.winner).toBe("good");
  });
});

describe("orden de la noche", () => {
  it("la primera noche con 7+ jugadores incluye la información del Mal en su sitio", () => {
    const g = game(["washerwoman", "librarian", "investigator", "chef", "drunk", "poisoner", "imp"], {
      phase: { kind: "night", number: 1 },
    });
    g.players[4].shownCharacterId = "empath";
    const keys = buildNightOrder(g, catalog.map()).map((s) => s.key);
    expect(keys[0]).toBe("dusk");
    expect(keys.at(-1)).toBe("dawn");
    expect(keys.indexOf("minion_info")).toBeLessThan(keys.indexOf("char:poisoner"));
    expect(keys.indexOf("demon_info")).toBeLessThan(keys.indexOf("char:washerwoman"));
    expect(keys).toContain("char:empath");
  });

  it("con 5 jugadores no hay información del Mal", () => {
    const g = game(["washerwoman", "chef", "empath", "poisoner", "imp"], { phase: { kind: "night", number: 1 } });
    expect(buildNightOrder(g, catalog.map()).some((s) => s.kind === "minion_info")).toBe(false);
  });
});

describe("lo que ve cada jugador", () => {
  const map = catalog.map();
  const seat = (characterId: string, shownCharacterId?: string): Player => ({
    id: "p",
    seat: 0,
    name: "J",
    characterId,
    shownCharacterId,
    alignment: ["minion", "demon"].includes(catalog.get(characterId)!.team) ? "evil" : "good",
    alive: true,
    ghostVoteUsed: false,
    reminders: [],
  });

  it("el Borracho ve el Aldeano que cree ser, como Bueno, nunca «Borracho»", () => {
    expect(seatSecret(seat("drunk", "empath"), map)).toEqual({ characterId: "empath", alignment: "good" });
  });

  it("el Lunático ve el Demonio que cree ser, como Malvado", () => {
    expect(seatSecret(seat("lunatic", "imp"), map)).toEqual({ characterId: "imp", alignment: "evil" });
  });

  it("si al Borracho no se le ha dado personaje falso, no ve nada", () => {
    expect(seatSecret(seat("drunk"), map)).toEqual({});
    expect(seatSecret(seat("marionette"), map)).toEqual({});
  });

  it("el resto ve su personaje y su bando (también si ha cambiado de bando)", () => {
    expect(seatSecret(seat("chef"), map)).toEqual({ characterId: "chef", alignment: "good" });
    expect(seatSecret({ ...seat("chef"), alignment: "evil" }, map)).toEqual({ characterId: "chef", alignment: "evil" });
  });

  it("al repartir, el Borracho recibe su Aldeano falso y queda en el Grimorio como Borracho", () => {
    const pool = scriptPool("trouble-brewing");
    const bag = chars(["drunk", "chef", "empath", "poisoner", "imp"]);
    const decoys = pickDecoys(bag, pool, seededRandom(3));
    const shown = catalog.get(decoys.drunk)!;
    expect(shown.team).toBe("townsfolk");
    expect(bag.some((c) => c.id === shown.id)).toBe(false);
    expect(seatSecret(seat("drunk", shown.id), map).characterId).toBe(shown.id);
  });
});

describe("Viajeros", () => {
  it("son opcionales, pero la bolsa nunca baja de 5", () => {
    expect(maxTravellers(8)).toBe(3);
    expect(maxTravellers(5)).toBe(0);
  });

  it("ocupan los últimos asientos salvo que el Narrador elija otro", () => {
    expect(travellerSeats(8, ["thief", "beggar"])).toEqual({ 7: "thief", 6: "beggar" });
    expect(travellerSeats(8, ["thief", "beggar"], { beggar: 0 })).toEqual({ 0: "beggar", 7: "thief" });
  });

  it("si dos eligen el mismo asiento, el segundo va a un asiento libre", () => {
    expect(travellerSeats(6, ["thief", "beggar"], { thief: 2, beggar: 2 })).toEqual({ 2: "thief", 5: "beggar" });
  });

  it("la mesa pública enseña el personaje de los Viajeros y de nadie más", () => {
    const g = game(["chef", "empath", "poisoner", "imp", "washerwoman", "thief"]);
    const players = publicPlayers(g, catalog.map());
    expect(players[5].travellerId).toBe("thief");
    expect(players.slice(0, 5).every((p) => p.travellerId === undefined)).toBe(true);
  });
});

describe("Fábulas, Lóricos y casos especiales", () => {
  const tb7 = ["washerwoman", "librarian", "investigator", "chef", "empath", "poisoner", "imp"];

  it("el Centinela permite un Forastero más o menos", () => {
    const withOutsider = chars(["washerwoman", "librarian", "investigator", "chef", "butler", "poisoner", "imp"]);
    expect(validateSelection(7, withOutsider).some((i) => i.level === "error")).toBe(true);
    expect(validateSelection(7, [...withOutsider, ...chars(["sentinel"])])).toEqual([]);
  });

  it("con el Papa se repiten buenos, pero nunca malos", () => {
    const twoChefs = chars(["chef", "chef", "investigator", "empath", "washerwoman", "poisoner", "imp"]);
    expect(validateSelection(7, twoChefs).some((i) => i.level === "error")).toBe(true);
    expect(validateSelection(7, [...twoChefs, ...chars(["pope"])])).toEqual([]);
    const twoImps = chars(["chef", "investigator", "empath", "washerwoman", "librarian", "imp", "imp"]);
    expect(validateSelection(7, [...twoImps, ...chars(["pope"])]).some((i) => i.level === "error")).toBe(true);
  });

  it("hasta 3 Tontos del pueblo sin Papa", () => {
    const idiots = chars(["villageidiot", "villageidiot", "villageidiot", "chef", "empath", "poisoner", "imp"]);
    expect(validateSelection(7, idiots)).toEqual([]);
  });

  it("el Hereje no puede estar con el Barón (incompatibilidad)", () => {
    const bag = chars(["heretic", "butler", "chef", "empath", "investigator", "baron", "imp"]);
    expect(validateSelection(7, bag).map((i) => i.message).join(" ")).toContain("no pueden estar los dos");
  });

  it("con el Ateo no hay malos; con el Invocador no hay Demonio", () => {
    const atheist = chars(["atheist", "chef", "empath", "investigator", "washerwoman", "librarian", "monk"]);
    expect(validateSelection(7, atheist)).toEqual([]);
    const summoner = chars(["chef", "empath", "investigator", "washerwoman", "librarian", "monk", "summoner"]);
    expect(validateSelection(7, summoner)).toEqual([]);
  });

  it("el Juguetero da información al Mal con menos de 7; Tor la quita", () => {
    const five = ["chef", "empath", "investigator", "poisoner", "imp"];
    const kinds = (g: Game) => buildNightOrder(g, catalog.map()).map((s) => s.kind);
    const night1 = { phase: { kind: "night", number: 1 } } as const;
    expect(kinds(game(five, night1))).not.toContain("minion_info");
    expect(kinds(game(five, { ...night1, fabledIds: ["toymaker"] }))).toContain("minion_info");
    expect(kinds(game(tb7, { ...night1, fabledIds: ["tor"] }))).not.toContain("demon_info");
  });

  it("las Fábulas con paso de noche salen en la hoja sin jugadores y sin marcarse muertas", () => {
    const steps = buildNightOrder(game(tb7, { phase: { kind: "night", number: 1 }, fabledIds: ["angel"] }), catalog.map());
    const angel = steps.find((s) => s.key === "char:angel")!;
    expect(angel.playerIds).toEqual([]);
    expect(angel.dead).toBe(false);
  });

  it("con Tor los vivos no ven su personaje", () => {
    const g = game(tb7, { fabledIds: ["tor"] });
    expect(seatSecret(g.players[0], catalog.map(), g.fabledIds)).toEqual({});
    expect(seatSecret({ ...g.players[0], alive: false }, catalog.map(), g.fabledIds).characterId).toBe("washerwoman");
  });

  it("el Djinn entra si el guion tiene incompatibilidades", () => {
    const jinxes = catalog.jinxes();
    expect(defaultFabled(chars(["chef", "imp", "sentinel"]), jinxes)).toEqual(["sentinel"]);
    expect(defaultFabled(chars(["heretic", "baron", "imp"]), jinxes)).toEqual(["djinn"]);
    expect(jinxesAmong(["spy", "magician", "chef"], jinxes)).toHaveLength(1);
  });

  it("se ponen y quitan Fábulas durante la partida, pero no otros personajes", () => {
    let g = rules.toggleFabled(game(tb7), catalog.get("ferryman")!);
    expect(g.fabledIds).toEqual(["ferryman"]);
    g = rules.toggleFabled(g, catalog.get("ferryman")!);
    expect(g.fabledIds).toEqual([]);
    expect(() => rules.toggleFabled(g, catalog.get("chef")!)).toThrow();
  });

  it("la Marioneta se sienta junto al Demonio", () => {
    const g = game(["marionette", "chef", "empath", "imp", "investigator", "washerwoman", "librarian"]);
    const players = seatMarionette(g.players, catalog.map(), seededRandom(5));
    const m = players.find((p) => p.characterId === "marionette")!;
    expect([2, 4]).toContain(m.seat);
    expect(players.filter((p) => p.characterId === "marionette")).toHaveLength(1);
  });

  it("el Cazarrecompensas vuelve malo a un Aldeano; un Tonto del pueblo extra está borracho", () => {
    const g = game(["bountyhunter", "chef", "villageidiot", "villageidiot", "empath", "poisoner", "imp"]);
    let n = 0;
    const { players, log } = applySetupEffects(g.players, catalog.map(), seededRandom(9), () => `r${n++}`);
    const evilTownsfolk = players.filter((p) => p.alignment === "evil" && catalog.get(p.characterId)!.team === "townsfolk");
    expect(evilTownsfolk).toHaveLength(1);
    expect(evilTownsfolk[0].characterId).not.toBe("bountyhunter");
    expect(players.filter((p) => p.reminders.some((r) => r.label === "Borracho"))).toHaveLength(1);
    expect(log).toHaveLength(2);
  });

  it("la Marioneta no cree ser el Rey si está el Niño del coro", () => {
    const pool = chars(["king", "chef"]);
    for (let seed = 0; seed < 10; seed++) {
      expect(pickDecoys(chars(["marionette", "choirboy"]), pool, seededRandom(seed)).marionette).toBe("chef");
    }
  });
});
