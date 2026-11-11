import { describe, expect, it } from "vitest";
import { DUSK_REMINDERS } from "@domain/services/GameRules";
import { CHOICE_REMINDER, CHOICE_WITHOUT_REMINDER } from "@domain/services/NightInfo";
import { APP_REMINDER, disablesAbility, REMINDER } from "@domain/services/Reminders";
import { StaticCharacterCatalog } from "@infrastructure/catalog/StaticCatalog";

// Las reglas leen el estado del Grimorio en los textos de los recordatorios. Si un texto cambia
// en characters.json y no en el código (o al revés), la regla deja de funcionar sin avisar:
// estos tests lo detectan.

const catalog = new StaticCharacterCatalog();
const allLabels = new Set(catalog.all().flatMap((c) => c.reminders));
const labelsOf = (id: string) => catalog.get(id)?.reminders ?? [];
const appLabels = new Set<string>(Object.values(APP_REMINDER));

describe("recordatorios que usan las reglas", () => {
  it("cada texto de REMINDER existe en el catálogo", () => {
    for (const [key, label] of Object.entries(REMINDER)) expect(allLabels.has(label), `${key}: «${label}»`).toBe(true);
  });

  it("los que pone la app no se confunden con los del catálogo", () => {
    for (const label of appLabels) expect(allLabels.has(label), `«${label}»`).toBe(false);
  });

  it("lo que pone quien elige de noche es un recordatorio de ese personaje", () => {
    for (const [id, label] of Object.entries(CHOICE_REMINDER)) {
      expect(catalog.get(id), id).toBeDefined();
      // Los que no ponen recordatorio (Pit-Hag, Soñador…): el texto solo sirve para tocar al jugador.
      if (CHOICE_WITHOUT_REMINDER.has(id)) continue;
      expect(labelsOf(id), `${id}: «${label}»`).toContain(label);
    }
  });

  it("los que caducan al anochecer son recordatorios de su personaje", () => {
    // «Borracho» del Juglar lo pone la app: al amanecer, «Borracho hasta mañana» pasa a «Borracho».
    const madeByApp = new Set(["minstrel:Borracho"]);
    for (const key of DUSK_REMINDERS) {
      const [id, label] = key.split(/:(.*)/s);
      if (id === "custom" || madeByApp.has(key)) continue;
      expect(labelsOf(id), key).toContain(label);
    }
  });
});

describe("qué deja sin habilidad", () => {
  it.each(["Envenenado", "Borracho", "Borracho 2", "Es el Borracho", "Todos están borrachos", "Sin habilidad", APP_REMINDER.minstrelTomorrow])(
    "«%s» la quita",
    (label) => expect(disablesAbility({ label })).toBe(true),
  );

  // La locura no quita la habilidad: el jugador loco la conserva.
  it.each(["Loco", "Tiene habilidad", "Sobrio y sano", "A salvo", "Muerto"])("«%s» no la quita", (label) =>
    expect(disablesAbility({ label })).toBe(false),
  );
});
