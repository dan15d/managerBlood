import type { Alignment, Character } from "../entities/Character";
import { defaultAlignment } from "../entities/Character";
import type { Game, Player } from "../entities/Game";
import type { PublicPlayer } from "../entities/Table";
import { phaseLabel } from "./GameRules";
import { DECOYS } from "./SetupRules";
import { TOR } from "./SpecialRules";

/**
 * Lo que se enseña a cada jugador de sí mismo: el personaje que cree ser y su bando aparente.
 * El Borracho, el Lunático y la Marioneta nunca ven su personaje real: si aún no tienen uno
 * falso asignado, no se les enseña nada. Con Tor nadie sabe quién es hasta que muere, y una
 * muerte de noche no se sabe hasta el amanecer (`publiclyAlive`).
 */
export function seatSecret(
  player: Player,
  characters: Map<string, Character>,
  fabledIds: string[] = [],
  publiclyAlive = player.alive,
): { characterId?: string; alignment?: Alignment } {
  if (fabledIds.includes(TOR) && publiclyAlive) return {};
  const shown = player.shownCharacterId && characters.get(player.shownCharacterId);
  if (shown) return { characterId: shown.id, alignment: defaultAlignment(shown.team) };
  if (DECOYS[player.characterId]) return {};
  return { characterId: player.characterId, alignment: player.alignment };
}

/**
 * Vivo para la mesa: quien ha muerto esta noche sigue vivo hasta que se anuncie al amanecer, y
 * quien ha resucitado esta noche sigue muerto hasta entonces.
 */
export const publicAlive = (game: Game, player: Player) =>
  (player.alive && !(game.nightRevivals ?? []).includes(player.id)) || (game.nightDeaths ?? []).includes(player.id);

export const publicPlayers = (game: Game, characters: Map<string, Character>): PublicPlayer[] =>
  game.players.map((p) => ({
    seat: p.seat,
    name: p.name,
    alive: publicAlive(game, p),
    ghostVoteUsed: p.ghostVoteUsed,
    ...(characters.get(p.characterId)?.team === "traveller" ? { travellerId: p.characterId } : {}),
  }));

export const publicPhase = (game: Game) =>
  game.status === "finished" ? (game.winner === "good" ? "Ha ganado el Bien" : "Ha ganado el Mal") : phaseLabel(game.phase);
