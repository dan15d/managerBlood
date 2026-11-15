import type { IdGenerator } from "@application/ports/IdGenerator";
import type { AppSettings, SettingsStore } from "@application/ports/SettingsStore";

/**
 * Los modelos de OpenRouter llevan «proveedor/modelo» y DeepSeek directo no los entiende: puede
 * quedar alguno guardado en un navegador o en la variable VITE_AI_MODEL de GitHub.
 */
const isOpenRouterModel = (model: unknown) => typeof model !== "string" || !model || model.includes("/");
const configuredModel = import.meta.env.VITE_AI_MODEL as string | undefined;

export const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "",
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "",
  aiModel: isOpenRouterModel(configuredModel) ? "deepseek-flash" : (configuredModel as string),
};

export const hasSupabase = () => !!(env.supabaseUrl && env.supabaseAnonKey);

export class CryptoIdGenerator implements IdGenerator {
  uuid() {
    return crypto.randomUUID();
  }

  joinCode() {
    // Sin letras que se confundan al dictarlas (0/O, 1/I/L).
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  }
}

const SETTINGS_KEY = "grimorio.settings";

export class LocalSettingsStore implements SettingsStore {
  load(): AppSettings {
    const defaults: AppSettings = {
      deepseekKey: "",
      aiModel: env.aiModel,
      // La función en la nube hay que desplegarla aparte (README); hasta entonces, la clave del navegador.
      aiTransport: "browser",
    };
    try {
      // Ajustes de cuando se usaba OpenRouter: su clave no vale para DeepSeek y su modelo tampoco.
      const { openRouterKey: _old, ...saved } = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
      const settings: AppSettings = { ...defaults, ...saved };
      if (isOpenRouterModel(settings.aiModel)) settings.aiModel = env.aiModel;
      return settings;
    } catch {
      return defaults;
    }
  }

  save(settings: AppSettings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* sin almacenamiento */
    }
  }
}
