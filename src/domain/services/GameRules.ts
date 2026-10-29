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

/**
 * Pone un recordatorio como en el Grimorio físico: cada personaje tiene un número de fichas de
 * cada recordatorio. Si ya están todas puestas, se mueve la primera (el Envenenador cambia de víctima).
 */
export function placeReminder(game: Game, playerId: string, reminder: ReminderToken, copies: number): Game {
  const same = (r: ReminderToken) => r.sourceCharacterId === reminder.sourceCharacterId && r.label === reminder.label;
  const placed = game.players.flatMap((p) => p.reminders.filter(same).map((r) => ({ playerId: p.id, id: r.id })));
  const moved = copies > 0 && placed.length >= copies ? placed[0] : undefined;
  const without = moved ? removeReminder(game, moved.playerId, moved.id) : game;
  return addReminder(without, playerId, reminder);
}

export const removeReminder = (game: Game, playerId: string, reminderId: string): Game =>
  touch(updatePlayer(game, playerId, (p) => ({ ...p, reminders: p.reminders.filter((r) => r.id !== reminderId) })));

/**
 * Recordatorios que solo valen una noche y el día siguiente: protecciones, envenenamientos del
 * Envenenador, muertes de esta noche… Al anochecer se proponen para quitarlos.
 * Clave: personaje que lo pone + etiqueta («custom» para los genéricos).
 */
export const DUSK_REMINDERS = new Set([
  "poisoner:Envenenado",
  "monk:A salvo",
  "innkeeper:A salvo",
  "innkeeper:Borracho",
  "sailor:Borracho",
  "undertaker:Muerto hoy",
  "exorcist:Elegido",
  "devilsadvocate:Sobrevive ejecución",
  "witch:Maldito",
  "cerenovus:Loco",
  "harpy:Loco",
  "harpy:Segundo jugador",
  "lunatic:Elegido",
  "minstrel:Todos están borrachos",
  "princess:No mata",
  "acrobat:Elegido",
  "flowergirl:Demonio ha votado",
  "flowergirl:Demonio no ha votado",
  "towncrier:Esbirro ha nominado",
  "towncrier:Esbirro no ha nominado",
  "zombuul:Muere hoy",
  "godfather:Muere hoy",
  "shabaloth:Vivo",
  "legion:A punto de morir",
  "organgrinder:A punto de morir",
  "custom:Protegido",
  "custom:Muerto esta noche",
]);

/** Las muertes de una noche («Muerto» de cualquier Demonio o personaje que mata) también caducan. */
const isDuskReminder = (r: ReminderToken) => DUSK_REMINDERS.has(`${r.sourceCharacterId}:${r.label}`) || r.label === "Muerto";

export const expiringReminders = (game: Game) =>
  game.players.flatMap((p) => p.reminders.filter(isDuskReminder).map((reminder) => ({ playerId: p.id, reminder })));

/** Quita varios recordatorios de una vez (los que caducan al anochecer). */
export function removeReminders(game: Game, reminderIds: string[]): Game {
  if (!reminderIds.length) return game;
  const ids = new Set(reminderIds);
  return touch(
    { ...game, players: game.players.map((p) => ({ ...p, reminders: p.reminders.filter((r) => !ids.has(r.id)) })) },
    `Se quitan ${ids.size} recordatorios que ya no valen.`,
  );
}

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

/** El Narrador pone o quita una Fábula o un Lórico (y lo anuncia a la mesa). */
export function toggleFabled(game: Game, character: Character): Game {
  if (character.team !== "fabled" && character.team !== "loric") throw new RuleViolation(`${character.name} no es una Fábula ni un Lórico.`);
  const current = game.fabledIds ?? [];
  const on = current.includes(character.id);
  return touch(
    { ...game, fabledIds: on ? current.filter((id) => id !== character.id) : [...current, character.id] },
    `${character.name} ${on ? "sale de" : "entra en"} juego.`,
  );
}

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

