import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog } from "@infrastructure/catalog/StaticCatalog";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { infoHints, nearestEvilSide } from "@domain/services/NightInfo";

// Respuestas de la noche que la app calcula con el Grimorio.

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
    phase: { kind: "night", number: 1 },
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
const hint = (g: Game, id: string) => infoHints(g, catalog.get(id)!, map)[0]?.text;
const r = (source: string, label: string) => ({ id: `${source}-${label}`, sourceCharacterId: source, label });

describe("Respuestas de la noche", () => {
  it("Oráculo: cuántos muertos son malos", () => {
    let g = game(["imp", "poisoner", "oracle", "chef", "empath"], { phase: { kind: "night", number: 2 } });
    expect(hint(g, "oracle")).toContain("0");
    g = rules.killPlayer(rules.killPlayer(g, "p1"), "p3");
    expect(hint(g, "oracle")).toContain("1");
  });

  it("Shugenja: hacia qué lado está el malo más cercano", () => {
    // Asientos: Shugenja, Chef, Diablillo, Empático, Envenenador, Monje, Soldado.
    // Hacia la derecha el Diablillo está a 2; hacia la izquierda, el Envenenador a 3.
    const g = game(["shugenja", "chef", "imp", "empath", "poisoner", "monk", "soldier"]);
    expect(nearestEvilSide(g, g.players[0])).toBe("clockwise");
    expect(hint(g, "shugenja")).toContain("agujas del reloj");
    const tie = game(["shugenja", "imp", "chef", "empath", "poisoner"]);
    expect(nearestEvilSide(tie, tie.players[0])).toBe("both");
  });

  it("Caballero, Noble y Administrador: a quién puede señalar", () => {
    const g = game(["knight", "noble", "steward", "imp", "poisoner", "chef"]);
    expect(hint(g, "knight")).not.toContain("J4 (Diablillo)");
    expect(hint(g, "noble")).toContain("1 malo (4. J4 (Diablillo), 5. J5 (Envenenador))");
    expect(hint(g, "steward")).not.toContain("Envenenador");
  });

  it("Abuela: señala a su nieto la primera noche", () => {
    const g = rules.addReminder(game(["grandmother", "chef", "imp", "poisoner", "empath"]), "p1", r("grandmother", "Nieto"));
    expect(hint(g, "grandmother")).toContain("J2 y enséñale Chef");
    expect(hint(game(["grandmother", "chef", "imp", "poisoner", "empath"]), "grandmother")).toContain("Falta");
  });

  it("Sabio: si le mata el Demonio, señala al Demonio y a otro", () => {
    let g = game(["imp", "poisoner", "sage", "chef", "empath"], { phase: { kind: "night", number: 2 } });
    g = rules.applyReminderChoice(g, "p2", r("imp", "Muerto"), map).game;
    expect(hint(g, "sage")).toContain("Señala al Demonio (J1)");
  });

  it("Rey y Niño del coro", () => {
    let g = game(["imp", "poisoner", "king", "choirboy", "chef", "empath"], { phase: { kind: "night", number: 2 } });
    expect(hint(g, "king")).toContain("más vivos que muertos");
    expect(hint(g, "choirboy")).toContain("no le despiertes");
    g = rules.applyReminderChoice(g, "p2", r("imp", "Muerto"), map).game;
    expect(hint(g, "choirboy")).toContain("señala al Demonio (J1)");
  });

  it("Cazarrecompensas: señala a su conocido y a otro cuando muere", () => {
    let g = game(["bountyhunter", "imp", "poisoner", "chef", "empath"]);
    expect(hint(g, "bountyhunter")).toContain("Falta poner");
    g = rules.addReminder(g, "p2", r("bountyhunter", "Conocido"));
    expect(hint(g, "bountyhunter")).toContain("Señala a J3");
    g = rules.killPlayer({ ...g, phase: { kind: "night", number: 2 } }, "p2");
    expect(hint(g, "bountyhunter")).toContain("Ha muerto J3");
  });

  it("Soñador, Guardián de cuervos y Tonto del pueblo: al tocar al elegido, la respuesta", () => {
    const g = game(["dreamer", "ravenkeeper", "villageidiot", "imp", "poisoner", "chef"], { phase: { kind: "night", number: 2 } });
    const choose = (source: string, target: string) => rules.applyReminderChoice(g, target, r(source, "Elegido"), map);
    expect(choose("dreamer", "p3").message).toContain("J4 es Diablillo (malo): enséñale Diablillo y un personaje bueno");
    expect(choose("ravenkeeper", "p5").message).toContain("Enséñale Chef");
    expect(choose("villageidiot", "p4").message).toContain("malo: pulgar hacia abajo");
    // No cambia nada en el Grimorio.
    expect(choose("dreamer", "p3").game).toBe(g);
  });

  it("si quien elige no tiene habilidad o hay Recluso, lo avisa", () => {
    const g = game(["drunk", "recluse", "imp", "poisoner", "chef"], { phase: { kind: "night", number: 2 } });
    g.players[0].shownCharacterId = "dreamer";
    const message = rules.applyReminderChoice(g, "p1", r("dreamer", "Elegido"), map).message;
    expect(message).toContain("no tiene habilidad");
    expect(message).toContain("Recluso puede aparecer distinto");
  });

  it("Padrino y Marioneta", () => {
    expect(hint(game(["godfather", "imp", "butler", "chef", "empath"]), "godfather")).toContain("Mayordomo");
    expect(hint(game(["marionette", "imp", "chef", "empath", "monk"]), "marionette")).toContain("Marioneta: J1");
  });
});
