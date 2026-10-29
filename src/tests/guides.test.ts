import { describe, expect, it } from "vitest";
import type { CharacterGuideSource } from "@application/ports/CharacterGuides";
import { GUIDE_SECTIONS, ListSpecialCases, ReadCharacterGuide } from "@application/use-cases/GuideUseCases";
import { StaticCharacterCatalog } from "@infrastructure/catalog/StaticCatalog";
import { StaticCharacterGuides } from "@infrastructure/catalog/StaticGuides";

const catalog = new StaticCharacterCatalog();
const guides = new StaticCharacterGuides();

describe("guías de la wiki", () => {
  it("hay guía de todos los personajes", async () => {
    for (const c of catalog.all()) expect(await guides.guide(c.id), c.id).toBeDefined();
  });

  it("el jugador nunca ve cómo narrarlo ni los detalles del Narrador", async () => {
    const read = new ReadCharacterGuide(catalog, guides);
    for (const id of ["drunk", "imp", "spy", "washerwoman", "toymaker"]) {
      const player = (await read.execute(id, "player"))!.sections.map((s) => s.section);
      expect(player.every((s) => GUIDE_SECTIONS.player.includes(s)), id).toBe(true);
      expect(player).not.toContain("howToRun");
      expect(player).not.toContain("more");
    }
    const storyteller = (await read.execute("drunk", "storyteller"))!.sections.map((s) => s.section);
    expect(storyteller).toContain("howToRun");
  });

  it("los apartados salen en texto plano, sin HTML ni marcas de la wiki", async () => {
    for (const c of catalog.all()) {
      const text = JSON.stringify(await guides.guide(c.id));
      expect(text, c.id).not.toMatch(/<[a-z]|\[role|\[\/r/);
    }
  });

  it("los casos especiales solo cuentan personajes en juego", async () => {
    const cases = new ListSpecialCases(catalog, guides);
    const withSpy = await cases.execute("magician", ["spy", "imp"]);
    expect(withSpy.jinxes.map((j) => j.characterIds)).toContainEqual(["magician", "spy"]);
    const alone = await cases.execute("magician", ["chef", "imp"]);
    expect(alone.jinxes).toEqual([]);

    const [first] = await guides.interactions();
    const [a, b] = first.characterIds;
    expect((await cases.execute(a, [b])).interactions).toContainEqual(first);
    expect((await cases.execute(a, [])).interactions).toEqual([]);
  });

  it("si una guía no existe, no se enseña nada", async () => {
    const empty: CharacterGuideSource = { guide: async () => undefined, interactions: async () => [] };
    expect(await new ReadCharacterGuide(catalog, empty).execute("chef", "player")).toBeNull();
  });
});
