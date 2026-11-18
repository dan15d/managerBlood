import type { AiScriptProposal, AiScriptRequest, AiScriptReview, AiScriptReviewRequest, AiStoryteller } from "@application/ports/AiStoryteller";
import { GenerateAiScript, ReviewAiScript, SCRIPT_TARGETS } from "@application/use-cases/AiScriptUseCases";
import { WriteAiChronicle } from "@application/use-cases/GameUseCases";
import type { Game } from "@domain/entities/Game";
import type { ChatMessage } from "@infrastructure/ai/ChatTransport";
import { LlmStoryteller } from "@infrastructure/ai/LlmStoryteller";
import { StaticCharacterCatalog, StaticOfficialScripts } from "@infrastructure/catalog/StaticCatalog";
import { describe, expect, it } from "vitest";
import { NEW_GAME } from "./gameFixture";

const catalog = new StaticCharacterCatalog();
const tb = new StaticOfficialScripts().list().find((s) => s.id === "trouble-brewing")!;
const tbBag = tb.characterIds.filter((id) => catalog.get(id)?.team !== "traveller");

/** IA de mentira: devuelve las respuestas en orden y guarda lo que se le pidió. */
function fakeAi(answers: AiScriptProposal[], review?: AiScriptReview, chronicle = "") {
  const requests: AiScriptRequest[] = [];
  const reviews: AiScriptReviewRequest[] = [];
  const ai: AiStoryteller = {
    isAvailable: () => true,
    checkConnection: async () => undefined,
    proposeSetup: async () => {
      throw new Error("no se usa");
    },
    advise: async () => "",
    reviewScript: async (r) => {
      reviews.push(r);
      return review ?? { verdict: "", strengths: [], problems: [], swaps: [] };
    },
    chronicle: async () => chronicle,
    proposeScript: async (r) => {
      requests.push(r);
      return answers[Math.min(requests.length - 1, answers.length - 1)];
    },
  };
  return { ai, requests, reviews };
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

describe("revisar guion con IA", () => {
  const review = (swaps: AiScriptReview["swaps"]): AiScriptReview => ({
    verdict: "Un guion sólido.",
    strengths: ["Mucha información."],
    problems: ["Poca desinformación."],
    swaps,
  });

  it("manda el guion, sus jinxes y solo alternativas de fuera", async () => {
    const { ai, reviews } = fakeAi([], review([]));
    const result = await new ReviewAiScript(catalog, ai).execute({ name: " Mi guion ", characterIds: tb.characterIds });
    expect(reviews[0].name).toBe("Mi guion");
    expect(reviews[0].characters.map((c) => c.id)).toEqual(tb.characterIds);
    expect(reviews[0].alternatives.some((c) => tb.characterIds.includes(c.id))).toBe(false);
    expect(reviews[0].alternatives.some((c) => c.team === "traveller" || c.team === "fabled")).toBe(false);
    expect(result.reviewedIds).toEqual(tb.characterIds);
    expect(result.verdict).toBe("Un guion sólido.");
  });

  it("descarta los cambios que no se pueden aplicar", async () => {
    const outside = catalog.all().filter((c) => c.team === "townsfolk" && !tb.characterIds.includes(c.id));
    const good = { removeId: "washerwoman", addId: outside[0].id, reason: "Más variedad." };
    const { ai } = fakeAi(
      [],
      review([
        good,
        { removeId: "inventado", addId: outside[1].id, reason: "No está en el guion." },
        { removeId: "chef", addId: "imp", reason: "Ya está en el guion." },
        { removeId: "empath", addId: "nadie", reason: "No existe." },
        { removeId: "washerwoman", addId: outside[2].id, reason: "Repite al que sale." },
        { removeId: "monk", addId: outside[0].id, reason: "Repite al que entra." },
      ]),
    );
    const result = await new ReviewAiScript(catalog, ai).execute({ name: "x", characterIds: tb.characterIds });
    expect(result.swaps).toEqual([good]);
  });

  it("no revisa un guion casi vacío ni acepta una revisión en blanco", async () => {
    const { ai, reviews } = fakeAi([]);
    await expect(new ReviewAiScript(catalog, ai).execute({ name: "x", characterIds: ["imp", "chef"] })).rejects.toThrow(/Añade más personajes/);
    expect(reviews).toHaveLength(0);
    await expect(new ReviewAiScript(catalog, ai).execute({ name: "x", characterIds: tb.characterIds })).rejects.toThrow(/no ha sabido/);
  });
});

const finishedGame = (extra: Partial<Game> = {}): Game => ({
  ...NEW_GAME,
  id: "g",
  name: "Prueba",
  mode: "manual",
  scriptId: "trouble-brewing",
  scriptName: "Trouble Brewing",
  players: ["imp", "poisoner", "chef", "empath", "monk"].map((characterId, seat) => ({
    id: `p${seat}`,
    seat,
    name: `J${seat + 1}`,
    characterId,
    alignment: seat < 2 ? "evil" : "good",
    alive: seat !== 0,
    ghostVoteUsed: false,
    reminders: [],
  })),
  demonBluffs: ["soldier"],
  phase: { kind: "day", number: 3 },
  nightStep: 0,
  nominations: [],
  status: "finished",
  winner: "good",
  log: [{ at: "", phase: "Día 3", text: "Ejecutan a J1." }],
  joinCode: "",
  createdAt: "",
  updatedAt: "",
  ...extra,
});

/** Transporte de mentira: guarda lo que se le manda y responde siempre lo mismo. */
function fakeTransport(answer: string) {
  const calls: ChatMessage[][] = [];
  return { calls, transport: { complete: async (messages: ChatMessage[]) => (calls.push(messages), answer) } };
}

describe("crónica de la partida", () => {
  it("solo se escribe con la partida terminada", async () => {
    const { ai } = fakeAi([], undefined, "  Titular\nLo que pasó.  ");
    const write = new WriteAiChronicle(ai, catalog);
    await expect(write.execute(finishedGame({ status: "in_progress", winner: undefined }))).rejects.toThrow(/cuando termina/);
    expect(await write.execute(finishedGame())).toBe("Titular\nLo que pasó.");
  });

  it("cuenta quién era quién, el resultado y el registro", async () => {
    const { calls, transport } = fakeTransport("Titular\nTexto.");
    await new LlmStoryteller(transport).chronicle({ game: finishedGame(), characters: catalog.map() });
    const prompt = calls[0][1].content;
    expect(prompt).toMatch(/ganó el Bien/);
    expect(prompt).toContain(`J1: ${catalog.get("imp")!.name}`);
    expect(prompt).toContain("[Día 3] Ejecutan a J1.");
  });
});

describe("consejero con memoria", () => {
  it("recuerda la conversación en orden y solo manda el Grimorio de ahora", async () => {
    const { calls, transport } = fakeTransport("Respuesta");
    await new LlmStoryteller(transport).advise({
      game: finishedGame(),
      characters: catalog.map(),
      jinxes: [],
      interactions: [],
      question: "¿Y si protege a otro?",
      history: [
        { question: "¿A quién protege el Monje?", answer: "A J4." },
        { question: "¿Por qué?", answer: "Porque es la Empática." },
      ],
    });
    const messages = calls[0];
    expect(messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user", "assistant", "user"]);
    expect(messages[1].content).toBe("Pregunta del Narrador: ¿A quién protege el Monje?");
    expect(messages[4].content).toBe("Porque es la Empática.");
    expect(messages.filter((m) => m.content.includes("Grimorio (en orden de asiento"))).toHaveLength(1);
    expect(messages[5].content).toMatch(/Grimorio[\s\S]*¿Y si protege a otro\?$/);
  });

  it("de una conversación larga solo manda los últimos turnos", async () => {
    const { calls, transport } = fakeTransport("Respuesta");
    const history = Array.from({ length: 10 }, (_, i) => ({ question: `P${i}`, answer: `R${i}` }));
    await new LlmStoryteller(transport).advise({ game: finishedGame(), characters: catalog.map(), jinxes: [], interactions: [], question: "Última", history });
    expect(calls[0]).toHaveLength(1 + 6 * 2 + 1);
    expect(calls[0][1].content).toBe("Pregunta del Narrador: P4");
  });
});
