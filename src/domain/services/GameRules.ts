import type { Alignment, Character } from "../entities/Character";
import type { Game, Nomination, Phase, Player, ReminderToken } from "../entities/Game";
import { RuleViolation } from "../errors";
import { aliveNeighbours, infoChoiceAnswer, isInfoChoice } from "./NightInfo";
import {
  demonPlayers,
  has,
  healthy,
  LEVIATHAN_GOOD_EXECUTED,
  LILMONSTA_BABYSITTER,
  lleechHost,
  reallyAlive,
  reminderFrom,
  ZOMBUUL_REALLY_DEAD,
  ZOMBUUL_SEEMS_DEAD,
  zombuulSeemsDead,
} from "./Demons";

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

/** Apunta la muerte: de noche no se anuncia hasta el amanecer; de día cuenta para el Zombuul. */
const recordDeath = (game: Game, playerId: string): Game =>
  game.phase.kind === "night"
    ? { ...game, nightDeaths: [...(game.nightDeaths ?? []), playerId] }
    : { ...game, dayDeaths: [...(game.dayDeaths ?? []), playerId] };

const withReminder = (game: Game, playerId: string, source: string, label: string): Game =>
  updatePlayer(game, playerId, (p) => ({ ...p, reminders: [...p.reminders, reminderFrom(source, label, `${playerId}:${source}:${label}`)] }));

/**
 * Un jugador muere. Casos de Demonios:
 * - Zombuul: la primera vez parece muerto (para la mesa lo está) pero sigue vivo; la segunda, muere.
 * - Lleech: no muere mientras su huésped siga vivo; si muere el huésped, el Lleech muere con él.
 */
export function killPlayer(game: Game, playerId: string, cause = "ha muerto"): Game {
  const player = findPlayer(game, playerId);
  if (!player) return game;
  const zombuul = player.characterId === "zombuul";
  const seemedDead = zombuul && player.reminders.some((r) => r.sourceCharacterId === "zombuul" && r.label === ZOMBUUL_SEEMS_DEAD);
  const reallyDead = player.reminders.some((r) => r.sourceCharacterId === "zombuul" && r.label === ZOMBUUL_REALLY_DEAD);
  if (seemedDead && !reallyDead) {
    const dead = withReminder(updatePlayer(game, playerId, (p) => ({ ...p, alive: false })), playerId, "zombuul", ZOMBUUL_REALLY_DEAD);
    return touch(player.alive ? recordDeath(dead, playerId) : dead, `${player.name} ${cause}: el Zombuul muere de verdad.`);
  }
  if (!player.alive) return game;

  const host = player.characterId === "lleech" ? lleechHost(game) : undefined;
  if (host?.alive && host.id !== playerId) {
    return touch(game, `${player.name} no muere: el Lleech vive mientras su huésped (${host.name}) siga vivo.`);
  }

  let next = recordDeath(updatePlayer(game, playerId, (p) => ({ ...p, alive: false })), playerId);
  if (zombuul) {
    next = touch(withReminder(next, playerId, "zombuul", ZOMBUUL_SEEMS_DEAD), `${player.name} ${cause}… pero es el Zombuul: parece muerto y sigue vivo.`);
  } else {
    next = touch(next, `${player.name} ${cause}.`);
  }

  // Si era el huésped del Lleech, el Lleech muere con él.
  if (lleechHost(next)?.id === playerId) {
    for (const lleech of next.players.filter((p) => p.characterId === "lleech" && p.alive)) {
      next = killPlayer(next, lleech.id, "muere con su huésped");
    }
  }
  return next;
}

export function revivePlayer(game: Game, playerId: string): Game {
  const player = findPlayer(game, playerId);
  if (!player || player.alive) return game;
  const alive = updatePlayer(game, playerId, (p) => ({
    ...p,
    alive: true,
    ghostVoteUsed: false,
    reminders: p.reminders.filter((r) => r.label !== ZOMBUUL_REALLY_DEAD),
  }));
  return touch(
    { ...alive, nightDeaths: game.nightDeaths?.filter((id) => id !== playerId), dayDeaths: game.dayDeaths?.filter((id) => id !== playerId) },
    `${player.name} vuelve a la vida.`,
  );
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

/**
 * Dos jugadores intercambian personajes (con lo que cree ser cada uno). El Encantador de
 * serpientes intercambia también el bando; el Barbero, no.
 */
export function swapCharacters(game: Game, aId: string, bId: string, characters: Map<string, Character>, swapAlignment = false): Game {
  const a = findPlayer(game, aId);
  const b = findPlayer(game, bId);
  if (!a || !b) throw new RuleViolation("Ese jugador no está en la partida.");
  if (a.id === b.id) throw new RuleViolation("Elige a otro jugador.");
  const take = (p: Player, from: Player): Player => ({
    ...p,
    characterId: from.characterId,
    shownCharacterId: from.shownCharacterId,
    alignment: swapAlignment ? from.alignment : p.alignment,
  });
  const name = (p: Player) => characters.get(p.characterId)?.name ?? p.characterId;
  return touch(
    { ...game, players: game.players.map((p) => (p.id === a.id ? take(p, b) : p.id === b.id ? take(p, a) : p)) },
    `${a.name} y ${b.name} intercambian personajes${swapAlignment ? " y bandos" : ""}: ${a.name} pasa a ser ${name(b)} y ${b.name}, ${name(a)}.`,
  );
}

/**
 * El Encantador de serpientes elige a alguien: si es el Demonio (y el Encantador está en juego
 * y sano), intercambian personajes y bandos, y el antiguo Demonio queda envenenado para siempre.
 */
export function snakeCharmerChoose(game: Game, targetId: string, characters: Map<string, Character>): { game: Game; message: string } {
  const target = findPlayer(game, targetId);
  if (!target) throw new RuleViolation("Ese jugador no está en la partida.");
  const charmer = game.players.find((p) => p.characterId === "snakecharmer" && p.alive && healthy(p));
  if (!charmer) return { game, message: "El Encantador de serpientes no tiene habilidad esta noche (no está en juego, está borracho o envenenado): no hay intercambio." };
  if (characters.get(target.characterId)?.team !== "demon" || !reallyAlive(target)) {
    return { game, message: `${target.name} no es el Demonio: no pasa nada.` };
  }
  const swapped = swapCharacters(game, charmer.id, target.id, characters, true);
  return {
    game: withReminder(swapped, target.id, "snakecharmer", "Envenenado"),
    message: `${charmer.name} ha elegido al Demonio: ahora ${charmer.name} es el Demonio (malo) y ${target.name} el Encantador (bueno y envenenado). Despiértalos y enséñales TÚ ERES y su nuevo personaje.`,
  };
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
  "bureaucrat:3 votos",
  "thief:Voto negativo",
]);

