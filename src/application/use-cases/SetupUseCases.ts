import type { Character } from "@domain/entities/Character";
import type { Script } from "@domain/entities/Script";
import type { RandomFn } from "@domain/services/Random";
import { pickBluffs, pickDecoys, randomSelection } from "@domain/services/SetupGenerator";
import { baseDistribution, SETUP_MODIFIERS, validateSelection } from "@domain/services/SetupRules";
import type { AiSetupProposal, AiStoryteller, SetupStyle } from "../ports/AiStoryteller";
import type { CharacterCatalog } from "../ports/CharacterCatalog";

export interface SetupProposal {
  characterIds: string[];
  bluffIds: string[];
  decoys: Record<string, string>;
  explanation?: string;
  tips?: string[];
}

export const scriptCharacters = (catalog: CharacterCatalog, script: Script) =>
  script.characterIds.map((id) => catalog.get(id)).filter((c): c is Character => !!c);

/** Reparto al azar respetando la hoja de preparación (botón «Al azar» del modo manual). */
export class SuggestRandomSetup {
  constructor(
    private readonly catalog: CharacterCatalog,
    private readonly random: RandomFn,
  ) {}

  execute(script: Script, playerCount: number): SetupProposal {
    const pool = scriptCharacters(this.catalog, script);
    const bag = randomSelection(playerCount, pool, this.random);
    const decoys = pickDecoys(bag, pool, this.random);
    const bluffIds = pickBluffs([...bag.map((c) => c.id), ...Object.values(decoys)], pool, this.random);
    return { characterIds: bag.map((c) => c.id), bluffIds, decoys };
  }
}

/** Completa engaños (Borracho…) y faroles para una selección hecha a mano. */
export class CompleteManualSetup {
  constructor(
    private readonly catalog: CharacterCatalog,
    private readonly random: RandomFn,
  ) {}

  execute(script: Script, characterIds: string[], current: { decoys?: Record<string, string>; bluffIds?: string[] } = {}): SetupProposal {
    const pool = scriptCharacters(this.catalog, script);
    const bag = characterIds.map((id) => this.catalog.get(id)).filter((c): c is Character => !!c);
    const decoys = pickDecoys(bag, pool, this.random, current.decoys);
    const taken = new Set([...characterIds, ...Object.values(decoys)]);
    const kept = (current.bluffIds ?? []).filter((id) => !taken.has(id)).slice(0, 3);
    const bluffIds = kept.length === 3 ? kept : [...kept, ...pickBluffs([...taken, ...kept], pool, this.random)].slice(0, 3);
    return { characterIds, bluffIds, decoys };
  }
}

/**
 * Pide el reparto a la IA y lo valida con las reglas del dominio. Si la IA se equivoca,
 * se le reenvían los errores una vez; si vuelve a fallar, se avisa al Narrador.
 */
export class GenerateAiSetup {
  constructor(
    private readonly catalog: CharacterCatalog,
    private readonly ai: AiStoryteller,
    private readonly random: RandomFn,
  ) {}

  async execute(input: {
    script: Script;
    playerNames: string[];
    style: SetupStyle;
    extraInstructions?: string;
  }): Promise<SetupProposal> {
    const pool = scriptCharacters(this.catalog, input.script);
    const playerCount = input.playerNames.length;
    const modifiers = Object.fromEntries(
      pool.filter((c) => SETUP_MODIFIERS[c.id]).map((c) => [c.id, SETUP_MODIFIERS[c.id].note]),
    );
    let previousErrors: string[] | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const proposal = await this.ai.proposeSetup({
        playerCount,
        playerNames: input.playerNames,
        scriptName: input.script.name,
        scriptCharacters: pool.filter((c) => ["townsfolk", "outsider", "minion", "demon"].includes(c.team)),
        baseDistribution: baseDistribution(playerCount),
        setupModifiers: modifiers,
        style: input.style,
        extraInstructions: input.extraInstructions,
        previousErrors,
      });
      const errors = this.check(proposal, pool, playerCount);
      if (!errors.length) return this.complete(proposal, pool);
      previousErrors = errors;
    }
    throw new Error(`La IA no ha dado un reparto válido: ${previousErrors?.join(" ")}`);
  }

  private check(p: AiSetupProposal, pool: Character[], playerCount: number): string[] {
    const ids = new Set(pool.map((c) => c.id));
    const unknown = p.characterIds.filter((id) => !ids.has(id));
    if (unknown.length) return [`Estos personajes no están en el guion: ${unknown.join(", ")}.`];
    const chosen = p.characterIds.map((id) => pool.find((c) => c.id === id)!);
    return validateSelection(playerCount, chosen)
      .filter((i) => i.level === "error")
      .map((i) => i.message);
  }

  /** Rellena faroles y engaños que falten o no sean válidos. */
  private complete(p: AiSetupProposal, pool: Character[]): SetupProposal {
    const bag = p.characterIds.map((id) => pool.find((c) => c.id === id)!);
    const decoys = pickDecoys(bag, pool, this.random, p.decoys);
    const taken = new Set([...p.characterIds, ...Object.values(decoys)]);
    const goodFree = (id: string) => {
      const c = pool.find((x) => x.id === id);
      return !!c && !taken.has(id) && (c.team === "townsfolk" || c.team === "outsider");
    };
    let bluffIds = [...new Set(p.bluffIds)].filter(goodFree).slice(0, 3);
    if (bluffIds.length < 3) bluffIds = [...bluffIds, ...pickBluffs([...taken, ...bluffIds], pool, this.random)].slice(0, 3);
    return { characterIds: p.characterIds, bluffIds, decoys, explanation: p.explanation, tips: p.tips };
  }
}
