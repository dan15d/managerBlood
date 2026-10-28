import { CreateGame, DeleteGame, SaveGame } from "@application/use-cases/GameUseCases";
import { ManageLobby, PlayerTable } from "@application/use-cases/TableUseCases";
import type { PlayerView } from "@domain/entities/Table";
import * as rules from "@domain/services/GameRules";
import { seededRandom } from "@domain/services/Random";
import { StaticCharacterCatalog, StaticOfficialScripts } from "@infrastructure/catalog/StaticCatalog";
import { SupabaseGameRepository } from "@infrastructure/persistence/SupabaseRepositories";
import { SupabaseLobbyGateway, SupabasePlayerGateway, SupabaseTablePublisher } from "@infrastructure/persistence/SupabaseTable";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Prueba de punta a punta contra un proyecto real de Supabase. No se ejecuta con `npm test`:
//   SUPABASE_IT_URL=... SUPABASE_IT_KEY=... SUPABASE_IT_ADMIN_SESSION=ruta/sesion.json npx vitest run table
// La sesión de Narrador es la de un usuario anónimo al que se ha dado permiso en public.admins.

const env = process.env;
const enabled = !!(env.SUPABASE_IT_URL && env.SUPABASE_IT_KEY && env.SUPABASE_IT_ADMIN_SESSION);

const client = () => createClient(env.SUPABASE_IT_URL!, env.SUPABASE_IT_KEY!, { auth: { persistSession: false } });
const ids = {
  uuid: () => randomUUID(),
  joinCode: () => Array.from({ length: 5 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join(""),
};

/** Espera a que llegue por tiempo real una vista que cumpla la condición. */
function waitFor(views: (PlayerView | null)[], test: (v: PlayerView) => boolean, ms = 15000, label = "") {
  return new Promise<PlayerView>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const hit = views.find((v): v is PlayerView => !!v && test(v));
      if (hit) return resolve(hit);
      if (Date.now() - started > ms) return reject(new Error(`No ha llegado por tiempo real: ${label} (vistas: ${JSON.stringify(views.map((v) => v && [v.status, v.characterId, v.alive]))})`));
      setTimeout(tick, 200);
    };
    tick();
  });
}

describe.skipIf(!enabled)("mesa compartida en Supabase", () => {
  it("el Narrador abre sala, los jugadores se unen y reciben su personaje al momento", { timeout: 60000 }, async () => {
    const catalog = new StaticCharacterCatalog();
    const tb = new StaticOfficialScripts().list().find((s) => s.id === "trouble-brewing")!;

    const adminClient = client();
    const session = JSON.parse(readFileSync(env.SUPABASE_IT_ADMIN_SESSION!, "utf8"));
    await adminClient.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    const publisher = new SupabaseTablePublisher(adminClient);
    const repo = new SupabaseGameRepository(adminClient);
    const lobby = new ManageLobby(new SupabaseLobbyGateway(adminClient), ids);

    const anaClient = client();
    const beaClient = client();
    const ana = new PlayerTable(new SupabasePlayerGateway(anaClient));
    const bea = new PlayerTable(new SupabasePlayerGateway(beaClient));

    const room = await lobby.open(tb);
    try {
      const anaSeat = await ana.join(room.joinCode.toLowerCase(), "Ana");
      const beaSeat = await bea.join(room.joinCode, "Bea");
      expect(anaSeat.gameId).toBe(room.gameId);
      // Volver a unirse devuelve el mismo asiento.
      expect((await ana.join(room.joinCode, "Ana")).seatId).toBe(anaSeat.seatId);

      for (const name of ["Carlos", "Dani", "Eva"]) await lobby.addSeat(room.gameId, name);
      let seats = await lobby.seats(room.gameId);
      expect(seats.map((s) => s.name)).toEqual(["Ana", "Bea", "Carlos", "Dani", "Eva"]);
      await lobby.move(room.gameId, seats, beaSeat.seatId, -1);
      seats = await lobby.seats(room.gameId);
      expect(seats.map((s) => s.name)).toEqual(["Bea", "Ana", "Carlos", "Dani", "Eva"]);

      const anaViews: (PlayerView | null)[] = [];
      const beaViews: (PlayerView | null)[] = [];
      const stopAna = ana.watch(anaSeat.gameId, anaSeat.seatId, (v) => anaViews.push(v));
      const stopBea = bea.watch(beaSeat.gameId, beaSeat.seatId, (v) => beaViews.push(v));
      expect((await ana.view(anaSeat.gameId, anaSeat.seatId))?.status).toBe("lobby");
      await waitFor(anaViews, (v) => v.status === "lobby", 15000, "sala");

      // Bea (asiento 0) es la Lavandera; Ana (asiento 1) es el Diablillo.
      const game = await new CreateGame(repo, catalog, ids, seededRandom(1), publisher).execute({
        name: "Prueba de integración",
        mode: "manual",
        script: tb,
        playerNames: seats.map((s) => s.name),
        characterIds: ["washerwoman", "imp", "chef", "empath", "poisoner"],
        bluffIds: [],
        decoys: {},
        assignment: { 0: "washerwoman", 1: "imp", 2: "chef", 3: "empath", 4: "poisoner" },
        table: { gameId: room.gameId, joinCode: room.joinCode, seats },
      });

      const anaRole = await waitFor(anaViews, (v) => v.characterId === "imp", 15000, "rol de Ana");
      expect(anaRole.alignment).toBe("evil");
      expect(anaRole.phaseLabel).toBe("Noche 1");
      await waitFor(beaViews, (v) => v.characterId === "washerwoman");

      // Seguridad: Ana solo ve su asiento, no ve el Grimorio y no puede cambiarse el personaje.
      const ownSeats = await anaClient.from("game_seats").select("id, shown_character_id");
      expect(ownSeats.data?.map((r) => r.id)).toEqual([anaSeat.seatId]);
      expect((await anaClient.from("games").select("id")).data).toEqual([]);
      await anaClient.from("game_seats").update({ shown_character_id: "washerwoman" }).eq("id", anaSeat.seatId);
      expect((await anaClient.from("game_seats").select("shown_character_id")).data?.[0].shown_character_id).toBe("imp");
      expect(await anaClient.rpc("claim_admin", { password: "no-es-la-buena" })).toMatchObject({ data: false });

      // Nadie más puede entrar cuando ya ha empezado.
      await expect(new PlayerTable(new SupabasePlayerGateway(client())).join(room.joinCode, "Tarde")).rejects.toThrow(/empezado/);

      // El Narrador mata a Bea: Ana lo ve en la lista pública; Bea, en su asiento.
      await new SaveGame(repo, publisher, catalog).execute(rules.killPlayer(game, beaSeat.seatId));
      await waitFor(anaViews, (v) => v.players.some((p) => p.name === "Bea" && !p.alive));
      await waitFor(beaViews, (v) => !v.alive);

      stopAna();
      stopBea();
      await new DeleteGame(repo, publisher).execute(game.id);
      expect(await ana.view(anaSeat.gameId, anaSeat.seatId)).toBeNull();
    } finally {
      await lobby.close(room.gameId).catch(() => undefined);
      await Promise.all([adminClient, anaClient, beaClient].map((c) => c.removeAllChannels()));
    }
  });
});
