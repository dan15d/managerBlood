import type { Team } from "@domain/entities/Character";
import type { AiScriptProposal, AiStoryteller } from "../ports/AiStoryteller";
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
