import type {
  AiAdviceRequest,
  AiChronicleRequest,
  AiScriptProposal,
  AiScriptRequest,
  AiScriptReview,
  AiScriptReviewRequest,
  AiSetupProposal,
  AiSetupRequest,
  AiStoryteller,
  SetupStyle,
} from "@application/ports/AiStoryteller";
import { TEAM_LABEL, type Character } from "@domain/entities/Character";
import { phaseLabel } from "@domain/services/GameRules";
import type { ChatMessage, ChatTransport } from "./ChatTransport";

/** Turnos anteriores que se le recuerdan al consejero: los últimos, para que el coste no crezca sin fin. */
const ADVICE_HISTORY_LIMIT = 6;
/** Entradas del registro que se mandan para la crónica. */
const CHRONICLE_LOG_LIMIT = 300;

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

  async reviewScript(r: AiScriptReviewRequest): Promise<AiScriptReview> {
    const line = (c: Character) => `- ${c.id} | ${c.name} | ${TEAM_LABEL[c.team].singular} | ${c.ability}`;
    const nameOf = (id: string) => r.characters.find((c) => c.id === id)?.name ?? id;
    const count = (team: Character["team"]) => r.characters.filter((c) => c.team === team).length;
    const prompt = `Revisa este guion personalizado de Blood on the Clocktower como lo haría un diseñador de guiones con experiencia.

Guion «${r.name || "Sin nombre"}»: ${count("townsfolk")} Aldeanos, ${count("outsider")} Forasteros, ${count("minion")} Esbirros, ${count("demon")} Demonios.
Un guion clásico tiene 13 / 4 / 4 / 4 y uno pequeño (5-6 jugadores) 6 / 2 / 2 / 1; si el reparto se aparta de eso, dilo.

Personajes del guion (id | nombre | tipo | habilidad):
${r.characters.map(line).join("\n")}

Incompatibilidades (jinxes) entre ellos: ${r.jinxes.map((j) => `${nameOf(j.characterIds[0])} + ${nameOf(j.characterIds[1])}: ${j.text}`).join(" | ") || "ninguna"}

Qué mirar:
- Información del Bien: si hay suficiente y de tipos distintos (primera noche, cada noche, al morir, de día), y cuánta puede falsear el Mal.
- Desinformación: fuentes de borrachera, envenenamiento o locura, y si son demasiadas o demasiado pocas para la información que hay.
- Protección y muertes extra: si el Demonio puede quedarse sin matar o si el pueblo se vacía demasiado rápido.
- Faroles: si Esbirros y Demonios tienen Aldeanos y Forasteros creíbles que fingir, y si algún personaje se confirma solo con demasiada facilidad.
- Cada Demonio y cada Esbirro: si alguno queda flojo, demasiado fuerte o sin apoyo en este guion.
- Forasteros: si molestan de verdad al Bien y si hay algo que cambie cuántos hay.
- Combinaciones concretas que rompen la partida, la alargan o son difíciles de arbitrar.

Personajes que NO están en el guion y puedes proponer a cambio (id | nombre | tipo | habilidad):
${r.alternatives.map(line).join("\n")}

Reglas de la respuesta:
- "verdict": 2-3 frases con la valoración general y para qué tipo de mesa sirve.
- "strengths": 2-4 puntos fuertes, cada uno nombrando personajes concretos.
- "problems": de 0 a 5 problemas reales, de más grave a menos, cada uno nombrando personajes concretos. No inventes problemas si el guion está bien.
- "swaps": de 0 a 4 cambios, cada uno {"removeId": id del guion, "addId": id de la lista de fuera, "reason": una frase}. Mejor del mismo tipo, salvo que quieras corregir el reparto.
Escribe los nombres de los personajes como aparecen en las listas, nunca los ids, salvo en removeId y addId.

Responde SOLO con un objeto JSON: {"verdict": "", "strengths": [], "problems": [], "swaps": [{"removeId": "", "addId": "", "reason": ""}]}`;

    const text = await this.chat.complete(
      [
        { role: "system", content: BASE_RULES },
        { role: "user", content: prompt },
      ],
      { json: true, temperature: 0.5 },
    );
    const data = parseJson(text);
    const swaps = (Array.isArray(data.swaps) ? data.swaps : [])
      .filter((s: unknown): s is Record<string, unknown> => typeof s === "object" && !!s)
      .map((s: Record<string, unknown>) => ({
        removeId: typeof s.removeId === "string" ? s.removeId : "",
        addId: typeof s.addId === "string" ? s.addId : "",
        reason: typeof s.reason === "string" ? s.reason : "",
      }));
    return {
      verdict: typeof data.verdict === "string" ? data.verdict : "",
      strengths: asStringArray(data.strengths),
      problems: asStringArray(data.problems),
      swaps,
    };
  }

  async chronicle({ game, characters }: AiChronicleRequest): Promise<string> {
    const name = (id?: string) => (id ? (characters.get(id)?.name ?? id) : "");
    const cast = game.players
      .map((p) => {
        const c = characters.get(p.characterId);
        const parts = [
          `${p.name}: ${c?.name ?? p.characterId} (${c ? TEAM_LABEL[c.team].singular : "?"}, ${p.alignment === "good" ? "Bueno" : "Malvado"})`,
          p.alive ? "acabó vivo" : "acabó muerto",
        ];
        if (p.shownCharacterId) parts.push(`creía ser ${name(p.shownCharacterId)}`);
        return parts.join(" · ");
      })
      .join("\n");
    // Con las partidas más largas basta el final del registro para no disparar el coste.
    const log = game.log
      .slice(-CHRONICLE_LOG_LIMIT)
      .map((l) => `[${l.phase}] ${l.text}`)
      .join("\n");
    const prompt = `Escribe la crónica de esta partida ya terminada, para leerla en voz alta o mandarla al grupo.

Partida «${game.name}», guion ${game.scriptName}. Resultado: ${game.winner === "good" ? "ganó el Bien" : game.winner === "evil" ? "ganó el Mal" : "sin ganador declarado"}.

Quién era quién (ya se puede contar todo, la partida ha acabado):
${cast}
Faroles del Demonio: ${game.demonBluffs.map(name).join(", ") || "ninguno"}

Registro de la partida, en orden:
${log || "(vacío)"}

Cómo escribirla:
- Primera línea: un titular corto. Después, 3 o 4 párrafos breves (unas 220 palabras en total).
- Cuenta lo que pasó de verdad, en orden, usando los nombres de los jugadores y sus personajes: las muertes, las ejecuciones, las votaciones ajustadas y el momento que decidió la partida.
- Destaca la mejor jugada y el engaño que mejor funcionó, si el registro los deja ver.
- Tono de cronista de pueblo, con algo de humor negro, sin burlarte de nadie.
- No inventes hechos que no estén en el registro. Si el registro es pobre, haz la crónica más corta.
- Texto plano, sin Markdown, sin asteriscos y sin listas.`;

    return this.chat.complete(
      [
        { role: "system", content: BASE_RULES },
        { role: "user", content: prompt },
      ],
      { temperature: 0.9 },
    );
  }

  async advise({ game, characters, jinxes, interactions, question, history = [] }: AiAdviceRequest): Promise<string> {
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
Fábulas y Lóricos en juego: ${game.fabledIds.map((id) => `${name(id)} (${characters.get(id)?.ability ?? ""})`).join("; ") || "ninguno"}
Incompatibilidades (jinxes) en juego: ${jinxes.map((j) => `${name(j.characterIds[0])} + ${name(j.characterIds[1])}: ${j.text}`).join(" | ") || "ninguna"}
Casos especiales de la wiki entre personajes en juego: ${interactions.map((j) => `${name(j.characterIds[0])} + ${name(j.characterIds[1])}: ${j.text}`).join(" | ") || "ninguno"}
Últimos sucesos:
${recent}`;

    return this.chat.complete(
      [
        {
          role: "system",
          content: `${BASE_RULES}\nResponde en pocas líneas y de forma práctica. Si propones información falsa, que sea creíble y útil para la partida.
El Narrador puede repreguntar sobre lo ya hablado: el estado de la partida que vale es siempre el del último mensaje.`,
        },
        // Lo ya hablado va sin su Grimorio de entonces: solo cuenta el de ahora, que viaja con la pregunta nueva.
        ...history.slice(-ADVICE_HISTORY_LIMIT).flatMap((turn): ChatMessage[] => [
          { role: "user", content: `Pregunta del Narrador: ${turn.question}` },
          { role: "assistant", content: turn.answer },
        ]),
        { role: "user", content: `${context}\n\nPregunta del Narrador: ${question}` },
      ],
      { temperature: 0.7 },
    );
  }
}
