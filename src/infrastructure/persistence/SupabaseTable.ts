import type { AdminAuth, LobbyGateway, PlayerGateway, TablePublisher, Unsubscribe } from "@application/ports/TableGateway";
import type { Character } from "@domain/entities/Character";
import type { Game } from "@domain/entities/Game";
import type { Lobby, PlayerView, PublicPlayer, Seat, TableStatus } from "@domain/entities/Table";
import { publicAlive, publicPhase, publicPlayers, seatSecret } from "@domain/services/TableView";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, ownerId } from "./SupabaseRepositories";

// La mesa compartida en Supabase: game_public (lo que sabe toda la mesa) y game_seats (lo que
// sabe cada jugador de sí mismo). Las políticas RLS impiden que un jugador lea otro asiento.

interface PublicRow {
  game_id: string;
  join_code: string;
  script_id: string;
  script_name: string;
  character_ids: string[];
  status: TableStatus;
  phase_label: string | null;
  winner: string | null;
  players: PublicPlayer[];
  fabled_ids: string[] | null;
}

interface SeatRow {
  id: string;
  game_id: string;
  seat: number;
  player_name: string;
  user_id: string | null;
  shown_character_id: string | null;
  shown_alignment: "good" | "evil" | null;
  alive: boolean;
  ghost_vote_used: boolean;
}

const toLobby = (r: PublicRow): Lobby => ({
  gameId: r.game_id,
  joinCode: r.join_code,
  scriptId: r.script_id,
  scriptName: r.script_name,
  characterIds: r.character_ids,
  status: r.status,
});

const toSeat = (r: SeatRow): Seat => ({ id: r.id, seat: r.seat, name: r.player_name, userId: r.user_id ?? undefined });

// Los mensajes de join_game/claim_admin ya están escritos para el usuario.
const rpcError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message || "Algo ha fallado.");
};

export class SupabaseAdminAuth implements AdminAuth {
  readonly required = true;

  constructor(private readonly client: SupabaseClient) {}

  async isAdmin() {
    await ownerId(this.client);
    const { data, error } = await this.client.rpc("is_admin");
    fail("comprobar el acceso", error);
    return data === true;
  }

  async login(password: string) {
    await ownerId(this.client);
    const { data, error } = await this.client.rpc("claim_admin", { password });
    rpcError(error);
    return data === true;
  }

  async logout() {
    const { error } = await this.client.rpc("leave_admin");
    fail("salir del modo Narrador", error);
  }
}

export class SupabaseLobbyGateway implements LobbyGateway {
  constructor(private readonly client: SupabaseClient) {}

  async open(input: { gameId: string; joinCode: string; scriptId: string; scriptName: string; characterIds: string[] }) {
    await ownerId(this.client);
    const row = {
      game_id: input.gameId,
      join_code: input.joinCode,
      script_id: input.scriptId,
      script_name: input.scriptName,
      character_ids: input.characterIds,
      status: "lobby",
    };
    const { data, error } = await this.client.from("game_public").insert(row).select().single();
    fail("abrir la sala", error);
    return toLobby(data as PublicRow);
  }

  async get(gameId: string) {
    await ownerId(this.client);
    const { data, error } = await this.client.from("game_public").select().eq("game_id", gameId).maybeSingle();
    fail("leer la sala", error);
    return data ? toLobby(data as PublicRow) : null;
  }

  async listOpen() {
    await ownerId(this.client);
    const { data, error } = await this.client
      .from("game_public")
      .select()
      .eq("status", "lobby")
      .order("updated_at", { ascending: false });
    fail("leer las salas", error);
    return (data as PublicRow[]).map(toLobby);
  }

  async changeScript(gameId: string, script: { id: string; name: string; characterIds: string[] }) {
    const { error } = await this.client
      .from("game_public")
      .update({ script_id: script.id, script_name: script.name, character_ids: script.characterIds, updated_at: new Date().toISOString() })
      .eq("game_id", gameId);
    fail("cambiar el guion de la sala", error);
  }

  async seats(gameId: string) {
    await ownerId(this.client);
    const { data, error } = await this.client.from("game_seats").select().eq("game_id", gameId).order("seat");
    fail("leer los asientos", error);
    return (data as SeatRow[]).map(toSeat);
  }