/** Quién pasa a ser el Demonio cuando muere: la Mujer escarlata o un Esbirro (pase del Diablillo). */
export interface DemonSuccession {
  /** El Demonio que ha muerto: el heredero pasa a ser ese mismo personaje. */
  demon: Player;
  /** Uno solo si es obligatorio (la Mujer escarlata); varios si el Narrador elige. */
  heirs: Player[];
  reason: string;
  /** Algo que puede impedirlo (la Mujer escarlata está envenenada o borracha). */
  caveat?: string;
}

const DISABLED_REMINDER = /envenen|borrach|sin habilidad/i;

/**
 * Si el Demonio ha muerto pero la partida sigue porque otro jugador pasa a serlo:
 * - Mujer escarlata viva y 5 o más jugadores vivos justo antes de morir el Demonio (4 o más
 *   después; los Viajeros no cuentan): se convierte en ese Demonio, de día o de noche.
 * - Si no, el Diablillo muerto de noche (se ha matado a sí mismo): un Esbirro vivo, a elegir.
 */
export function demonSuccession(game: Game, characters: Map<string, Character>): DemonSuccession | null {
  if (game.status === "finished") return null;
  const team = (p: Player) => characters.get(p.characterId)?.team;
  const demons = game.players.filter((p) => team(p) === "demon");
  if (!demons.length || demons.some((d) => d.alive)) return null;
  const demon = demons[0];
  const demonName = characters.get(demon.characterId)?.name ?? "el Demonio";
  const aliveAfter = alivePlayers(game).filter((p) => team(p) !== "traveller").length;

  const scarlet = game.players.find((p) => p.characterId === "scarletwoman" && p.alive);
  if (scarlet && aliveAfter >= 4) {
    const disabled = scarlet.reminders.find((r) => DISABLED_REMINDER.test(r.label));
    return {
      demon,
      heirs: [scarlet],
      reason: `Ha muerto el Demonio (${demonName}) con ${aliveAfter + 1} jugadores vivos: la Mujer escarlata se convierte en el nuevo Demonio y la partida sigue.`,
      caveat: disabled ? `La Mujer escarlata tiene «${disabled.label}»: si de verdad no tiene habilidad, ganan los buenos.` : undefined,
    };
  }

  if (demon.characterId === "imp" && game.phase.kind === "night") {
    const minions = game.players.filter((p) => p.alive && team(p) === "minion");
    if (minions.length) {
      return {
        demon,
        heirs: minions,
        reason: `Si el Demonio (${demonName}) se ha matado a sí mismo esta noche, elige un Esbirro vivo: se convierte en el nuevo Demonio. Si ha muerto por otra cosa, ganan los buenos.`,
      };
    }
  }
  return null;
}

/** El heredero pasa a ser el Demonio que ha muerto (con su habilidad y su bando). */
export function succeedDemon(game: Game, succession: DemonSuccession, heirId: string, characters: Map<string, Character>): Game {
  if (!succession.heirs.some((h) => h.id === heirId)) throw new RuleViolation("Ese jugador no puede pasar a ser el Demonio.");
  const demon = characters.get(succession.demon.characterId);
  if (!demon) throw new RuleViolation("No encuentro el personaje del Demonio.");
  return setCharacter(game, heirId, demon);
}

/**
 * Sugerencia de final según las reglas básicas. El Narrador decide: hay personajes
 * (Alcalde, Santo…) que cambian quién gana. Si hay un heredero del Demonio, la partida sigue.
 */
export function victoryHint(game: Game, characters: Map<string, Character>): VictoryHint | null {
  if (game.status === "finished") return null;
  const demons = game.players.filter((p) => characters.get(p.characterId)?.team === "demon");
  if (demons.length && demons.every((d) => !d.alive)) {
    if (demonSuccession(game, characters)) return null;
    return { winner: "good", reason: "El Demonio ha muerto." };
  }
  const alive = alivePlayers(game).filter((p) => characters.get(p.characterId)?.team !== "traveller");
  if (alive.length <= 2) return { winner: "evil", reason: "Solo quedan dos jugadores vivos." };
  return null;
}

export const declareWinner = (game: Game, winner: Alignment): Game =>
  touch({ ...game, status: "finished", winner }, winner === "good" ? "Gana el Bien." : "Gana el Mal.");

export const reopen = (game: Game): Game => touch({ ...game, status: "in_progress", winner: undefined }, "La partida sigue.");
