import type {
  AiAdviceRequest,
  AiScriptProposal,
  AiScriptRequest,
  AiSetupProposal,
  AiSetupRequest,
  AiStoryteller,
  SetupStyle,
} from "@application/ports/AiStoryteller";
import { TEAM_LABEL } from "@domain/entities/Character";
import { phaseLabel } from "@domain/services/GameRules";
import type { ChatTransport } from "./ChatTransport";

const STYLE: Record<SetupStyle, string> = {
  equilibrada: "Una partida equilibrada en la que ambos equipos tengan opciones reales.",
  principiantes: "Para jugadores nuevos: personajes sencillos, mucha información clara para el Bien y Esbirros fáciles de jugar.",
  caotica: "Caótica y divertida: combinaciones que generen confusión, Borrachos/Envenenados y giros inesperados.",
  mucha_info: "Con mucha información para el equipo Bueno, para que se hable mucho desde el principio.",
  maligna: "Que favorezca un poco al Mal: personajes buenos con información frágil y Esbirros potentes.",
};

const BASE_RULES = `Eres un Narrador experto de Blood on the Clocktower y ayudas a otro Narrador en una partida presencial.
Hablas en español de España, claro y directo. Conoces las reglas oficiales: el Bien gana si muere el Demonio; el Mal gana si quedan 2 jugadores vivos;
con 7 o más jugadores, la primera noche los Esbirros conocen al Demonio y el Demonio a sus Esbirros y recibe 3 faroles (personajes buenos que no están en juego).
Los jugadores borrachos o envenenados no tienen habilidad y pueden recibir información falsa. El Narrador tiene la última palabra.`;

const parseJson = (text: string) => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("La IA no ha devuelto un JSON.");
  return JSON.parse(text.slice(start, end + 1));
};

const asStringArray = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Narrador con un modelo de lenguaje. El transporte decide si va por la nube o desde el navegador. */
export class LlmStoryteller implements AiStoryteller {
  constructor(private readonly transport: ChatTransport | null) {}

  isAvailable() {
    return !!this.transport;
  }

  private get chat() {
    if (!this.transport) throw new Error("El modo IA no está configurado. Ve a Ajustes para conectarlo.");
    return this.transport;
  }

  async checkConnection() {
    await this.chat.complete([{ role: "user", content: "Responde solo: OK" }], { temperature: 0 });
  }

  async proposeSetup(r: AiSetupRequest): Promise<AiSetupProposal> {
    const roster = r.scriptCharacters
      .map((c) => `- ${c.id} | ${c.name} | ${TEAM_LABEL[c.team].singular} | ${c.ability}`)
      .join("\n");
    const mods = Object.entries(r.setupModifiers)
      .map(([id, note]) => `- ${id}: ${note}`)
      .join("\n");
    const d = r.baseDistribution;
    const prompt = `Prepara la bolsa de personajes para una partida del guion «${r.scriptName}» con ${r.playerCount} jugadores.

Distribución base: ${d.townsfolk} Aldeanos, ${d.outsider} Forasteros, ${d.minion} Esbirros, ${d.demon} Demonio.
Personajes que cambian la distribución si los eliges (ajusta Forasteros/Esbirros quitando o añadiendo Aldeanos):
${mods || "- ninguno"}

Estilo pedido: ${STYLE[r.style]}
${r.extraInstructions ? `Indicaciones del Narrador: ${r.extraInstructions}\n` : ""}
Personajes disponibles (id | nombre | tipo | habilidad):
${roster}

Reglas de la respuesta:
- "characterIds": exactamente ${r.playerCount > 15 ? 15 : r.playerCount} ids distintos de la lista, cumpliendo la distribución (con sus ajustes).
- "bluffIds": 3 ids de Aldeanos o Forasteros que NO estén en characterIds (mejor 2 Aldeanos y 1 Forastero).
- "decoys": si eliges Borracho (drunk) o Marioneta (marionette), qué Aldeano creen ser (que no esté en juego); si eliges Lunático (lunatic), qué Demonio cree ser. Formato {"drunk": "id"}.
- "explanation": 2-4 frases explicando por qué este reparto es interesante y qué interacciones vigilar.
- "tips": 3-5 consejos concretos para el Narrador (a quién dar información falsa, qué recordar por la noche…).
${r.previousErrors?.length ? `\nTu propuesta anterior no era válida: ${r.previousErrors.join(" ")} Corrígelo.\n` : ""}
Responde SOLO con un objeto JSON: {"characterIds": [], "bluffIds": [], "decoys": {}, "explanation": "", "tips": []}`;

    const text = await this.chat.complete(
      [
        { role: "system", content: BASE_RULES },
        { role: "user", content: prompt },
      ],
      { json: true, temperature: 0.9 },
    );
    const data = parseJson(text);
    return {
      characterIds: asStringArray(data.characterIds),
      bluffIds: asStringArray(data.bluffIds),
      decoys: typeof data.decoys === "object" && data.decoys ? (data.decoys as Record<string, string>) : {},
      explanation: typeof data.explanation === "string" ? data.explanation : "",
      tips: asStringArray(data.tips),
    };
  }

