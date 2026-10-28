// Edge Function de Supabase: hace de intermediaria con OpenRouter para que la clave no llegue
// nunca al navegador (la web en GitHub Pages es pública).
//
// Despliegue:
//   supabase secrets set OPENROUTER_API_KEY=sk-or-...
//   supabase functions deploy ai-storyteller
//
// Supabase comprueba el JWT de la sesión (anónima) antes de llegar aquí, así que solo la usan
// quienes abren la app.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Solo se permiten estos modelos para que nadie gaste saldo con otros más caros.
const ALLOWED_MODELS = (Deno.env.get("ALLOWED_MODELS") ?? "deepseek/deepseek-v4.1-flash").split(",").map((m) => m.trim());

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: { message: "Método no permitido" } }, 405);

  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) return json({ error: { message: "Falta el secreto OPENROUTER_API_KEY en Supabase." } }, 500);

  let body: { model?: string; messages?: unknown[]; json?: boolean; temperature?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: "Petición no válida." } }, 400);
  }
  const model = body.model && ALLOWED_MODELS.includes(body.model) ? body.model : ALLOWED_MODELS[0];
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 20) {
    return json({ error: { message: "Faltan los mensajes." } }, 400);
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Grimorio BotC" },
    body: JSON.stringify({
      model,
      messages: body.messages,
      temperature: typeof body.temperature === "number" ? body.temperature : 0.8,
      max_tokens: 4000,
      reasoning: { effort: "low" },
      provider: { sort: "price", quantizations: ["fp8", "bf16", "fp16", "fp32"] },
      ...(body.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const data = await res.json().catch(() => ({ error: { message: `OpenRouter ha respondido ${res.status}` } }));
  return json(data, res.ok ? 200 : res.status);
});
