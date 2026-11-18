import type { Character, Interaction, Jinx } from "@domain/entities/Character";
import type { Game } from "@domain/entities/Game";
import type { Distribution } from "@domain/services/SetupRules";

export type SetupStyle = "equilibrada" | "principiantes" | "caotica" | "mucha_info" | "maligna";

export interface AiSetupRequest {
  playerCount: number;
  playerNames: string[];
  scriptName: string;
  scriptCharacters: Character[];
  baseDistribution: Distribution;
  /** Notas de los personajes que cambian la preparación (Barón: +2 Forasteros…). */
  setupModifiers: Record<string, string>;
  style: SetupStyle;
  extraInstructions?: string;
  /** Si la propuesta anterior no era válida, por qué (para que la IA lo corrija). */
  previousErrors?: string[];
}

export interface AiSetupProposal {
  characterIds: string[];
  bluffIds: string[];
  /** Personaje que cree ser cada personaje engañado (drunk → washerwoman). */
  decoys: Record<string, string>;
  explanation: string;
  tips: string[];
}

export interface AiAdviceRequest {
  game: Game;
  characters: Map<string, Character>;
  /** Incompatibilidades entre los personajes en juego. */
  jinxes: Jinx[];
  /** Interacciones de la wiki entre los personajes en juego. */
  interactions: Interaction[];
  question: string;
  /** Lo ya hablado en esta conversación, de más antiguo a más reciente, para poder repreguntar. */
  history?: AiAdviceTurn[];
}

export interface AiAdviceTurn {
  question: string;
  answer: string;
}

export interface AiScriptReviewRequest {
  name: string;
  /** Personajes del guion que se revisa. */
  characters: Character[];
  /** Incompatibilidades entre los personajes del guion. */
  jinxes: Jinx[];
  /** Personajes que no están en el guion, entre los que proponer cambios. */
  alternatives: Character[];
}

/** Cambio concreto: quitar un personaje del guion y poner otro en su lugar. */
export interface AiScriptSwap {
  removeId: string;
  addId: string;
  reason: string;
}

export interface AiScriptReview {
  verdict: string;
  strengths: string[];
  problems: string[];
  swaps: AiScriptSwap[];
}

export interface AiChronicleRequest {
  game: Game;
  characters: Map<string, Character>;
}

export interface AiScriptRequest {
  idea: string;
  /** Cuántos personajes de cada tipo debe tener el guion. */
  target: { townsfolk: number; outsider: number; minion: number; demon: number };
  /** Personajes entre los que elegir. */
  characters: Character[];
  previousErrors?: string[];
}

export interface AiScriptProposal {
  name: string;
  description: string;
  characterIds: string[];
  explanation: string;
}

/** Narrador con IA. Las implementaciones deciden el proveedor (DeepSeek, función en la nube…). */
export interface AiStoryteller {
  isAvailable(): boolean;
  /** Pregunta algo trivial para comprobar clave, saldo y modelo. */
  checkConnection(): Promise<void>;
  proposeSetup(request: AiSetupRequest): Promise<AiSetupProposal>;
  advise(request: AiAdviceRequest): Promise<string>;
  proposeScript(request: AiScriptRequest): Promise<AiScriptProposal>;
  /** Opina sobre un guion ya hecho: qué funciona, qué cojea y qué cambiar. */
  reviewScript(request: AiScriptReviewRequest): Promise<AiScriptReview>;
  /** Relato de una partida terminada, para leer o compartir con la mesa. */
  chronicle(request: AiChronicleRequest): Promise<string>;
}
