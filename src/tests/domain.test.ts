import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog, StaticOfficialScripts } from "@infrastructure/catalog/StaticCatalog";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { buildNightOrder } from "@domain/services/NightOrder";
import { seededRandom } from "@domain/services/Random";
import { pickBluffs, pickDecoys, randomSelection } from "@domain/services/SetupGenerator";
import { allowedDistributions, baseDistribution, validateSelection } from "@domain/services/SetupRules";

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
