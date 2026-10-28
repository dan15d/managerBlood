import type { Character } from "@domain/entities/Character";
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
  question: string;
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

/** Narrador con IA. Las implementaciones deciden el proveedor (OpenRouter, función en la nube…). */
export interface AiStoryteller {
  isAvailable(): boolean;
  /** Pregunta algo trivial para comprobar clave, saldo y modelo. */
  checkConnection(): Promise<void>;
  proposeSetup(request: AiSetupRequest): Promise<AiSetupProposal>;
  advise(request: AiAdviceRequest): Promise<string>;
  proposeScript(request: AiScriptRequest): Promise<AiScriptProposal>;
}
