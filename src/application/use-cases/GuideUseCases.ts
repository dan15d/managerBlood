import type { Interaction, Jinx } from "@domain/entities/Character";
import { jinxesOf } from "@domain/services/SpecialRules";
import type { CharacterCatalog } from "../ports/CharacterCatalog";
import type { CharacterGuideSource, GuideBlock, GuideSection } from "../ports/CharacterGuides";

/**
 * Quién lee la guía. El Narrador ve cómo narrarlo y los detalles de reglas; el jugador, lo que le
 * sirve para jugar (consejos y cómo farolear). Al jugador nunca se le enseña nada que dependa de
 * la partida: solo la guía del personaje que cree ser, igual que la de cualquier personaje del guion.
 */
export type GuideAudience = "storyteller" | "player";

export const GUIDE_SECTIONS: Record<GuideAudience, readonly GuideSection[]> = {
  storyteller: ["summary", "howToRun", "examples", "more"],
  player: ["summary", "examples", "tips", "bluffing"],
};

const TITLES: Record<GuideSection, (name: string) => string> = {
  summary: () => "Resumen",
  howToRun: () => "Cómo narrarlo",
  examples: () => "Ejemplos",
  tips: () => "Consejos",
  bluffing: (name) => `Farolear como ${name}`,
  more: () => "Más detalles de reglas",
};

export interface GuideView {
  sections: { section: GuideSection; title: string; blocks: GuideBlock[] }[];
  quote?: string;
}

/** La guía de un personaje con solo los apartados de quien la lee. */
export class ReadCharacterGuide {
  constructor(
    private readonly catalog: CharacterCatalog,
    private readonly guides: CharacterGuideSource,
  ) {}

  async execute(characterId: string, audience: GuideAudience): Promise<GuideView | null> {
    const guide = await this.guides.guide(characterId);
    if (!guide) return null;
    const name = this.catalog.get(characterId)?.name ?? characterId;
    return {
      sections: GUIDE_SECTIONS[audience]
        .filter((s) => guide[s]?.length)
        .map((s) => ({ section: s, title: TITLES[s](name), blocks: guide[s]! })),
      quote: guide.quote,
    };
  }
}

/**
 * Casos especiales de un personaje con los demás de la partida: incompatibilidades oficiales e
 * interacciones de la wiki. Solo para el Narrador: dependen de qué hay en juego.
 */
export class ListSpecialCases {
  constructor(
    private readonly catalog: CharacterCatalog,
    private readonly guides: CharacterGuideSource,
  ) {}

  async execute(characterId: string, inPlayIds: Iterable<string>): Promise<{ jinxes: Jinx[]; interactions: Interaction[] }> {
    const others = [...inPlayIds].filter((id) => id !== characterId);
    return {
      jinxes: jinxesOf(characterId, others, this.catalog.jinxes()),
      interactions: jinxesOf(characterId, others, await this.guides.interactions()),
    };
  }
}
