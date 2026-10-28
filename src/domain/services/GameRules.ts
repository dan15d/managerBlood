import type { Alignment, Character } from "../entities/Character";
import type { Game, Nomination, Phase, Player, ReminderToken } from "../entities/Game";
import { RuleViolation } from "../errors";

// Reglas del Grimorio: funciones puras que devuelven una partida nueva. No guardan nada
// ni conocen la interfaz; los casos de uso se encargan de persistir el resultado.

export const phaseLabel = (phase: Phase) => `${phase.kind === "night" ? "Noche" : "Día"} ${phase.number}`;

const touch = (game: Game, text?: string): Game => {
  const now = new Date().toISOString();
  return {
    ...game,
    updatedAt: now,
    log: text ? [...game.log, { at: now, phase: phaseLabel(game.phase), text }] : game.log,
  };
};

const updatePlayer = (game: Game, playerId: string, change: (p: Player) => Player): Game => {
  if (!game.players.some((p) => p.id === playerId)) throw new RuleViolation("Ese jugador no está en la partida.");
  return { ...game, players: game.players.map((p) => (p.id === playerId ? change(p) : p)) };
};

export const findPlayer = (game: Game, playerId: string) => game.players.find((p) => p.id === playerId);

export const alivePlayers = (game: Game) => game.players.filter((p) => p.alive);

// ---------- Vida y muerte ----------

export function killPlayer(game: Game, playerId: string, cause = "ha muerto"): Game {
  const player = findPlayer(game, playerId);
  if (!player?.alive) return game;
  return touch(updatePlayer(game, playerId, (p) => ({ ...p, alive: false })), `${player.name} ${cause}.`);
}

export function revivePlayer(game: Game, playerId: string): Game {
  const player = findPlayer(game, playerId);
  if (!player || player.alive) return game;
  return touch(updatePlayer(game, playerId, (p) => ({ ...p, alive: true, ghostVoteUsed: false })), `${player.name} vuelve a la vida.`);
}

export function setCharacter(game: Game, playerId: string, character: Character, keepAlignment = false): Game {
  const player = findPlayer(game, playerId);
  if (!player) throw new RuleViolation("Ese jugador no está en la partida.");
  const alignment: Alignment = keepAlignment
    ? player.alignment
    : character.team === "minion" || character.team === "demon"
      ? "evil"
      : "good";
  return touch(
    updatePlayer(game, playerId, (p) => ({ ...p, characterId: character.id, shownCharacterId: undefined, alignment })),
    `${player.name} pasa a ser ${character.name}.`,
  );
}

export const setAlignment = (game: Game, playerId: string, alignment: Alignment): Game =>
  touch(updatePlayer(game, playerId, (p) => ({ ...p, alignment })));

export const renamePlayer = (game: Game, playerId: string, name: string): Game =>
  touch(updatePlayer(game, playerId, (p) => ({ ...p, name: name.trim() || p.name })));

/** Qué personaje cree ser quien no sabe el suyo (Borracho, Lunático, Marioneta). */
export function setShownCharacter(game: Game, playerId: string, shown: Character | undefined): Game {
  const player = findPlayer(game, playerId);
  if (!player) throw new RuleViolation("Ese jugador no está en la partida.");
  return touch(
    updatePlayer(game, playerId, (p) => ({ ...p, shownCharacterId: shown?.id })),
    shown ? `${player.name} cree ser ${shown.name}.` : undefined,
  );
}

export const setGhostVoteUsed = (game: Game, playerId: string, used: boolean): Game =>
  touch(updatePlayer(game, playerId, (p) => ({ ...p, ghostVoteUsed: used })));

export const setNotes = (game: Game, playerId: string, notes: string): Game =>
  touch(updatePlayer(game, playerId, (p) => ({ ...p, notes })));

// ---------- Recordatorios ----------

export const addReminder = (game: Game, playerId: string, reminder: ReminderToken): Game =>
  touch(updatePlayer(game, playerId, (p) => ({ ...p, reminders: [...p.reminders, reminder] })));

export const removeReminder = (game: Game, playerId: string, reminderId: string): Game =>
  touch(updatePlayer(game, playerId, (p) => ({ ...p, reminders: p.reminders.filter((r) => r.id !== reminderId) })));

/** Cambia el sitio de dos jugadores (por si se sientan distinto a como se apuntaron). */
export function swapSeats(game: Game, a: string, b: string): Game {
  const pa = findPlayer(game, a);
  const pb = findPlayer(game, b);
  if (!pa || !pb) throw new RuleViolation("Ese jugador no está en la partida.");
  const players = game.players
    .map((p) => (p.id === a ? { ...p, seat: pb.seat } : p.id === b ? { ...p, seat: pa.seat } : p))
    .sort((x, y) => x.seat - y.seat);
  return touch({ ...game, players });
}

// ---------- Fases ----------

export function startDay(game: Game): Game {
  if (game.phase.kind !== "night") throw new RuleViolation("Ya es de día.");
  const next = { ...game, phase: { kind: "day", number: game.phase.number } as Phase, nominations: [], executedToday: undefined };
  return touch(next, "Amanece.");
}

export function startNight(game: Game): Game {
  if (game.phase.kind !== "day") throw new RuleViolation("Ya es de noche.");
  const next = { ...game, phase: { kind: "night", number: game.phase.number + 1 } as Phase, nightStep: 0 };
  return touch(next, "Cae la noche.");
}

export const setNightStep = (game: Game, step: number): Game => ({ ...game, nightStep: Math.max(0, step) });

export const setBluffs = (game: Game, bluffs: string[]): Game => touch({ ...game, demonBluffs: bluffs.slice(0, 3) });

