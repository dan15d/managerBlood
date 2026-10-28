import type { AiScriptProposal, AiScriptRequest, AiStoryteller } from "@application/ports/AiStoryteller";
import { GenerateAiScript, SCRIPT_TARGETS } from "@application/use-cases/AiScriptUseCases";
import { StaticCharacterCatalog, StaticOfficialScripts } from "@infrastructure/catalog/StaticCatalog";
import { describe, expect, it } from "vitest";

const catalog = new StaticCharacterCatalog();
const tb = new StaticOfficialScripts().list().find((s) => s.id === "trouble-brewing")!;
const tbBag = tb.characterIds.filter((id) => catalog.get(id)?.team !== "traveller");

/** IA de mentira: devuelve las respuestas en orden y guarda lo que se le pidió. */
function fakeAi(answers: AiScriptProposal[]) {
  const requests: AiScriptRequest[] = [];
  const ai: AiStoryteller = {
    isAvailable: () => true,
    checkConnection: async () => undefined,
    proposeSetup: async () => {
      throw new Error("no se usa");
    },
    advise: async () => "",
    proposeScript: async (r) => {
      requests.push(r);
      return answers[Math.min(requests.length - 1, answers.length - 1)];
    },
  };
  return { ai, requests };
}

const proposal = (characterIds: string[]): AiScriptProposal => ({
  name: "Prueba",
  description: "Un pueblo inquieto.",
  characterIds,
  explanation: "Porque sí.",
});

describe("crear guion con IA", () => {
  it("acepta un guion clásico que cuadra a la primera", async () => {
    // Trouble Brewing tiene 13/4/4/1: le faltan 3 Demonios para ser «clásico» con 4.
    const demons = catalog.all().filter((c) => c.team === "demon" && c.id !== "imp").slice(0, 3).map((c) => c.id);
    const { ai, requests } = fakeAi([proposal([...tbBag, ...demons])]);
    const result = await new GenerateAiScript(catalog, ai).execute({ idea: "algo clásico", size: "classic" });
    expect(result.warnings).toEqual([]);
    expect(result.characterIds).toHaveLength(25);
    expect(requests).toHaveLength(1);
    expect(requests[0].target).toEqual(SCRIPT_TARGETS.classic);
    expect(requests[0].characters.some((c) => c.team === "traveller")).toBe(false);
  });

  it("reintenta con los errores y quita personajes inventados o repetidos", async () => {
    const bad = proposal([...tbBag, "inventado", "imp"]);
    const demons = catalog.all().filter((c) => c.team === "demon" && c.id !== "imp").slice(0, 3).map((c) => c.id);
    const { ai, requests } = fakeAi([bad, proposal([...tbBag, ...demons])]);
    const result = await new GenerateAiScript(catalog, ai).execute({ idea: "x", size: "classic" });
    expect(requests).toHaveLength(2);
    expect(requests[1].previousErrors?.join(" ")).toMatch(/inventado/);
    expect(result.warnings).toEqual([]);
  });

  it("si sigue sin cuadrar, devuelve la propuesta con avisos para retocarla", async () => {
    const { ai } = fakeAi([proposal(tbBag)]);
    const result = await new GenerateAiScript(catalog, ai).execute({ idea: "x", size: "classic" });
    expect(result.characterIds).toHaveLength(22);
    expect(result.warnings.join(" ")).toMatch(/Demonios/);
  });
});
