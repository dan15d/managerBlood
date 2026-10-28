import type { IdGenerator } from "@application/ports/IdGenerator";
import type { AppSettings, SettingsStore } from "@application/ports/SettingsStore";

export const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "",
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "",
  aiModel: (import.meta.env.VITE_AI_MODEL as string | undefined) || "deepseek/deepseek-v4.1-flash",
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
      openRouterKey: "",
      aiModel: env.aiModel,
      aiTransport: hasSupabase() ? "cloud" : "browser",
    };
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
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