  watchSeats(gameId: string, onChange: (seats: Seat[]) => void): Unsubscribe {
    const refresh = () => this.seats(gameId).then(onChange, () => undefined);
    const channel = this.client
      .channel(`lobby:${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_seats", filter: `game_id=eq.${gameId}` }, refresh)
      .subscribe((status) => status === "SUBSCRIBED" && refresh());
    // La primera conexión en tiempo real puede tardar: mientras, se enseña lo que hay ya.
    void refresh();
    return () => void this.client.removeChannel(channel);
  }

  async addSeat(gameId: string, name: string) {
    const current = await this.seats(gameId);
    const { error } = await this.client
      .from("game_seats")
      .insert({ game_id: gameId, seat: current.length, player_name: name.slice(0, 30) });
    fail("añadir el jugador", error);
  }

  async removeSeat(seatId: string) {
    const { data, error } = await this.client.from("game_seats").delete().eq("id", seatId).select("game_id").single();
    fail("quitar el jugador", error);
    const gameId = (data as { game_id: string }).game_id;
    await this.reorder(gameId, (await this.seats(gameId)).map((s) => s.id));
  }

  async reorder(gameId: string, seatIds: string[]) {
    const current = await this.seats(gameId);
    const rows = seatIds.flatMap((id, seat) => {
      const s = current.find((c) => c.id === id);
      return s ? [{ id, game_id: gameId, seat, player_name: s.name, user_id: s.userId ?? null }] : [];
    });
    const { error } = await this.client.from("game_seats").upsert(rows);
    fail("ordenar los asientos", error);
  }

  async close(gameId: string) {
    const { error } = await this.client.from("game_public").delete().eq("game_id", gameId);
    fail("cerrar la sala", error);
  }
}

export class SupabaseTablePublisher implements TablePublisher {
  // Lo último publicado de cada partida: si no cambia nada que vean los jugadores, no se escribe.
  private readonly last = new Map<string, string>();

  constructor(private readonly client: SupabaseClient) {}

  async publish(game: Game, characters: Map<string, Character>) {
    const table = {
      game_id: game.id,
      join_code: game.joinCode,
      script_id: game.scriptId,
      script_name: game.scriptName,
      character_ids: game.scriptCharacterIds ?? [],
      status: game.status,
      phase_label: publicPhase(game),
      winner: game.winner ?? null,
      players: publicPlayers(game, characters),
      fabled_ids: game.fabledIds ?? [],
    };
    const seats = game.players.map((p) => {
      const secret = seatSecret(p, characters, game.fabledIds, publicAlive(game, p));
      return {
        id: p.id,
        game_id: game.id,
        seat: p.seat,
        player_name: p.name,
        user_id: p.userId ?? null,
        shown_character_id: secret.characterId ?? null,
        shown_alignment: secret.alignment ?? null,
        alive: publicAlive(game, p),
        ghost_vote_used: p.ghostVoteUsed,
      };
    });
    const signature = JSON.stringify([table, seats]);
    if (this.last.get(game.id) === signature) return;

    await ownerId(this.client);
    const pub = await this.client.from("game_public").upsert({ ...table, updated_at: new Date().toISOString() });
    fail("publicar la partida para los jugadores", pub.error);
    const res = await this.client.from("game_seats").upsert(seats);
    fail("publicar los personajes de los jugadores", res.error);
    this.last.set(game.id, signature);
  }

  async remove(gameId: string) {
    this.last.delete(gameId);
    const { error } = await this.client.from("game_public").delete().eq("game_id", gameId);
    fail("quitar la partida de la mesa", error);
  }
}

export class SupabasePlayerGateway implements PlayerGateway {
  constructor(private readonly client: SupabaseClient) {}

  async join(code: string, name: string) {
    await ownerId(this.client);
    const { data, error } = await this.client.rpc("join_game", { code, name });
    rpcError(error);
    const seatId = data as string;
    const seat = await this.client.from("game_seats").select("game_id").eq("id", seatId).single();
    fail("entrar en la partida", seat.error);
    return { gameId: (seat.data as { game_id: string }).game_id, seatId };
  }

  async mySeats() {
    const me = await ownerId(this.client);
    const { data, error } = await this.client
      .from("game_seats")
      .select("id, game_id")
      .eq("user_id", me)
      .order("joined_at", { ascending: false });
    fail("buscar tu partida", error);
    return (data as { id: string; game_id: string }[]).map((r) => ({ gameId: r.game_id, seatId: r.id }));
  }

  async view(gameId: string, seatId: string): Promise<PlayerView | null> {
    await ownerId(this.client);
    const [seatRes, tableRes] = await Promise.all([
      this.client.from("game_seats").select().eq("id", seatId).maybeSingle(),
      this.client.from("game_public").select().eq("game_id", gameId).maybeSingle(),
    ]);
    fail("leer tu asiento", seatRes.error);
    fail("leer la partida", tableRes.error);
    const seat = seatRes.data as SeatRow | null;
    const table = tableRes.data as PublicRow | null;
    if (!seat || !table) return null;
    return {
      gameId,
      seatId,
      seat: seat.seat,
      name: seat.player_name,
      scriptName: table.script_name,
      characterIds: table.character_ids,
      status: table.status,
      phaseLabel: table.phase_label ?? undefined,
      winner: (table.winner as PlayerView["winner"]) ?? undefined,
      characterId: seat.shown_character_id ?? undefined,
      alignment: seat.shown_alignment ?? undefined,
      alive: seat.alive,
      ghostVoteUsed: seat.ghost_vote_used,
      players: table.players ?? [],
      fabledIds: table.fabled_ids ?? [],
    };
  }

  watch(gameId: string, seatId: string, onChange: (view: PlayerView | null) => void): Unsubscribe {
    const refresh = () => this.view(gameId, seatId).then(onChange, () => undefined);
    const channel = this.client
      .channel(`seat:${seatId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_seats", filter: `id=eq.${seatId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_public", filter: `game_id=eq.${gameId}` }, refresh)
      .subscribe((status) => status === "SUBSCRIBED" && refresh());
    void refresh();
    // Si el móvil se bloquea, al volver se pide el estado otra vez por si se perdió algún aviso.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    const hasDocument = typeof document !== "undefined";
    if (hasDocument) document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (hasDocument) document.removeEventListener("visibilitychange", onVisible);
      void this.client.removeChannel(channel);
    };
  }

  async leave(seatId: string) {
    const { error } = await this.client.rpc("leave_game", { seat_id: seatId });
    rpcError(error);
  }
}
