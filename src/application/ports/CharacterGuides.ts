import type { Interaction } from "@domain/entities/Character";

/** Apartados de la guía de un personaje en la wiki. */
export type GuideSection = "summary" | "howToRun" | "examples" | "tips" | "bluffing" | "more";

/** Un párrafo, un punto de lista o un ejemplo (cita) de la guía, en texto plano. */
export interface GuideBlock {
  kind: "p" | "li" | "quote";
  text: string;
}

export type CharacterGuide = Partial<Record<GuideSection, GuideBlock[]>> & {
  /** Frase del personaje (sabor). */
  quote?: string;
};

/** Guías e interacciones de la wiki. Son grandes: se cargan cuando se piden. */
export interface CharacterGuideSource {
  guide(characterId: string): Promise<CharacterGuide | undefined>;
  interactions(): Promise<Interaction[]>;
}
