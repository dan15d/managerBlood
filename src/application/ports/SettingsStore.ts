export interface AppSettings {
  /** Clave de DeepSeek guardada solo en este navegador (si no hay función en la nube). */
  deepseekKey: string;
  aiModel: string;
  /** "cloud" usa la Edge Function de Supabase; "browser" llama a DeepSeek con la clave local. */
  aiTransport: "cloud" | "browser";
}

export interface SettingsStore {
  load(): AppSettings;
  save(settings: AppSettings): void;
}
