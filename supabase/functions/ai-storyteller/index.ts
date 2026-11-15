// Edge Function de Supabase: hace de intermediaria con la API de DeepSeek para que la clave no
// llegue nunca al navegador (la web en GitHub Pages es pública).
//
// Despliegue:
//   supabase secrets set DEEPSEEK_API_KEY=sk-...
//   supabase functions deploy ai-storyteller
//
// Supabase comprueba el JWT de la sesión antes de llegar aquí; como cualquiera que abra la web
// tiene una sesión anónima, además se pregunta a is_admin() con ese mismo JWT: solo los Narradores
// (los que han puesto la contraseña) pueden gastar saldo.

import { createClient } from "npm:@supabase/supabase-js@2";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
// Solo se permiten estos modelos para que nadie gaste saldo con otros más caros. Si llega otro
// (p. ej. el nombre antiguo de OpenRouter, guardado en algún navegador), se usa el primero.
const ALLOWED_MODELS = (Deno.env.get("DEEPSEEK_MODELS") ?? "deepseek-flash").split(",").map((m) => m.trim());

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** Si quien llama es Narrador, según la misma función is_admin() que usan las políticas RLS. */
async function isStoryteller(req: Request): Promise<boolean> {
  const authorization = req.headers.get("Authorization");
  if (!authorization) return false;
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: { message: "Método no permitido" } }, 405);

  if (!(await isStoryteller(req))) return json({ error: { message: "Solo el Narrador puede usar la IA." } }, 403);

  const key = Deno.env.get("DEEPSEEK_API_KEY");
  if (!key) return json({ error: { message: "Falta el secreto DEEPSEEK_API_KEY en Supabase." } }, 500);

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

  // Mismo cuerpo que deepseekBody en src/infrastructure/ai/ChatTransport.ts.
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: body.messages,
      temperature: typeof body.temperature === "number" ? body.temperature : 0.8,
      max_tokens: 4000,
      reasoning_effort: "low",
      ...(body.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const data = await res.json().catch(() => ({ error: { message: `DeepSeek ha respondido ${res.status}` } }));
  if (res.status === 402) return json({ error: { message: "No queda saldo en DeepSeek." } }, 402);
  return json(data, res.ok ? 200 : res.status);
});
