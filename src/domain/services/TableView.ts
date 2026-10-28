import type { Alignment, Character } from "../entities/Character";
import { defaultAlignment } from "../entities/Character";
import type { Game, Player } from "../entities/Game";
import type { PublicPlayer } from "../entities/Table";
import { phaseLabel } from "./GameRules";
import { DECOYS } from "./SetupRules";

/**
 * Lo que se enseña a cada jugador de sí mismo: el personaje que cree ser y su bando aparente.
 * El Borracho, el Lunático y la Marioneta nunca ven su personaje real: si aún no tienen uno
 * falso asignado, no se les enseña nada.
 */
export function seatSecret(
  player: Player,
  characters: Map<string, Character>,
): { characterId?: string; alignment?: Alignment } {
  const shown = player.shownCharacterId && characters.get(player.shownCharacterId);
  if (shown) return { characterId: shown.id, alignment: defaultAlignment(shown.team) };
  if (DECOYS[player.characterId]) return {};
  return { characterId: player.characterId, alignment: player.alignment };
}

export const publicPlayers = (game: Game, characters: Map<string, Character>): PublicPlayer[] =>
  game.players.map((p) => ({
    seat: p.seat,
    name: p.name,
    alive: p.alive,
    ghostVoteUsed: p.ghostVoteUsed,
    ...(characters.get(p.characterId)?.team === "traveller" ? { travellerId: p.characterId } : {}),
  }));

export const publicPhase = (game: Game) =>
  game.status === "finished" ? (game.winner === "good" ? "Ha ganado el Bien" : "Ha ganado el Mal") : phaseLabel(game.phase);