// ---------- Nominaciones y votos ----------

/** Votos necesarios: la mitad de los vivos, redondeando hacia arriba. */
export const voteThreshold = (game: Game) => Math.ceil(alivePlayers(game).length / 2);

export function canNominate(game: Game, nominatorId: string, nomineeId: string): string | null {
  if (game.phase.kind !== "day") return "Solo se nomina de día.";
  if (game.executedToday) return "Ya ha habido una ejecución hoy.";
  if (game.nominations.some((n) => !n.closed)) return "Primero hay que cerrar la votación en curso.";
  const nominator = findPlayer(game, nominatorId);
  if (!nominator?.alive) return "Solo los jugadores vivos pueden nominar.";
  if (game.nominations.some((n) => n.nominatorId === nominatorId)) return `${nominator.name} ya ha nominado hoy.`;
  if (game.nominations.some((n) => n.nomineeId === nomineeId)) return "Ese jugador ya ha sido nominado hoy.";
  return null;
}

export function nominate(game: Game, nominatorId: string, nomineeId: string, id: string): Game {
  const problem = canNominate(game, nominatorId, nomineeId);
  if (problem) throw new RuleViolation(problem);
  const nomination: Nomination = { id, nominatorId, nomineeId, voterIds: [], closed: false };
  const names = [findPlayer(game, nominatorId)!.name, findPlayer(game, nomineeId)!.name];
  return touch({ ...game, nominations: [...game.nominations, nomination] }, `${names[0]} nomina a ${names[1]}.`);
}

/** Un muerto solo puede votar si le queda su voto fantasma. */
export function canVote(player: Player) {
  return player.alive || !player.ghostVoteUsed;
}

export function toggleVote(game: Game, nominationId: string, voterId: string): Game {
  const nomination = game.nominations.find((n) => n.id === nominationId);
  if (!nomination || nomination.closed) throw new RuleViolation("Esa votación ya está cerrada.");
  const voter = findPlayer(game, voterId);
  if (!voter) throw new RuleViolation("Ese jugador no está en la partida.");
  const voting = nomination.voterIds.includes(voterId);
  if (!voting && !canVote(voter)) throw new RuleViolation(`${voter.name} está muerto y ya gastó su voto.`);
  const voterIds = voting ? nomination.voterIds.filter((v) => v !== voterId) : [...nomination.voterIds, voterId];
  return { ...game, nominations: game.nominations.map((n) => (n.id === nominationId ? { ...n, voterIds } : n)) };
}

/** Cierra la votación: los muertos que han votado gastan su voto. */
export function closeNomination(game: Game, nominationId: string): Game {
  const nomination = game.nominations.find((n) => n.id === nominationId);
  if (!nomination || nomination.closed) return game;
  const players = game.players.map((p) =>
    !p.alive && nomination.voterIds.includes(p.id) ? { ...p, ghostVoteUsed: true } : p,
  );
  const nominee = findPlayer(game, nomination.nomineeId)!;
  return touch(
    {
      ...game,
      players,
      nominations: game.nominations.map((n) => (n.id === nominationId ? { ...n, closed: true } : n)),
    },
    `${nominee.name} recibe ${nomination.voterIds.length} votos.`,
  );
}

/**
 * Quién está «a punto de morir»: el nominado con más votos si llega al umbral.
 * Si empata con otro, no se ejecuta a nadie.
 */
export function onTheBlock(game: Game): { playerId: string; votes: number } | null {
  const closed = game.nominations.filter((n) => n.closed);
  const threshold = voteThreshold(game);
  let best: { playerId: string; votes: number } | null = null;
  let tied = false;
  for (const n of closed) {
    const votes = n.voterIds.length;
    if (votes < threshold) continue;
    if (!best || votes > best.votes) {
      best = { playerId: n.nomineeId, votes };
      tied = false;
    } else if (votes === best.votes) {
      tied = true;
    }
  }
  return tied ? null : best;
}

export function execute(game: Game, playerId: string): Game {
  if (game.phase.kind !== "day") throw new RuleViolation("Solo se ejecuta de día.");
  if (game.executedToday) throw new RuleViolation("Solo hay una ejecución al día.");
  const player = findPlayer(game, playerId);
  if (!player) throw new RuleViolation("Ese jugador no está en la partida.");
  const after = player.alive ? killPlayer(game, playerId, "es ejecutado") : touch(game, `${player.name} es ejecutado (ya estaba muerto).`);
  return { ...after, executedToday: playerId };
}

// ---------- Fin de partida ----------

export interface VictoryHint {
  winner: Alignment;
  reason: string;
}

/**
 * Sugerencia de final según las reglas básicas. El Narrador decide: hay personajes
 * (Mujer Escarlata, Alcalde, Santo…) que cambian quién gana.
 */
export function victoryHint(game: Game, characters: Map<string, Character>): VictoryHint | null {
  if (game.status === "finished") return null;
  const demons = game.players.filter((p) => characters.get(p.characterId)?.team === "demon");
  if (demons.length && demons.every((d) => !d.alive)) {
    return { winner: "good", reason: "El Demonio ha muerto." };
  }
  const alive = alivePlayers(game).filter((p) => characters.get(p.characterId)?.team !== "traveller");
  if (alive.length <= 2) return { winner: "evil", reason: "Solo quedan dos jugadores vivos." };
  return null;
}

export const declareWinner = (game: Game, winner: Alignment): Game =>
  touch({ ...game, status: "finished", winner }, winner === "good" ? "Gana el Bien." : "Gana el Mal.");

export const reopen = (game: Game): Game => touch({ ...game, status: "in_progress", winner: undefined }, "La partida sigue.");
