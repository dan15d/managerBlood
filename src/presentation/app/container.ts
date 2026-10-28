import type { AppSettings } from "@application/ports/SettingsStore";
import { AskAiAdvice, CreateGame, DeleteGame, ListGames, LoadGame, SaveGame, TestAiConnection } from "@application/use-cases/GameUseCases";
import { DeleteCustomScript, ListScripts, ParseScriptJson, SaveCustomScript } from "@application/use-cases/ScriptUseCases";
import { CompleteManualSetup, GenerateAiSetup, SuggestRandomSetup } from "@application/use-cases/SetupUseCases";
import { AdminSession, ManageLobby, PlayerTable } from "@application/use-cases/TableUseCases";
import { GenerateAiScript } from "@application/use-cases/AiScriptUseCases";
import { BrowserOpenRouterTransport, SupabaseFunctionTransport, type ChatTransport } from "@infrastructure/ai/ChatTransport";
import { LlmStoryteller } from "@infrastructure/ai/LlmStoryteller";
import { StaticCharacterCatalog, StaticOfficialScripts } from "@infrastructure/catalog/StaticCatalog";
import { CryptoIdGenerator, env, hasSupabase, LocalSettingsStore } from "@infrastructure/config/BrowserServices";
import {
  LocalAdminAuth,
  LocalStorageGameRepository,
  LocalStorageScriptRepository,
  NoTablePublisher,
} from "@infrastructure/persistence/LocalStorageRepositories";
import { SupabaseGameRepository, SupabaseScriptRepository } from "@infrastructure/persistence/SupabaseRepositories";
import {
  SupabaseAdminAuth,
  SupabaseLobbyGateway,
  SupabasePlayerGateway,
  SupabaseTablePublisher,
} from "@infrastructure/persistence/SupabaseTable";
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
  const publisher = supabase ? new SupabaseTablePublisher(supabase) : new NoTablePublisher();

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
    generateAiScript: new GenerateAiScript(catalog, ai),
    createGame: new CreateGame(games, catalog, ids, random, publisher),
    listGames: new ListGames(games),
    loadGame: new LoadGame(games),
    saveGame: new SaveGame(games, publisher, catalog),
    deleteGame: new DeleteGame(games, publisher),
    askAi: new AskAiAdvice(ai, catalog),
    testAi: new TestAiConnection(ai),
    newId: () => ids.uuid(),
    admin: new AdminSession(supabase ? new SupabaseAdminAuth(supabase) : new LocalAdminAuth()),
    // Sala y jugadores solo existen con la nube: sin ella, la app es solo del Narrador.
    lobby: supabase ? new ManageLobby(new SupabaseLobbyGateway(supabase), ids) : null,
    player: supabase ? new PlayerTable(new SupabasePlayerGateway(supabase)) : null,
  };
}

export type Container = ReturnType<typeof buildContainer>;

export const settingsStore = new LocalSettingsStore();
export const supabaseConfigured = !!supabase;
