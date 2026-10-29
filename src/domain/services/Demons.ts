import type { Character } from "../entities/Character";
import type { Game, Player, ReminderToken } from "../entities/Game";

// Estado propio de algunos Demonios, guardado como recordatorios en el Grimorio (igual que en
// el físico). Solo son consultas: las reglas que lo cambian están en GameRules.

/** El Zombuul ya ha «muerto» una vez: parece muerto, pero sigue vivo. */
export const ZOMBUUL_SEEMS_DEAD = "Parece muerto";
/** El Zombuul ha muerto de verdad (la segunda vez). */
export const ZOMBUUL_REALLY_DEAD = "Muerto de verdad";
/** Quien cuida a Lil' Monsta (y «es el Demonio»). */
export const LILMONSTA_BABYSITTER = "Es el Demonio";
/** El Leviatán ha visto ejecutar a este jugador bueno. */
export const LEVIATHAN_GOOD_EXECUTED = "Bueno ejecutado";

const has = (p: Player, source: string, label: string) => p.reminders.some((r) => r.sourceCharacterId === source && r.label === label);

/** Zombuul que parece muerto pero sigue vivo (para las reglas cuenta como vivo). */
export const zombuulSeemsDead = (p: Player) =>
  p.characterId === "zombuul" && !p.alive && has(p, "zombuul", ZOMBUUL_SEEMS_DEAD) && !has(p, "zombuul", ZOMBUUL_REALLY_DEAD);

/** Vivo de verdad: los vivos y el Zombuul que solo parece muerto. */
export const reallyAlive = (p: Player) => p.alive || zombuulSeemsDead(p);

/** El huésped del Lleech: el jugador que envenenó la primera noche. */
export const lleechHost = (game: Game) => game.players.find((p) => has(p, "lleech", "Envenenado"));

/** Lil' Monsta está en juego: no lo tiene ningún jugador, lo cuida un Esbirro. */
export const hasLilMonsta = (game: Game) => (game.extraCharacterIds ?? []).includes("lilmonsta");

export const lilMonstaBabysitter = (game: Game) => game.players.find((p) => has(p, "lilmonsta", LILMONSTA_BABYSITTER));

/** Jugadores que son el Demonio: los de tipo Demonio y quien cuida a Lil' Monsta. */
export function demonPlayers(game: Game, characters: Map<string, Character>): Player[] {
  const demons = game.players.filter((p) => characters.get(p.characterId)?.team === "demon");
  const babysitter = hasLilMonsta(game) ? lilMonstaBabysitter(game) : undefined;
  return babysitter && !demons.includes(babysitter) ? [...demons, babysitter] : demons;
}

export const reminderFrom = (source: string, label: string, id: string): ReminderToken => ({ id, sourceCharacterId: source, label });
