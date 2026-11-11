import { describe, expect, it } from "vitest";
import type { Game } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { NEW_GAME } from "./gameFixture";

// Cronómetro de la fase, cuenta atrás y apunte de la información dada.

const game = (extra: Partial<Game> = {}): Game => ({
  ...NEW_GAME,
  id: "g",
  name: "Prueba",
  mode: "manual",
  scriptId: "",
  scriptName: "",
  players: [],
  demonBluffs: [],
  phase: { kind: "day", number: 1 },
  nightStep: 0,
  nominations: [],
  status: "in_progress",
  log: [],
  joinCode: "ABCDE",
  createdAt: "2026-11-05T10:00:00.000Z",
  updatedAt: "",
  ...extra,
});

describe("Cronómetro y cuenta atrás", () => {
  it("al cambiar de fase se apunta cuándo empieza y se quita la cuenta atrás", () => {
    const before = Date.now();
    const night = rules.startNight(rules.setTimer(game(), 60));
    expect(night.timer).toBeUndefined();
    expect(Date.parse(night.phaseStartedAt!)).toBeGreaterThanOrEqual(before);
    const day = rules.startDay(rules.setTimer(night, 60));
    expect(day.timer).toBeUndefined();
    expect(Date.parse(day.phaseStartedAt!)).toBeGreaterThanOrEqual(Date.parse(night.phaseStartedAt!));
  });

  it("en partidas de antes, el inicio de la fase lo dice el registro", () => {
    const g = game({
      phase: { kind: "night", number: 2 },
      log: [
        { at: "2026-11-05T10:10:00.000Z", phase: "Día 1", text: "J1 es ejecutado." },
        { at: "2026-11-05T10:20:00.000Z", phase: "Noche 2", text: "Cae la noche." },
        { at: "2026-11-05T10:21:00.000Z", phase: "Noche 2", text: "J2 muere por Diablillo" },
      ],
    });
    expect(rules.phaseStart(g)).toBe("2026-11-05T10:20:00.000Z");
    expect(rules.phaseStart(game())).toBe("2026-11-05T10:00:00.000Z");
    expect(rules.phaseStart(game({ phaseStartedAt: "2026-11-05T11:00:00.000Z" }))).toBe("2026-11-05T11:00:00.000Z");
  });

  it("la cuenta atrás acaba cuando toca y se puede parar", () => {
    const now = new Date("2026-11-05T12:00:00.000Z");
    const g = rules.setTimer(game(), 180, now);
    expect(g.timer).toEqual({ endsAt: "2026-11-05T12:03:00.000Z", seconds: 180 });
    expect(g.log).toHaveLength(0);
    const cleared = rules.clearTimer(g);
    expect(cleared.timer).toBeUndefined();
    expect(rules.clearTimer(cleared)).toBe(cleared);
  });

  it("la información dada queda en el registro, una línea por jugador", () => {
    const g = rules.noteInfoGiven(game({ phase: { kind: "night", number: 1 } }), ["Empático (J3): 1", "Empático (J5): 0"]);
    expect(g.log.map((l) => l.text)).toEqual(["Empático (J3): 1", "Empático (J5): 0"]);
    expect(g.log[0].phase).toBe("Noche 1");
  });
});
