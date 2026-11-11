import type { Player, ReminderToken } from "../entities/Game";

// Recordatorios del Grimorio que leen las reglas. Como en el Grimorio físico, el estado de muchos
// personajes (envenenado, sin habilidad, a salvo…) está en los recordatorios: aquí está el único
// sitio que decide qué texto significa qué.

/**
 * Textos del catálogo (characters.json) que usan las reglas. Si se cambia uno allí, hay que
 * cambiarlo aquí: lo comprueba src/tests/reminders.test.ts.
 */
export const REMINDER = {
  poisoned: "Envenenado",
  drunk: "Borracho",
  /** El Cortesano: primer día de borrachera (luego «Borracho 2» y «Borracho 3»). */
  drunk1: "Borracho 1",
  noAbility: "Sin habilidad",
  hasAbility: "Tiene habilidad",
  dead: "Muerto",
  alive: "Vivo",
  safe: "A salvo",
  mad: "Loco",
  /** Quien cuida a Lil' Monsta (y «es el Demonio»). */
  isDemon: "Es el Demonio",
  /** El Leviatán ha visto ejecutar a este jugador bueno. */
  goodExecuted: "Bueno ejecutado",
} as const;

/** Recordatorios que pone la app y no están en el catálogo. */
export const APP_REMINDER = {
  /** El Zombuul ya ha «muerto» una vez: parece muerto, pero sigue vivo. */
  zombuulSeemsDead: "Parece muerto",
  /** El Zombuul ha muerto de verdad (la segunda vez). */
  zombuulReallyDead: "Muerto de verdad",
  /** Se ha convertido en el Demonio de día (Mujer escarlata): esta noche hay que decírselo. */
  newDemon: "Nuevo Demonio",
  /** La borrachera del Juglar: el día de la ejecución aún no caduca; al amanecer pasa a «Borracho». */
  minstrelTomorrow: "Borracho hasta mañana",
} as const;

/**
 * Le quita la habilidad: envenenado, borracho (también «Borracho 1», «Es el Borracho» o los que
 * el Narrador pone a mano) o sin habilidad. La locura no: un jugador loco conserva su habilidad.
 */
const DISABLING = /envenen|borrach|sin habilidad/i;

export const disablesAbility = (reminder: Pick<ReminderToken, "label">) => DISABLING.test(reminder.label);

/** Sin recordatorios que le quiten la habilidad. */
export const healthy = (p: Player) => !p.reminders.some(disablesAbility);

/** Tiene el recordatorio `label` puesto por `source`. */
export const has = (p: Player, source: string, label: string) => p.reminders.some((r) => r.sourceCharacterId === source && r.label === label);
