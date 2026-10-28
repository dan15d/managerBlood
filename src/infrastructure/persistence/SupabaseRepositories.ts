import type { GameRepository, GameSummary } from "@application/ports/GameRepository";
import type { CustomScriptRepository } from "@application/ports/ScriptRepository";
import { summarize } from "@application/use-cases/GameUseCases";
import type { Game } from "@domain/entities/Game";
import type { Script } from "@domain/entities/Script";
import type { SupabaseClient } from "@supabase/supabase-js";

// Persistencia en Supabase (plan gratuito). Cada dispositivo entra con una sesión anónima y las
// políticas RLS (supabase/migrations) dejan las partidas y guiones solo a los Narradores.
// La partida se guarda entera como JSON (es un agregado); las columnas sueltas sirven para
// listar sin descargar el Grimorio.

const signingIn = new WeakMap<SupabaseClient, Promise<string>>();

/** Id de la sesión anónima de este navegador (la crea la primera vez, una sola aunque se pida a la vez). */
export async function ownerId(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  if (data.session) return data.session.user.id;
  let pending = signingIn.get(client);
  if (!pending) {
    pending = (async () => {
      const { data: signed, error } = await client.auth.signInAnonymously();
      if (error || !signed.user) {
        throw new Error("No he podido conectar con Supabase. Revisa que el inicio de sesión anónimo esté activado.");
      }
      return signed.user.id;
    })().finally(() => signingIn.delete(client));
    signingIn.set(client, pending);
  }
  return pending;
}

export const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`Supabase: no he podido ${what} (${error.message}).`);
};

export class SupabaseGameRepository implements GameRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<GameSummary[]> {
    await ownerId(this.client);
    const { data, error } = await this.client
      .from("games")
      .select("id, name, script_name, player_count, phase_label, status, updated_at");
    fail("leer las partidas", error);
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      scriptName: r.script_name,
      playerCount: r.player_count,
      phaseLabel: r.phase_label,
      status: r.status,
      updatedAt: r.updated_at,
    }));
  }

  async get(id: string): Promise<Game | null> {
    await ownerId(this.client);
    const { data, error } = await this.client.from("games").select("data").eq("id", id).maybeSingle();
    fail("leer la partida", error);
    return (data?.data as Game) ?? null;
  }

  async save(game: Game) {
    const owner = await ownerId(this.client);
    const s = summarize(game);
    const { error } = await this.client.from("games").upsert({
      id: game.id,
      owner_id: owner,
      name: s.name,
      script_name: s.scriptName,
      player_count: s.playerCount,
      phase_label: s.phaseLabel,
      status: s.status,
      join_code: game.joinCode,
      data: game,
      updated_at: game.updatedAt,
    });
    fail("guardar la partida", error);
  }

  async delete(id: string) {
    await ownerId(this.client);
    const { error } = await this.client.from("games").delete().eq("id", id);
    fail("borrar la partida", error);
  }
}

export class SupabaseScriptRepository implements CustomScriptRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<Script[]> {
    await ownerId(this.client);
    const { data, error } = await this.client.from("scripts").select("id, name, author, description, image, character_ids");
    fail("leer los guiones", error);
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      author: r.author ?? "",
      description: r.description ?? undefined,
      image: r.image ?? undefined,
      characterIds: r.character_ids ?? [],
      official: false,
    }));
  }

  async save(script: Script) {
    const owner = await ownerId(this.client);
    const { error } = await this.client.from("scripts").upsert({
      id: script.id,
      owner_id: owner,
      name: script.name,
      author: script.author,
      description: script.description ?? null,
      image: script.image ?? null,
      character_ids: script.characterIds,
      updated_at: new Date().toISOString(),
    });
    fail("guardar el guion", error);
  }

  async delete(id: string) {
    await ownerId(this.client);
    const { error } = await this.client.from("scripts").delete().eq("id", id);
    fail("borrar el guion", error);
  }
}
