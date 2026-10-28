export interface AppSettings {
  /** Clave de OpenRouter guardada solo en este navegador (si no hay función en la nube). */
  openRouterKey: string;
  aiModel: string;
  /** "cloud" usa la Edge Function de Supabase; "browser" llama a OpenRouter con la clave local. */
  aiTransport: "cloud" | "browser";
}

export interface SettingsStore {
  load(): AppSettings;
  save(settings: AppSettings): void;
}
