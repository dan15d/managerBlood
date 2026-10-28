import type { AppSettings } from "@application/ports/SettingsStore";
import { AskAiAdvice, CreateGame, DeleteGame, ListGames, LoadGame, SaveGame, TestAiConnection } from "@application/use-cases/GameUseCases";
import { DeleteCustomScript, ListScripts, ParseScriptJson, SaveCustomScript } from "@application/use-cases/ScriptUseCases";
import { CompleteManualSetup, GenerateAiSetup, SuggestRandomSetup } from "@application/use-cases/SetupUseCases";
import { BrowserOpenRouterTransport, SupabaseFunctionTransport, type ChatTransport } from "@infrastructure/ai/ChatTransport";
import { LlmStoryteller } from "@infrastructure/ai/LlmStoryteller";
import { StaticCharacterCatalog, StaticOfficialScripts } from "@infrastructure/catalog/StaticCatalog";
import { CryptoIdGenerator, env, hasSupabase, LocalSettingsStore } from "@infrastructure/config/BrowserServices";
import { LocalStorageGameRepository, LocalStorageScriptRepository } from "@infrastructure/persistence/LocalStorageRepositories";
import { SupabaseGameRepository, SupabaseScriptRepository } from "@infrastructure/persistence/SupabaseRepositories";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Raíz de composición: el único sitio que conoce las implementaciones concretas.
// Las páginas solo usan los casos de uso que se exponen aquí.

const supabase: SupabaseClient | null = hasSupabase() ? createClient(env.supabaseUrl, env.supabaseAnonKey) : null;

function transportFor(settings: AppSettings): ChatTransport | null {
  if (settings.aiTransport === "cloud" && supabase) return new SupabaseFunctionTransport(supabase, settings.aiModel);
  if (settings.openRouterKey) return new BrowserOpenRouterTransport(settings.openRouterKey, settings.aiModel);
  return null;
}

export function buildContainer(settings: AppSettings) {
  const catalog = new StaticCharacterCatalog();
  const ids = new CryptoIdGenerator();
  const random = Math.random;
  const games = supabase ? new SupabaseGameRepository(supabase) : new LocalStorageGameRepository();
  const scripts = supabase ? new SupabaseScriptRepository(supabase) : new LocalStorageScriptRepository();
  const ai = new LlmStoryteller(transportFor(settings));

  return {
    catalog,
    storage: supabase ? ("supabase" as const) : ("local" as const),
    aiAvailable: ai.isAvailable(),
    listScripts: new ListScripts(new StaticOfficialScripts(), scripts),
    saveScript: new SaveCustomScript(scripts, ids),
    deleteScript: new DeleteCustomScript(scripts),
    parseScriptJson: new ParseScriptJson(catalog),
    suggestRandomSetup: new SuggestRandomSetup(catalog, random),
    completeManualSetup: new CompleteManualSetup(catalog, random),
    generateAiSetup: new GenerateAiSetup(catalog, ai, random),
    createGame: new CreateGame(games, catalog, ids, random),
    listGames: new ListGames(games),
    loadGame: new LoadGame(games),
    saveGame: new SaveGame(games),
    deleteGame: new DeleteGame(games),
    askAi: new AskAiAdvice(ai, catalog),
    testAi: new TestAiConnection(ai),
    newId: () => ids.uuid(),
  };
}

export type Container = ReturnType<typeof buildContainer>;

export const settingsStore = new LocalSettingsStore();
export const supabaseConfigured = !!supabase;
