// Las fichas de información del juego: los mensajes que el Narrador enseña por la noche
// («ESTE PERSONAJE TE HA ELEGIDO», «TÚ ERES»…). Los textos son los que usa la wiki de Villacuervos.

export type InfoTokenId =
  | "demon"
  | "minions"
  | "not_in_play"
  | "you_are"
  | "player_is"
  | "selected_you"
  | "character_is"
  | "voted_today"
  | "nominated_today";

export interface InfoToken {
  id: InfoTokenId;
  text: string;
  /** Para qué se usa, en pocas palabras (para elegirla sin dudar). */
  use: string;
}

export const INFO_TOKENS: readonly InfoToken[] = [
  { id: "selected_you", text: "Este personaje te ha elegido", use: "Cerenovus, Meretriz, Exorcista, Sereno, Predicador…" },
  { id: "you_are", text: "Tú eres", use: "Quien cambia de personaje o de bando" },
  { id: "player_is", text: "Este jugador es", use: "Lunático, Atrapa tormentas…" },
  { id: "character_is", text: "Este personaje es", use: "El Rey, al Demonio" },
  { id: "demon", text: "Este es el Demonio", use: "A los Esbirros, la primera noche" },
  { id: "minions", text: "Estos son tus Esbirros", use: "Al Demonio, la primera noche" },
  { id: "not_in_play", text: "Estos personajes no están en juego", use: "Faroles del Demonio, Chivato…" },
  { id: "voted_today", text: "¿Has votado hoy?", use: "Florista, si no recuerdas si el Demonio votó" },
  { id: "nominated_today", text: "¿Has nominado hoy?", use: "Pregonero, si no recuerdas si un Esbirro nominó" },
];

export const infoToken = (id: InfoTokenId): InfoToken => INFO_TOKENS.find((t) => t.id === id)!;

export interface StepInfoToken {
  token: InfoTokenId;
  /** Hace falta enseñar otra ficha además de la del personaje (la del que debe estar loco…). */
  more?: string;
  firstNightOnly?: boolean;
}

/**
 * Personajes cuyo paso de la noche termina enseñando una ficha de información junto a la suya
 * (según la guía de la wiki): la noche le pone un botón directo.
 */
export const STEP_INFO_TOKENS: Readonly<Record<string, StepInfoToken>> = {
  cerenovus: { token: "selected_you", more: "Añade el personaje del que debe estar loco" },
  boffin: { token: "selected_you", more: "Añade el personaje cuya habilidad tiene" },
  barista: { token: "selected_you" },
  barber: { token: "selected_you" },
  exorcist: { token: "selected_you" },
  harlot: { token: "selected_you" },
  harpy: { token: "selected_you" },
  hatter: { token: "selected_you" },
  nightwatchman: { token: "selected_you" },
  preacher: { token: "selected_you" },
  king: { token: "character_is", firstNightOnly: true },
};

export function stepInfoToken(characterId: string, firstNight: boolean): StepInfoToken | undefined {
  const entry = STEP_INFO_TOKENS[characterId];
  return entry && (!entry.firstNightOnly || firstNight) ? entry : undefined;
}
