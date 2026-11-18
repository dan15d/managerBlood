import type { Team } from "@domain/entities/Character";
import { jinxesAmong } from "@domain/services/SpecialRules";
import type { AiScriptProposal, AiScriptReview, AiStoryteller } from "../ports/AiStoryteller";
import type { CharacterCatalog } from "../ports/CharacterCatalog";

export type ScriptSize = "classic" | "teensy";

/** Reparto de un guion completo: el clásico de 25 personajes o uno pequeño para 5-6 jugadores. */
export const SCRIPT_TARGETS: Record<ScriptSize, { townsfolk: number; outsider: number; minion: number; demon: number }> = {
  classic: { townsfolk: 13, outsider: 4, minion: 4, demon: 4 },
  teensy: { townsfolk: 6, outsider: 2, minion: 2, demon: 1 },
};

const BAG_TEAMS: Team[] = ["townsfolk", "outsider", "minion", "demon"];

export interface GeneratedScript extends AiScriptProposal {
  /** Avisos si la IA no ha clavado el reparto (el Narrador lo puede retocar en el editor). */
  warnings: string[];
}

/** Con menos personajes no hay guion que valorar. */
const MIN_TO_REVIEW = 5;

export interface ScriptReview extends AiScriptReview {
  /** Personajes del guion tal como se revisó, para saber si ha cambiado desde entonces. */
  reviewedIds: string[];
}

/** Pide a la IA una opinión sobre un guion y se queda solo con los cambios que se pueden aplicar. */
export class ReviewAiScript {
  constructor(
    private readonly catalog: CharacterCatalog,
    private readonly ai: AiStoryteller,
  ) {}

  async execute(input: { name: string; characterIds: string[] }): Promise<ScriptReview> {
    const ids = [...new Set(input.characterIds)].filter((id) => this.catalog.get(id));
    if (ids.length < MIN_TO_REVIEW) throw new Error("Añade más personajes al guion antes de revisarlo.");
    const inScript = new Set(ids);
    const review = await this.ai.reviewScript({
      name: input.name.trim(),
      characters: ids.map((id) => this.catalog.get(id)!),
      jinxes: jinxesAmong(ids, this.catalog.jinxes()),
      alternatives: this.catalog.all().filter((c) => BAG_TEAMS.includes(c.team) && !inScript.has(c.id)),
    });

    // Cada personaje sale o entra una sola vez; lo que no exista o no cuadre con el guion se descarta.
    const used = new Set<string>();
    const swaps = review.swaps.filter((s) => {
      const add = this.catalog.get(s.addId);
      const ok = inScript.has(s.removeId) && !!add && BAG_TEAMS.includes(add.team) && !inScript.has(s.addId) && !used.has(s.removeId) && !used.has(s.addId);
      if (ok) used.add(s.removeId).add(s.addId);
      return ok;
    });
    if (!review.verdict.trim() && !review.problems.length && !swaps.length) throw new Error("La IA no ha sabido valorar el guion. Prueba otra vez.");
    return { ...review, swaps, reviewedIds: ids };
  }
}

/** Diseña un guion con IA a partir de una idea y comprueba que los personajes existen y cuadran por tipo. */
export class GenerateAiScript {
  constructor(
    private readonly catalog: CharacterCatalog,
    private readonly ai: AiStoryteller,
  ) {}

  async execute(input: { idea: string; size: ScriptSize }): Promise<GeneratedScript> {
    if (!input.idea.trim()) throw new Error("Describe qué guion quieres.");
    const target = SCRIPT_TARGETS[input.size];
    const characters = this.catalog.all().filter((c) => BAG_TEAMS.includes(c.team));
    let previousErrors: string[] | undefined;
    let last: { proposal: AiScriptProposal; ids: string[]; problems: string[] } | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const proposal = await this.ai.proposeScript({ idea: input.idea.trim(), target, characters, previousErrors });
      const ids = [...new Set(proposal.characterIds)].filter((id) => characters.some((c) => c.id === id));
      const problems = this.check(ids, proposal.characterIds, target);
      last = { proposal, ids, problems };
      if (!problems.length) break;
      previousErrors = problems;
    }
    const { proposal, ids, problems } = last!;
    if (!ids.length) throw new Error("La IA no ha propuesto personajes válidos. Prueba con otra idea.");
    return { ...proposal, name: proposal.name.trim() || "Guion sin nombre", characterIds: ids, warnings: problems };
  }

  private check(ids: string[], raw: string[], target: Record<string, number>): string[] {
    const problems: string[] = [];
    const unknown = raw.filter((id) => !this.catalog.get(id));
    if (unknown.length) problems.push(`No existen estos personajes: ${unknown.join(", ")}.`);
    const byTeam = (team: Team) => ids.filter((id) => this.catalog.get(id)?.team === team).length;
    const labels: Record<string, string> = { townsfolk: "Aldeanos", outsider: "Forasteros", minion: "Esbirros", demon: "Demonios" };
    for (const team of BAG_TEAMS) {
      const got = byTeam(team);
      if (got !== target[team]) problems.push(`Hay ${got} ${labels[team]} y deben ser ${target[team]}.`);
    }
    return problems;
  }
}
