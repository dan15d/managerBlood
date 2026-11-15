import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  json?: boolean;
  temperature?: number;
}

/** Cómo llega la conversación al modelo. Separado del narrador para poder cambiar de proveedor. */
export interface ChatTransport {
  complete(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

/**
 * Cuerpo de la petición a la API directa de DeepSeek (igual que en rolAI). De fábrica razona en
 * alto; para esto basta con razonamiento bajo, que es más rápido y gasta menos. El tope de tokens
 * cuenta también lo que razona.
 */
export const deepseekBody = (model: string, messages: ChatMessage[], options: ChatOptions = {}) => ({
  model,
  messages,
  temperature: options.temperature ?? 0.8,
  max_tokens: 4000,
  reasoning_effort: "low",
  ...(options.json ? { response_format: { type: "json_object" } } : {}),
});

const extract = (data: { choices?: { message?: { content?: string } }[]; error?: { message?: string } }) => {
  if (data.error) throw new Error(`DeepSeek: ${data.error.message ?? "error desconocido"}`);
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("La IA no ha respondido nada. Prueba otra vez.");
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
};

/** Llama a DeepSeek desde el navegador con la clave guardada en Ajustes (solo para uso personal). */
export class BrowserDeepSeekTransport implements ChatTransport {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(messages: ChatMessage[], options?: ChatOptions) {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(deepseekBody(this.model, messages, options)),
    });
    if (res.status === 401) throw new Error("DeepSeek no acepta la clave. Revísala en Ajustes.");
    if (res.status === 402) throw new Error("No queda saldo en DeepSeek.");
    if (res.status === 429) throw new Error("DeepSeek está saturado ahora mismo. Prueba en un momento.");
    if (!res.ok) throw new Error(`DeepSeek ha respondido con un error (${res.status}).`);
    return extract(await res.json());
  }
}

/**
 * Llama a la Edge Function «ai-storyteller» de Supabase, que guarda la clave de DeepSeek como
 * secreto. Es lo recomendable si la web es pública (GitHub Pages): la clave nunca llega al navegador.
 */
export class SupabaseFunctionTransport implements ChatTransport {
  constructor(
    private readonly client: SupabaseClient,
    private readonly model: string,
  ) {}

  async complete(messages: ChatMessage[], options?: ChatOptions) {
    const { data: session } = await this.client.auth.getSession();
    if (!session.session) await this.client.auth.signInAnonymously();
    const { data, error } = await this.client.functions.invoke("ai-storyteller", {
      body: { model: this.model, messages, json: !!options?.json, temperature: options?.temperature },
    });
    if (error) throw new Error(`La función de IA ha fallado: ${await functionErrorMessage(error)}`);
    return extract(data);
  }
}

/**
 * Si la función responde con error, supabase-js solo dice «non-2xx status code»: el motivo real
 * (p. ej. «Solo el Narrador puede usar la IA.») viene en el cuerpo de la respuesta.
 */
async function functionErrorMessage(error: { message: string; context?: unknown }): Promise<string> {
  const response = error.context;
  if (!(response instanceof Response)) return error.message;
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? error.message;
}
