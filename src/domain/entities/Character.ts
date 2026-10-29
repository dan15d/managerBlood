export type Team = "townsfolk" | "outsider" | "minion" | "demon" | "traveller" | "fabled" | "loric";
export type Alignment = "good" | "evil";
export type Edition = "tb" | "bmr" | "snv" | "exp" | "custom";

export const TEAMS_IN_BAG: readonly Team[] = ["townsfolk", "outsider", "minion", "demon"];

export const TEAM_LABEL: Record<Team, { singular: string; plural: string }> = {
  townsfolk: { singular: "Aldeano", plural: "Aldeanos" },
  outsider: { singular: "Forastero", plural: "Forasteros" },
  minion: { singular: "Esbirro", plural: "Esbirros" },
  demon: { singular: "Demonio", plural: "Demonios" },
  traveller: { singular: "Viajero", plural: "Viajeros" },
  fabled: { singular: "Fábula", plural: "Fábulas" },
  loric: { singular: "Lórico", plural: "Lóricos" },
};

export interface Character {
  id: string;
  name: string;
  /** Nombre original en inglés (para buscar y para importar guiones de la herramienta oficial). */
  nameEn?: string;
  team: Team;
  edition: Edition;
  ability: string;
  /** Posición en la hoja de la primera noche; 0 si no se despierta. */
  firstNight: number;
  /** Posición en la hoja del resto de noches; 0 si no se despierta. */
  otherNight: number;
  firstNightReminder: string;
  otherNightReminder: string;
  reminders: string[];
  /** Cambia la preparación (texto entre corchetes de la ficha). */
  setup: boolean;
  /** Icono con los colores de su bando. */
  image?: string;
  /** Icono con los colores del bando contrario (Aldeano que se vuelve malvado…). */
  imageAlt?: string;
}

export const defaultAlignment = (team: Team): Alignment =>
  team === "minion" || team === "demon" ? "evil" : "good";

export const isGoodTeam = (team: Team) => team === "townsfolk" || team === "outsider";

/** Fábulas y Lóricos: personajes del Narrador. No son jugadores ni salen de la bolsa. */
export const isStorytellerTeam = (team: Team) => team === "fabled" || team === "loric";

/** Incompatibilidad oficial (jinx): regla especial cuando dos personajes están en juego a la vez. */
export interface Jinx {
  characterIds: [string, string];
  text: string;
}