  async proposeScript(r: AiScriptRequest): Promise<AiScriptProposal> {
    const edition: Record<string, string> = { tb: "TB", bmr: "BMR", snv: "S&V", exp: "Exp" };
    const roster = r.characters
      .map((c) => `- ${c.id} | ${c.name} | ${TEAM_LABEL[c.team].singular} | ${edition[c.edition] ?? c.edition} | ${c.ability}`)
      .join("\n");
    const t = r.target;
    const prompt = `Diseña un guion personalizado de Blood on the Clocktower a partir de esta idea del Narrador:
«${r.idea}»

Debe tener exactamente ${t.townsfolk} Aldeanos, ${t.outsider} Forasteros, ${t.minion} Esbirros y ${t.demon} Demonios (${t.townsfolk + t.outsider + t.minion + t.demon} personajes).
Criterios de un buen guion: suficiente información para el Bien, Esbirros y Demonios que puedan farolear con los Aldeanos del guion,
interacciones interesantes (envenenamiento, borrachera, locura…) y que el tema de la idea se note. No repitas personajes.

Personajes disponibles (id | nombre | tipo | edición | habilidad):
${roster}
${r.previousErrors?.length ? `
Tu propuesta anterior no era válida: ${r.previousErrors.join(" ")} Corrígelo.
` : ""}
Responde SOLO con un objeto JSON: {"name": "nombre evocador en español", "description": "2-3 frases de ambientación", "characterIds": ["id", ...], "explanation": "2-4 frases sobre por qué funciona y qué interacciones destacan"}`;

    const text = await this.chat.complete(
      [
        { role: "system", content: BASE_RULES },
        { role: "user", content: prompt },
      ],
      { json: true, temperature: 0.9 },
    );
    const data = parseJson(text);
    return {
      name: typeof data.name === "string" ? data.name : "",
      description: typeof data.description === "string" ? data.description : "",
      characterIds: asStringArray(data.characterIds),
      explanation: typeof data.explanation === "string" ? data.explanation : "",
    };
  }

  async advise({ game, characters, question }: AiAdviceRequest): Promise<string> {
    const name = (id?: string) => (id ? (characters.get(id)?.name ?? id) : "");
    const grimoire = game.players
      .map((p) => {
        const c = characters.get(p.characterId);
        const parts = [
          `${p.seat + 1}. ${p.name}: ${c?.name ?? p.characterId} (${c ? TEAM_LABEL[c.team].singular : "?"}, ${p.alignment === "good" ? "Bueno" : "Malvado"})`,
          p.alive ? "vivo" : `muerto${p.ghostVoteUsed ? ", sin voto" : ", con voto"}`,
        ];
        if (p.shownCharacterId) parts.push(`cree ser ${name(p.shownCharacterId)}`);
        if (p.reminders.length) parts.push(`recordatorios: ${p.reminders.map((r) => r.label).join(", ")}`);
        if (p.notes) parts.push(`notas: ${p.notes}`);
        return parts.join(" · ");
      })
      .join("\n");
    const recent = game.log
      .slice(-25)
      .map((l) => `[${l.phase}] ${l.text}`)
      .join("\n");
    const context = `Partida «${game.name}» (guion ${game.scriptName}), ${phaseLabel(game.phase)}.
Grimorio (en orden de asiento, en sentido horario):
${grimoire}
Faroles del Demonio: ${game.demonBluffs.map(name).join(", ") || "ninguno"}
Últimos sucesos:
${recent}`;

    return this.chat.complete(
      [
        {
          role: "system",
          content: `${BASE_RULES}\nResponde en pocas líneas y de forma práctica. Si propones información falsa, que sea creíble y útil para la partida.`,
        },
        { role: "user", content: `${context}\n\nPregunta del Narrador: ${question}` },
      ],
      { temperature: 0.7 },
    );
  }
}
