import { describe, expect, it } from "vitest";
import { INFO_TOKENS, infoToken, STEP_INFO_TOKENS, stepInfoToken } from "@domain/services/InfoTokens";
import { StaticCharacterCatalog } from "@infrastructure/catalog/StaticCatalog";
import { StaticCharacterGuides } from "@infrastructure/catalog/StaticGuides";

const catalog = new StaticCharacterCatalog();
const guides = new StaticCharacterGuides();
const upper = (s: string) => s.toLocaleUpperCase("es");

describe("fichas de información", () => {
  it("no se repiten", () => {
    expect(new Set(INFO_TOKENS.map((t) => t.id)).size).toBe(INFO_TOKENS.length);
    expect(new Set(INFO_TOKENS.map((t) => t.text)).size).toBe(INFO_TOKENS.length);
  });

  it("los textos son los que cita la wiki", async () => {
    const all = (await Promise.all(catalog.all().map((c) => guides.guide(c.id)))).map((g) => JSON.stringify(g)).join("\n");
    for (const t of INFO_TOKENS) expect(all, t.text).toContain(upper(t.text));
  });

  it("el botón directo de cada paso es de un personaje que la usa según su guía", async () => {
    for (const [id, step] of Object.entries(STEP_INFO_TOKENS)) {
      expect(catalog.all().some((c) => c.id === id), id).toBe(true);
      expect(JSON.stringify(await guides.guide(id)), id).toContain(upper(infoToken(step.token).text));
    }
  });

  it("el Rey solo la enseña la primera noche", () => {
    expect(stepInfoToken("king", true)?.token).toBe("character_is");
    expect(stepInfoToken("king", false)).toBeUndefined();
    expect(stepInfoToken("cerenovus", false)?.more).toBeTruthy();
    expect(stepInfoToken("imp", true)).toBeUndefined();
  });
});
