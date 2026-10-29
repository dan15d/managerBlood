import type { CharacterGuide, CharacterGuideSource } from "@application/ports/CharacterGuides";
import type { Interaction } from "@domain/entities/Character";

// Guías (una por personaje) e interacciones de la wiki de Villacuervos, en texto plano.
// Cada guía es un trozo aparte que solo se descarga al abrirla. Se generan con un script aparte;
// no editar a mano.

const guideFiles = import.meta.glob<CharacterGuide>("./data/guides/*.json", { import: "default" });

export class StaticCharacterGuides implements CharacterGuideSource {
  private interactionList?: Promise<Interaction[]>;

  async guide(characterId: string) {
    const load = guideFiles[`./data/guides/${characterId}.json`];
    return load ? load() : undefined;
  }

  interactions() {
    this.interactionList ??= import("./data/interactions.json").then((m) => m.default as Interaction[]);
    return this.interactionList;
  }
}