/**
 * Las muertes de una noche («Muerto» de cualquier Demonio o personaje que mata) también caducan,
 * salvo las del Shabaloth: marcan a quién puede regurgitar la noche siguiente (y se mueven solas).
 */
const isDuskReminder = (r: ReminderToken) =>
  DUSK_REMINDERS.has(`${r.sourceCharacterId}:${r.label}`) || (r.label === "Muerto" && r.sourceCharacterId !== "shabaloth");

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

/** Amanece: se anuncian las muertes de la noche (desde ahora la mesa las ve). */
export function startDay(game: Game): Game {
  if (game.phase.kind !== "night") throw new RuleViolation("Ya es de día.");
  const died = (game.nightDeaths ?? []).map((id) => findPlayer(game, id)?.name).filter(Boolean);
  const next = {
    ...game,
    phase: { kind: "day", number: game.phase.number } as Phase,
    nominations: [],
    executedToday: undefined,
    nightDeaths: [],
    dayDeaths: [],
    butcherNominationId: undefined,
    // El «No mata» de la Princesa solo valía la noche que acaba.
    players: game.players.map((p) => ({ ...p, reminders: p.reminders.filter((r) => !(r.sourceCharacterId === "princess" && r.label === "No mata")) })),
  };
  return touch(next, died.length ? `Amanece. Han muerto esta noche: ${died.join(", ")}.` : "Amanece. Nadie ha muerto esta noche.");
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

/** La Banshee que ha muerto por el Demonio: nomina dos veces al día y vota dos veces, aunque esté muerta. */
const isBanshee = (p: Player) => p.characterId === "banshee" && has(p, "banshee", "Tiene habilidad");
/** Con el Voudon vivo solo votan él y los muertos (sin gastar su voto) y basta un voto. */
const voudonActive = (game: Game) => game.players.some((p) => p.characterId === "voudon" && p.alive && healthy(p));
/** Nominaciones para ejecutar (los exilios de Viajeros van aparte). */
const executionNominations = (game: Game) => game.nominations.filter((n) => !n.exile);

/** Votos necesarios: la mitad de los vivos, redondeando hacia arriba (con el Voudon, basta 1). */
export const voteThreshold = (game: Game) => (voudonActive(game) ? 1 : Math.ceil(alivePlayers(game).length / 2));

/** Para exiliar a un Viajero hace falta la mitad de todos los jugadores, vivos o muertos. */
export const exileThreshold = (game: Game) => Math.ceil(game.players.length / 2);

/** El Carnicero vivo y sano puede nominar una vez más después de la ejecución de hoy. */
export const butcherCanNominate = (game: Game) =>
  !!game.executedToday && !game.butcherNominationId && game.players.some((p) => p.characterId === "butcher" && p.alive && healthy(p));

export function canNominate(game: Game, nominatorId: string, nomineeId: string): string | null {
  if (game.phase.kind !== "day") return "Solo se nomina de día.";
  if (game.nominations.some((n) => !n.closed)) return "Primero hay que cerrar la votación en curso.";
  const nominator = findPlayer(game, nominatorId);
  if (!nominator) return "Ese jugador no está en la partida.";
  const butcherAgain = !!game.executedToday && nominator.characterId === "butcher" && butcherCanNominate(game);
  if (game.executedToday && !butcherAgain) return "Ya ha habido una ejecución hoy.";
  if (!nominator.alive && !isBanshee(nominator)) return "Solo los jugadores vivos pueden nominar.";
  const made = executionNominations(game).filter((n) => n.nominatorId === nominatorId).length;
  if (!butcherAgain && made >= (isBanshee(nominator) ? 2 : 1)) return `${nominator.name} ya ha nominado hoy.`;
  if (nominator.characterId === "golem" && has(nominator, "golem", "No puede nominar")) return `${nominator.name} es el Gólem y ya nominó una vez.`;
  if (nomineeId && executionNominations(game).some((n) => n.nomineeId === nomineeId)) return "Ese jugador ya ha sido nominado hoy.";
  return null;
}

/** El maldito de la Bruja (viva, sana y con más de 3 vivos) muere si nomina. */
export const witchCursed = (game: Game, nominatorId: string) => {
  const nominator = findPlayer(game, nominatorId);
  const witch = game.players.some((p) => p.characterId === "witch" && p.alive && healthy(p));
  return !!nominator && witch && has(nominator, "witch", "Maldito") && alivePlayers(game).length > 3;
};

/**
 * Nominar. La nominación se hace igual, pero:
 * - El maldito de la Bruja muere al nominar.
 * - El Gólem solo nomina una vez y, si el nominado no es el Demonio, muere.
 */
export function nominate(game: Game, nominatorId: string, nomineeId: string, id: string, characters?: Map<string, Character>): Game {
  const problem = canNominate(game, nominatorId, nomineeId);
  if (problem) throw new RuleViolation(problem);
  const nomination: Nomination = { id, nominatorId, nomineeId, voterIds: [], closed: false };
  const nominator = findPlayer(game, nominatorId)!;
  const nominee = findPlayer(game, nomineeId)!;
  // Tras la ejecución, solo el Carnicero puede nominar: se recuerda cuál es su nominación.
  const butcher = game.executedToday ? { butcherNominationId: id } : {};
  let next = touch({ ...game, ...butcher, nominations: [...game.nominations, nomination] }, `${nominator.name} nomina a ${nominee.name}.`);
  if (witchCursed(game, nominatorId)) next = killPlayer(next, nominatorId, "muere por la maldición de la Bruja");
  if (nominator.characterId === "golem") {
    next = withReminder(next, nominatorId, "golem", "No puede nominar");
    const demon = characters && characters.get(nominee.characterId)?.team === "demon";
    if (characters && healthy(nominator) && !demon) next = killPlayer(next, nomineeId, "muere por el Gólem");
  }
  return next;
}

/** Exiliar a un Viajero vivo: cualquiera puede pedirlo, una vez por Viajero y día. */
export function canExile(game: Game, travellerId: string, characters: Map<string, Character>): string | null {
  if (game.phase.kind !== "day") return "Solo se exilia de día.";
  if (game.nominations.some((n) => !n.closed)) return "Primero hay que cerrar la votación en curso.";
  const traveller = findPlayer(game, travellerId);
  if (!traveller || characters.get(traveller.characterId)?.team !== "traveller") return "Solo se puede exiliar a los Viajeros.";
  if (!traveller.alive) return `${traveller.name} ya está muerto.`;
  if (game.nominations.some((n) => n.exile && n.nomineeId === travellerId)) return `Hoy ya se ha pedido el exilio de ${traveller.name}.`;
  return null;
}

export function callExile(game: Game, travellerId: string, id: string, characters: Map<string, Character>): Game {
  const problem = canExile(game, travellerId, characters);
  if (problem) throw new RuleViolation(problem);
  const nomination: Nomination = { id, nominatorId: "", nomineeId: travellerId, voterIds: [], closed: false, exile: true };
  return touch({ ...game, nominations: [...game.nominations, nomination] }, `Se pide el exilio de ${findPlayer(game, travellerId)!.name}.`);
}

/**
 * Si un jugador puede votar: los vivos, y los muertos con su voto fantasma. En un exilio vota
 * todo el mundo; con el Voudon, solo él y los muertos; la Banshee con habilidad, siempre.
 */
export function canVote(player: Player, game?: Game, nomination?: Nomination) {
  if (nomination?.exile) return true;
  if (game && voudonActive(game)) return player.characterId === "voudon" || !player.alive;
  if (isBanshee(player)) return true;
  return player.alive || !player.ghostVoteUsed;
}

/**
 * Cuánto vale el voto de un jugador hoy: el elegido anoche por el Burócrata vota ×3, el
 * elegido por el Ladrón vota en negativo y la Banshee con habilidad vota dos veces.
 */
export function voteWeight(player: Player): number {
  if (has(player, "thief", "Voto negativo")) return -1;
  if (has(player, "bureaucrat", "3 votos")) return 3;
  if (isBanshee(player)) return 2;
  return 1;
}

/** El señor del Mayordomo (el jugador con su recordatorio «Señor»). */
const butlerMaster = (game: Game) => game.players.find((p) => has(p, "butler", "Señor"));

/**
 * El voto del Mayordomo sano no cuenta si su señor no vota en esa nominación. Devuelve el motivo,
 * o null si el voto cuenta.
 */
export function voteIgnored(game: Game, nomination: Nomination, player: Player): string | null {
  if (player.characterId !== "butler" || !healthy(player) || nomination.exile) return null;
  const master = butlerMaster(game);
  return master && !nomination.voterIds.includes(master.id) ? `${player.name} es el Mayordomo y su señor (${master.name}) no vota: su voto no cuenta.` : null;
}

/** El Fanático sano debe votar en todas las nominaciones si hay 5 o más vivos. */
export const mustVote = (game: Game, player: Player) =>
  player.characterId === "zealot" && player.alive && healthy(player) && alivePlayers(game).length >= 5;

/** Votos de una nominación, con el peso de cada voto (Burócrata, Ladrón, Banshee) y sin el Mayordomo sin su señor. */
export const voteCount = (game: Game, nomination: Nomination) =>
  nomination.voterIds.reduce((sum, id) => {
    const voter = findPlayer(game, id);
    if (!voter) return sum + 1;
    return voteIgnored(game, nomination, voter) ? sum : sum + voteWeight(voter);
  }, 0);

export function toggleVote(game: Game, nominationId: string, voterId: string): Game {
  const nomination = game.nominations.find((n) => n.id === nominationId);
  if (!nomination || nomination.closed) throw new RuleViolation("Esa votación ya está cerrada.");
  const voter = findPlayer(game, voterId);
  if (!voter) throw new RuleViolation("Ese jugador no está en la partida.");
  const voting = nomination.voterIds.includes(voterId);
  if (!voting && !canVote(voter, game, nomination)) {
    throw new RuleViolation(voudonActive(game) && voter.alive ? `Con el Voudon, ${voter.name} no puede votar.` : `${voter.name} está muerto y ya gastó su voto.`);
  }
  const voterIds = voting ? nomination.voterIds.filter((v) => v !== voterId) : [...nomination.voterIds, voterId];
  return { ...game, nominations: game.nominations.map((n) => (n.id === nominationId ? { ...n, voterIds } : n)) };
}

/**
 * Cierra la votación: los muertos que han votado gastan su voto (salvo en un exilio, con el
 * Voudon o la Banshee). Un exilio con votos suficientes mata al Viajero en el acto.
 */
export function closeNomination(game: Game, nominationId: string): Game {
  const nomination = game.nominations.find((n) => n.id === nominationId);
  if (!nomination || nomination.closed) return game;
  const freeVotes = nomination.exile || voudonActive(game);
  const players = game.players.map((p) =>
    !p.alive && !freeVotes && !isBanshee(p) && nomination.voterIds.includes(p.id) ? { ...p, ghostVoteUsed: true } : p,
  );
  const nominee = findPlayer(game, nomination.nomineeId)!;
  const votes = voteCount(game, nomination);
  let next = touch(
    {
      ...game,
      players,
      nominations: game.nominations.map((n) => (n.id === nominationId ? { ...n, closed: true } : n)),
    },
    `${nominee.name} recibe ${votes} votos${nomination.exile ? " para el exilio" : ""}.`,
  );
  if (nomination.exile) {
    next = votes >= exileThreshold(game) ? killPlayer(next, nominee.id, "es exiliado") : touch(next, `${nominee.name} no es exiliado.`);
  }
  return next;
}

/**
 * Quién está «a punto de morir»: el nominado con más votos si llega al umbral. Si empata con
 * otro, no se ejecuta a nadie (con el Voudon, sigue el primero hasta que otro le supere).
 * Tras la ejecución, solo cuenta la nominación del Carnicero.
 */
export function onTheBlock(game: Game): { playerId: string; votes: number } | null {
  const threshold = voteThreshold(game);
  if (game.executedToday) {
    // Ya hubo ejecución: solo queda la nominación del Carnicero (si la hay y aún no se ha ejecutado).
    const n = game.nominations.find((x) => x.id === game.butcherNominationId && x.closed);
    const votes = n ? voteCount(game, n) : 0;
    return n && votes >= threshold && game.executedToday !== n.nomineeId ? { playerId: n.nomineeId, votes } : null;
  }
  const keepFirst = voudonActive(game);
  let best: { playerId: string; votes: number } | null = null;
  let tied = false;
  for (const n of executionNominations(game).filter((x) => x.closed)) {
    const votes = voteCount(game, n);
    if (votes < threshold) continue;
    if (!best || votes > best.votes) {
      best = { playerId: n.nomineeId, votes };
      tied = false;
    } else if (votes === best.votes && !keepFirst) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/**
 * Quien sobrevive a ser ejecutado: el elegido por el Abogado del diablo (sano), el Marinero sano,
 * el Bufón (una vez) y los vecinos buenos de la Dama del té.
 */
function survivesExecution(game: Game, player: Player): string | null {
  if (has(player, "devilsadvocate", "Sobrevive ejecución") && protectionWorks(game, "devilsadvocate")) return "el Abogado del diablo le protege";
  if (player.characterId === "sailor" && healthy(player)) return "el Marinero no puede morir";
  if (player.characterId === "fool" && healthy(player)) return "el Bufón no muere la primera vez";
  if (teaLadyProtects(game, player)) return "la Dama del té protege a sus vecinos buenos";
  return null;
}

/**
 * Ejecución. El Abogado del diablo, el Marinero y el Bufón sobreviven (pero cuenta como
 * ejecución). Con `characters`, si se ejecuta al Demonio y la Mente maestra está viva, se
 * juega un día más.
 */
export function execute(game: Game, playerId: string, characters?: Map<string, Character>): Game {
  if (game.phase.kind !== "day") throw new RuleViolation("Solo se ejecuta de día.");
  const butcherNomination = game.nominations.find((n) => n.id === game.butcherNominationId);
  const butcherExecution = !!game.executedToday && butcherNomination?.nomineeId === playerId && game.executedToday !== playerId;
  if (game.executedToday && !butcherExecution) throw new RuleViolation("Solo hay una ejecución al día.");
  const player = findPlayer(game, playerId);
  if (!player) throw new RuleViolation("Ese jugador no está en la partida.");

  const survives = player.alive ? survivesExecution(game, player) : null;
  let after: Game;
  if (survives) {
    after = touch(game, `${player.name} es ejecutado, pero sigue vivo (${survives}).`);
    if (player.characterId === "fool") after = withReminder(after, playerId, "fool", "Sin habilidad");
  } else {
    // El Zombuul que solo parecía muerto sí muere al ser ejecutado.
    after =
      player.alive || zombuulSeemsDead(player) ? killPlayer(game, playerId, "es ejecutado") : touch(game, `${player.name} es ejecutado (ya estaba muerto).`);
  }
  // El Leviatán cuenta los buenos ejecutados: con el segundo, gana el Mal.
  const leviathan = after.players.some((p) => p.characterId === "leviathan" && reallyAlive(p));
  if (leviathan && player.alignment === "good") after = withReminder(after, playerId, "leviathan", LEVIATHAN_GOOD_EXECUTED);
  // Princesa: si en su primer día nomina y se ejecuta a ese jugador, el Demonio no mata esta noche.
  const princessNomination = game.nominations.find((n) => !n.exile && n.nomineeId === playerId && findPlayer(game, n.nominatorId)?.characterId === "princess");
  const princess = princessNomination && findPlayer(game, princessNomination.nominatorId);
  if (princess && healthy(princess) && game.phase.number === 1) after = withReminder(after, princess.id, "princess", "No mata");
  // Mente maestra: el Demonio ejecutado no acaba la partida; se juega un día más.
  if (characters && !game.mastermindDay) {
    const mastermind = after.players.find((p) => p.characterId === "mastermind" && p.alive && healthy(p));
    const demons = demonPlayers(after, characters);
    if (mastermind && demons.some((d) => d.id === playerId) && !demons.some(reallyAlive) && !demonSuccession(after, characters)) {
      after = touch({ ...after, mastermindDay: game.phase.number + 1 }, "La Mente maestra sigue viva: se juega un día más (no anuncies que ha muerto el Demonio).");
    }
  }
  return { ...after, executedToday: playerId };
}

/**
 * Ejecución que no sale de una votación (la Virgen, el Juez, el Visir, la locura del
 * Cerenovus…). Si había una votación abierta, se cierra.
 */
export function executeNow(game: Game, playerId: string, reason?: string, characters?: Map<string, Character>): Game {
  const open = game.nominations.find((n) => !n.closed);
  const closed = open ? { ...game, nominations: game.nominations.map((n) => (n.id === open.id ? { ...n, closed: true } : n)) } : game;
  return execute(reason ? touch(closed, reason) : closed, playerId, characters);
}

const VIRGIN_USED = "Sin habilidad";

/**
 * La Virgen nominada por primera vez: pierde su habilidad y, si quien nomina es un Aldeano
 * (y la Virgen está sana), ese Aldeano es ejecutado en el acto. Devuelve si hay que ejecutar.
 * El Espía puede registrarse como Aldeano: eso lo decide el Narrador.
 */
export function virginNomination(
  game: Game,
  nominatorId: string,
  nomineeId: string,
  characters: Map<string, Character>,
): { game: Game; executes: boolean; spy: boolean } {
  const virgin = findPlayer(game, nomineeId);
  const nominator = findPlayer(game, nominatorId);
  if (!virgin || !nominator || virgin.characterId !== "virgin" || virgin.reminders.some((r) => r.sourceCharacterId === "virgin" && r.label === VIRGIN_USED)) {
    return { game, executes: false, spy: false };
  }
  const used = withReminder(game, nomineeId, "virgin", VIRGIN_USED);
  const healthy = !virgin.reminders.some((r) => DISABLED_REMINDER.test(r.label));
  const townsfolk = characters.get(nominator.characterId)?.team === "townsfolk";
  return { game: used, executes: healthy && townsfolk, spy: healthy && nominator.characterId === "spy" };
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
  /** El «Demonio» muerto era quien cuidaba a Lil' Monsta: el heredero pasa a cuidarlo. */
  babysitter?: boolean;
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
  const demons = demonPlayers(game, characters);
  if (!demons.length || demons.some(reallyAlive)) return null;
  const demon = demons[0];
  // Si el muerto cuidaba a Lil' Monsta, lo que se hereda es cuidarlo.
  const babysitter = team(demon) !== "demon";
  const demonName = babysitter ? "Lil' Monsta" : (characters.get(demon.characterId)?.name ?? "el Demonio");
  const aliveAfter = game.players.filter((p) => reallyAlive(p) && team(p) !== "traveller").length;

  const scarlet = game.players.find((p) => p.characterId === "scarletwoman" && p.alive);
  if (scarlet && aliveAfter >= 4) {
    const disabled = scarlet.reminders.find((r) => DISABLED_REMINDER.test(r.label));
    return {
      demon,
      heirs: [scarlet],
      reason: babysitter
        ? `Ha muerto quien cuidaba a Lil' Monsta con ${aliveAfter + 1} jugadores vivos: la Mujer escarlata cuida a Lil' Monsta el resto de la partida.`
        : `Ha muerto el Demonio (${demonName}) con ${aliveAfter + 1} jugadores vivos: la Mujer escarlata se convierte en el nuevo Demonio y la partida sigue.`,
      caveat: disabled ? `La Mujer escarlata tiene «${disabled.label}»: si de verdad no tiene habilidad, ganan los buenos.` : undefined,
      babysitter,
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

// ---------- Ataque del Demonio ----------

/** Protecciones que impiden morir por el Demonio esta noche (Monje, Posadero, Dama del té…). */
const PROTECTION = /^(a salvo|protegido|no puede morir)$/i;

/** El recordatorio «Muerto» de un Demonio: el jugador elegido muere esta noche. */
export const isDemonKill = (reminder: Pick<ReminderToken, "sourceCharacterId" | "label">, characters: Map<string, Character>) =>
  reminder.label === "Muerto" && characters.get(reminder.sourceCharacterId)?.team === "demon";

export type DemonKillOutcome = "killed" | "protected" | "selfKill" | "mayor" | "jump" | "fool" | "banshee" | "blocked" | "alreadyDead";

/**
 * Un recordatorio de protección solo vale si quien lo pone está de verdad en juego y sano: el
 * «A salvo» de un Monje que es el Borracho, o de un Monje envenenado, no protege. Los propios del
 * Narrador («custom») siempre valen.
 */
const protectionWorks = (game: Game, source: string) =>
  source === "custom" || game.players.some((p) => p.characterId === source && healthy(p));

/** Vecino vivo de una Dama del té viva y sana cuyos dos vecinos vivos son buenos. */
const teaLadyProtects = (game: Game, target: Player) =>
  game.players.some((lady) => {
    if (lady.characterId !== "tealady" || !lady.alive || !healthy(lady)) return false;
    const neighbours = aliveNeighbours(game, lady);
    return neighbours.some((n) => n.id === target.id) && neighbours.every((n) => n.alignment === "good");
  });

/**
 * No muere: Soldado o Marinero sanos, vecinos buenos de la Dama del té, o con «A salvo»,
 * «Protegido» o «No puede morir» de alguien cuya habilidad funciona.
 */
const isProtected = (game: Game, target: Player) =>
  ((target.characterId === "soldier" || target.characterId === "sailor") && healthy(target)) ||
  teaLadyProtects(game, target) ||
  target.reminders.some((r) => PROTECTION.test(r.label) && protectionWorks(game, r.sourceCharacterId));

/**
 * Por qué el Demonio no mata esta noche: el Exorcista le ha elegido o la Princesa ejecutó en su
 * primer día. Devuelve el aviso, o null si mata con normalidad.
 */
export function demonBlocked(game: Game, demonCharacterId: string): string | null {
  const exorcist = game.players.some((p) => p.characterId === "exorcist" && healthy(p));
  const chosen = game.players.some((p) => p.characterId === demonCharacterId && has(p, "exorcist", "Elegido"));
  if (exorcist && chosen) return "El Exorcista ha elegido al Demonio: esta noche no se despierta ni mata.";
  if (game.players.some((p) => has(p, "princess", "No mata"))) return "La Princesa ejecutó en su primer día: el Demonio no mata esta noche.";
  return null;
}

/** El Bufón sano que aún no ha usado su habilidad sobrevive a su primera muerte. */
const foolSurvives = (p: Player) => p.characterId === "fool" && healthy(p);

/**
 * El Demonio ataca: el jugador muere en ese momento (se anuncia al amanecer), salvo que esté
 * protegido (Soldado sano, «A salvo», «Protegido», «No puede morir»). Si el Demonio se elige a sí
 * mismo, muere y demonSuccession ofrece el heredero. Al Alcalde se le avisa: puede morir otro.
 * Fang Gu: el primer Forastero que elige se convierte en Fang Gu malo y el Fang Gu muere en su lugar.
 */
export function demonKill(
  game: Game,
  targetId: string,
  reminder: ReminderToken,
  copies: number,
  characters: Map<string, Character>,
): { game: Game; outcome: DemonKillOutcome } {
  const target = findPlayer(game, targetId);
  if (!target) throw new RuleViolation("Ese jugador no está en la partida.");
  if (!target.alive && !zombuulSeemsDead(target)) return { game: placeReminder(game, targetId, reminder, copies), outcome: "alreadyDead" };
  if (demonBlocked(game, reminder.sourceCharacterId)) return { game, outcome: "blocked" };
  if (isProtected(game, target)) return { game, outcome: "protected" };
  const demonCharacter = characters.get(reminder.sourceCharacterId);
  const demon = demonCharacter?.name ?? "el Demonio";

  if (reminder.sourceCharacterId === "fanggu" && characters.get(target.characterId)?.team === "outsider" && target.alive) {
    const jumped = game.players.some((p) => p.reminders.some((r) => r.sourceCharacterId === "fanggu" && r.label === "Primera vez"));
    const fangGu = game.players.find((p) => p.characterId === "fanggu" && p.alive);
    // Un Fang Gu protegido no salta: el Forastero muere sin más.
    if (!jumped && fangGu && !isProtected(game, fangGu) && demonCharacter) {
      let next = killPlayer(game, fangGu.id, `muere: salta a ${target.name}`);
      next = setCharacter(next, targetId, demonCharacter);
      next = withReminder(next, targetId, "fanggu", "Primera vez");
      return { game: next, outcome: "jump" };
    }
  }

  if (foolSurvives(target)) {
    return { game: withReminder(game, targetId, "fool", "Sin habilidad"), outcome: "fool" };
  }

  const self = target.characterId === reminder.sourceCharacterId;
  let next = killPlayer(placeReminder(game, targetId, reminder, copies), targetId, self ? `se mata a sí mismo (${demon})` : `muere por ${demon}`);
  // Banshee sana muerta por el Demonio: todos lo saben y gana su habilidad.
  if (target.characterId === "banshee" && healthy(target)) next = withReminder(next, targetId, "banshee", "Tiene habilidad");
  // Si el Demonio mata al nieto, la Abuela muere también.
  if (has(target, "grandmother", "Nieto")) {
    for (const grandmother of next.players.filter((p) => p.characterId === "grandmother" && p.alive && healthy(p))) {
      next = killPlayer(next, grandmother.id, "muere con su nieto");
    }
  }
  return { game: next, outcome: self ? "selfKill" : target.characterId === "mayor" ? "mayor" : target.characterId === "banshee" && healthy(target) ? "banshee" : "killed" };
}

/**
 * Pukka: el elegido queda envenenado y el envenenado anterior muere (salvo protección) y queda
 * sano. Solo hay una víctima envenenada viva a la vez.
 */
export function pukkaChoose(game: Game, targetId: string, reminder: ReminderToken): { game: Game; died: Player[]; saved: Player[] } {
  const isPukkaPoison = (r: ReminderToken) => r.sourceCharacterId === "pukka" && r.label === "Envenenado";
  const previous = game.players.filter((p) => p.reminders.some(isPukkaPoison));
  let next = game;
  const died: Player[] = [];
  const saved: Player[] = [];
  for (const p of previous) {
    // Deja de estar envenenado: muere (si no está protegido) y después está sano.
    next = updatePlayer(next, p.id, (x) => ({ ...x, reminders: x.reminders.filter((r) => !isPukkaPoison(r)) }));
    if (!p.alive) continue;
    if (isProtected(game, p)) saved.push(p);
    else {
      next = killPlayer(next, p.id, "muere por el veneno del Pukka");
      died.push(p);
    }
  }
  return { game: addReminder(next, targetId, reminder), died, saved };
}

/** Tantas fichas de recordatorio como tiene el personaje en su ficha (0: sin límite). */
const reminderCopies = (reminder: ReminderToken, characters: Map<string, Character>) =>
  characters.get(reminder.sourceCharacterId)?.reminders.filter((l) => l === reminder.label).length ?? 0;

/**
 * Poner el recordatorio de lo que elige un personaje por la noche y aplicar lo que provoca:
 * el ataque del Demonio, el veneno del Pukka, el «Vivo» del Shabaloth… Devuelve también el
 * aviso para el Narrador.
 */
export function applyReminderChoice(
  game: Game,
  targetId: string,
  reminder: ReminderToken,
  characters: Map<string, Character>,
): { game: Game; message: string } {
  const target = findPlayer(game, targetId);
  if (!target) throw new RuleViolation("Ese jugador no está en la partida.");
  const copies = reminderCopies(reminder, characters);
  const night = game.phase.kind === "night";

  // El Encantador de serpientes no pone recordatorio: si elige al Demonio, intercambian.
  if (night && reminder.sourceCharacterId === "snakecharmer") return snakeCharmerChoose(game, targetId, characters);
  // Soñador, Guardián de cuervos, Tonto del pueblo: no cambia nada, solo se da la respuesta.
  if (night && isInfoChoice(reminder.sourceCharacterId)) return { game, message: infoChoiceAnswer(game, reminder.sourceCharacterId, target, characters) };

  if (night && reminder.sourceCharacterId === "pukka" && reminder.label === "Envenenado") {
    const r = pukkaChoose(game, targetId, reminder);
    const parts = [`${target.name} está envenenado por el Pukka.`];
    if (r.died.length) parts.push(`${r.died.map((p) => p.name).join(", ")} muere por el veneno (se anunciará al amanecer).`);
    if (r.saved.length) parts.push(`${r.saved.map((p) => p.name).join(", ")} estaba protegido: no muere y queda sano.`);
    return { game: r.game, message: parts.join(" ") };
  }

  if (reminder.sourceCharacterId === "shabaloth" && reminder.label === "Vivo") {
    const regurgitated = updatePlayer(revivePlayer(game, targetId), targetId, (p) => ({
      ...p,
      reminders: p.reminders.filter((r) => !(r.sourceCharacterId === "shabaloth" && r.label === "Muerto")),
    }));
    return { game: placeReminder(regurgitated, targetId, reminder, copies), message: `El Shabaloth regurgita a ${target.name}: vuelve a la vida.` };
  }

  if (night && isDemonKill(reminder, characters)) {
    const { game: next, outcome } = demonKill(game, targetId, reminder, copies, characters);
    const demon = characters.get(reminder.sourceCharacterId)?.name ?? "el Demonio";
    const message = {
      alreadyDead: `${target.name} ya estaba muerto: el ataque no cambia nada.`,
      blocked: demonBlocked(game, reminder.sourceCharacterId) ?? "El Demonio no mata esta noche.",
      protected: `${target.name} está a salvo y no muere. Si la protección no funciona (borracho, envenenado…), márcalo muerto en el Amanecer.`,
      selfKill: `${target.name} se ha elegido a sí mismo y muere: elige arriba quién es el nuevo Demonio.`,
      mayor: `${target.name} es el Alcalde: puede morir otro en su lugar. Si lo decides, deshaz y elige a ese jugador.`,
      jump: `${demon} salta: ${target.name} es el nuevo ${demon} (malo) y el anterior muere. Despiértalo y enséñale TÚ ERES, ${demon} y el pulgar hacia abajo.`,
      fool: `${target.name} es el Bufón: esta vez no muere y pierde su habilidad.`,
      banshee: `${target.name} es la Banshee: muere y lo sabe toda la mesa. Desde ahora nomina y vota dos veces.`,
      killed: next.players.find((p) => p.id === targetId)?.alive
        ? `${target.name} no muere esta vez.`
        : `${target.name} muere esta noche. Se anunciará al amanecer.`,
    }[outcome];
    return { game: next, message };
  }

  const placed = game.players.filter((p) => p.reminders.some((r) => r.sourceCharacterId === reminder.sourceCharacterId && r.label === reminder.label));
  const from = copies > 0 && placed.length >= copies ? placed[0] : undefined;
  return {
    game: placeReminder(game, targetId, reminder, copies),
    message: from && from.id !== targetId ? `«${reminder.label}» pasa de ${from.name} a ${target.name}.` : `«${reminder.label}» en ${target.name}.`,
  };
}

/** El heredero pasa a ser el Demonio que ha muerto (o a cuidar a Lil' Monsta). */
export function succeedDemon(game: Game, succession: DemonSuccession, heirId: string, characters: Map<string, Character>): Game {
  if (!succession.heirs.some((h) => h.id === heirId)) throw new RuleViolation("Ese jugador no puede pasar a ser el Demonio.");
  if (succession.babysitter) {
    const heir = findPlayer(game, heirId)!;
    const moved = placeReminder(game, heirId, reminderFrom("lilmonsta", LILMONSTA_BABYSITTER, `${heirId}:lilmonsta`), 1);
    return touch(moved, `${heir.name} pasa a cuidar a Lil' Monsta.`);
  }
  const demon = characters.get(succession.demon.characterId);
  if (!demon) throw new RuleViolation("No encuentro el personaje del Demonio.");
  return setCharacter(game, heirId, demon);
}

/** El Hereje (vivo o muerto, sano) invierte quién gana. */
function withHeretic(game: Game, hint: VictoryHint | null): VictoryHint | null {
  if (!hint || !game.players.some((p) => p.characterId === "heretic" && healthy(p))) return hint;
  const winner: Alignment = hint.winner === "good" ? "evil" : "good";
  return { winner, reason: `${hint.reason} Con el Hereje en juego se invierte: gana ${winner === "good" ? "el Bien" : "el Mal"}.` };
}

/** El gemelo bueno de la Gemela malvada (lleva su recordatorio «Gemelo»). */
const goodTwin = (game: Game) => game.players.find((p) => has(p, "eviltwin", "Gemelo"));
const evilTwinAlive = (game: Game) => game.players.some((p) => p.characterId === "eviltwin" && reallyAlive(p) && healthy(p));

/**
 * Sugerencia de final según las reglas básicas. El Narrador decide: hay personajes
 * (Patoso, Goblin…) que cambian quién gana. Si hay un heredero del Demonio, la partida sigue.
 * El Zombuul que solo parece muerto sigue vivo; quien cuida a Lil' Monsta es el Demonio.
 * La Gemela malvada y la Mente maestra pueden impedir o retrasar la victoria del Bien; el
 * Hereje invierte el resultado.
 */
export function victoryHint(game: Game, characters: Map<string, Character>): VictoryHint | null {
  if (game.status === "finished") return null;
  return withHeretic(game, baseVictory(game, characters));
}

function baseVictory(game: Game, characters: Map<string, Character>): VictoryHint | null {
  const executed = game.executedToday ? findPlayer(game, game.executedToday) : undefined;

  // Día extra de la Mente maestra: si se ejecuta a alguien, pierde su equipo.
  if (game.mastermindDay) {
    if (game.phase.kind === "day" && game.phase.number === game.mastermindDay && executed) {
      return executed.alignment === "good"
        ? { winner: "evil", reason: "Día de la Mente maestra: se ha ejecutado a un jugador bueno." }
        : { winner: "good", reason: "Día de la Mente maestra: se ha ejecutado a un jugador malo." };
    }
    return null;
  }

  // El Santo ejecutado hoy (y sano): su equipo pierde.
  if (executed?.characterId === "saint" && !executed.alive && healthy(executed)) {
    return { winner: executed.alignment === "good" ? "evil" : "good", reason: "Han ejecutado al Santo." };
  }
  // Fearmonger: si nomina a su elegido («Terror») y se le ejecuta, el equipo del ejecutado pierde.
  const fearmonger = game.players.find((p) => p.characterId === "fearmonger" && p.alive && healthy(p));
  const byFearmonger = fearmonger && game.nominations.some((n) => !n.exile && n.nominatorId === fearmonger.id && n.nomineeId === executed?.id);
  if (executed && byFearmonger && has(executed, "fearmonger", "Terror")) {
    return { winner: executed.alignment === "good" ? "evil" : "good", reason: "El Fearmonger ha nominado y se ha ejecutado a su elegido." };
  }
  // Gemela malvada: si se ejecuta a su gemelo bueno, gana el Mal.
  const twin = goodTwin(game);
  if (executed && twin?.id === executed.id && executed.alignment === "good" && evilTwinAlive(game)) {
    return { winner: "evil", reason: "Han ejecutado al gemelo bueno de la Gemela malvada." };
  }

  const demons = demonPlayers(game, characters);
  if (demons.length && !demons.some(reallyAlive)) {
    if (demonSuccession(game, characters)) return null;
    // Mientras vivan las dos gemelas, los buenos no pueden ganar.
    if (twin && reallyAlive(twin) && evilTwinAlive(game)) return null;
    return { winner: "good", reason: "El Demonio ha muerto." };
  }
  const leviathan = game.players.some((p) => p.characterId === "leviathan" && reallyAlive(p));
  const goodExecuted = game.players.filter((p) => p.reminders.some((r) => r.label === LEVIATHAN_GOOD_EXECUTED)).length;
  if (leviathan && goodExecuted >= 2) return { winner: "evil", reason: "Con Leviatán en juego se ha ejecutado a un segundo jugador bueno." };
  const alive = game.players.filter((p) => reallyAlive(p) && characters.get(p.characterId)?.team !== "traveller");
  if (alive.length <= 2) return { winner: "evil", reason: "Solo quedan dos jugadores vivos." };
  return null;
}

/**
 * Por qué la partida sigue aunque haya muerto el Demonio (para avisar al Narrador): el día extra
 * de la Mente maestra o la Gemela malvada con su gemelo vivos.
 */
export function victoryNote(game: Game, characters: Map<string, Character>): string | null {
  if (game.status === "finished") return null;
  if (game.mastermindDay && !(game.phase.kind === "day" && game.phase.number === game.mastermindDay && game.executedToday)) {
    return `Ha muerto el Demonio, pero la Mente maestra sigue viva: el día ${game.mastermindDay} se juega igual. Si ese día se ejecuta a un bueno, gana el Mal; si se ejecuta a un malo o no hay ejecución, gana el Bien.`;
  }
  const demons = demonPlayers(game, characters);
  const twin = goodTwin(game);
  if (demons.length && !demons.some(reallyAlive) && !demonSuccession(game, characters) && twin && reallyAlive(twin) && evilTwinAlive(game)) {
    return "Ha muerto el Demonio, pero los buenos no pueden ganar mientras vivan la Gemela malvada y su gemelo.";
  }
  return null;
}

/**
 * Victorias que se deciden al terminar el día:
 * - Día extra de la Mente maestra sin ejecución: gana el Bien.
 * - Vortox vivo y nadie ejecutado hoy: gana el Mal.
 * - Alcalde vivo y sano, 3 jugadores vivos y nadie ejecutado hoy: gana su equipo.
 * - Leviatán vivo al terminar el día 5 (o más): gana el Mal.
 */
export function duskVictory(game: Game, characters: Map<string, Character>): VictoryHint | null {
  if (game.status === "finished" || game.phase.kind !== "day") return null;
  return withHeretic(game, baseDuskVictory(game, characters));
}

function baseDuskVictory(game: Game, characters: Map<string, Character>): VictoryHint | null {
  if (game.mastermindDay === game.phase.number && !game.executedToday) {
    return { winner: "good", reason: "Termina el día de la Mente maestra sin ejecución." };
  }
  const alive = (id: string) => game.players.some((p) => p.characterId === id && reallyAlive(p));
  if (alive("vortox") && !game.executedToday) return { winner: "evil", reason: "Con Vortox vivo, un día sin ejecución hace ganar al Mal." };
  const mayor = game.players.find((p) => p.characterId === "mayor" && p.alive && healthy(p));
  const aliveCount = game.players.filter((p) => reallyAlive(p) && characters.get(p.characterId)?.team !== "traveller").length;
  if (mayor && aliveCount === 3 && !game.executedToday) {
    return { winner: mayor.alignment, reason: "Quedan 3 jugadores vivos, no ha habido ejecución y el Alcalde sigue vivo." };
  }
  if (alive("leviathan") && game.phase.number >= 5) return { winner: "evil", reason: `Termina el día ${game.phase.number} y Leviatán sigue vivo.` };
  return null;
}

export const declareWinner = (game: Game, winner: Alignment): Game =>
  touch({ ...game, status: "finished", winner }, winner === "good" ? "Gana el Bien." : "Gana el Mal.");

export const reopen = (game: Game): Game => touch({ ...game, status: "in_progress", winner: undefined }, "La partida sigue.");
