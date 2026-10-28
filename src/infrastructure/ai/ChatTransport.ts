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

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Cuerpo de la petición a OpenRouter. Igual que en rolAI: el servidor más barato que tenga el
 * modelo completo (sin cuantizar a fp4) y razonamiento bajo, que para esto sobra.
 */
export const openRouterBody = (model: string, messages: ChatMessage[], options: ChatOptions = {}) => ({
  model,
  messages,
  temperature: options.temperature ?? 0.8,
  max_tokens: 4000,
  reasoning: { effort: "low" },
  provider: { sort: "price", quantizations: ["fp8", "bf16", "fp16", "fp32"] },
  ...(options.json ? { response_format: { type: "json_object" } } : {}),
});

const extract = (data: { choices?: { message?: { content?: string } }[]; error?: { message?: string } }) => {
  if (data.error) throw new Error(`OpenRouter: ${data.error.message ?? "error desconocido"}`);
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("La IA no ha respondido nada. Prueba otra vez.");
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
};

/** Llama a OpenRouter desde el navegador con la clave guardada en Ajustes (solo para uso personal). */
export class BrowserOpenRouterTransport implements ChatTransport {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(messages: ChatMessage[], options?: ChatOptions) {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Grimorio BotC",
      },
      body: JSON.stringify(openRouterBody(this.model, messages, options)),
    });
    if (res.status === 401) throw new Error("OpenRouter no acepta la clave. Revísala en Ajustes.");
    if (res.status === 402) throw new Error("No queda saldo en OpenRouter.");
    if (!res.ok) throw new Error(`OpenRouter ha respondido con un error (${res.status}).`);
    return extract(await res.json());
  }
}

/**
 * Llama a la Edge Function «ai-storyteller» de Supabase, que guarda la clave de OpenRouter como
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
    if (error) throw new Error(`La función de IA ha fallado: ${error.message}`);
    return extract(data);
  }
}
