import type { Character } from "../entities/Character";
import type { Game, Player } from "../entities/Game";
import { has, hasLilMonsta, healthy, reallyAlive } from "./Demons";
import { TOR, TOYMAKER } from "./SpecialRules";

export type NightStepKind = "dusk" | "minion_info" | "demon_info" | "character" | "dawn";

export interface NightStep {
  key: string;
  kind: NightStepKind;
  title: string;
  instruction: string;
  /** Jugadores a los que afecta el paso (a quién despertar). */
  playerIds: string[];
  character?: Character;
  /** Jugadores que creen ser este personaje pero no lo son (Borracho, Lunático…): dales información falsa. */
  deceivedPlayerIds?: string[];
  /** El jugador está muerto: normalmente se salta, salvo habilidades que actúan al morir. */
  dead?: boolean;
  /** Para los que actúan al morir: si toca despertarlo esta noche o no, y por qué. */
  deathNote?: { wake: boolean; text: string };
}

/** Actúan si han muerto esta noche (Guardián de cuervos, Sabio, Granjero, Banshee). */
const ACT_IF_DIED_TONIGHT = new Set(["ravenkeeper", "sage", "farmer", "banshee"]);
/** Actúan una vez si han muerto hoy o esta noche (Adorable, Barbero, Doctor de plaga). */
const ACT_IF_DIED_RECENTLY = new Set(["sweetheart", "barber", "plaguedoctor"]);

function deathNote(game: Game, characterId: string, players: Player[]): NightStep["deathNote"] {
  const tonight = players.some((p) => (game.nightDeaths ?? []).includes(p.id));
  if (ACT_IF_DIED_TONIGHT.has(characterId)) {
    return tonight
      ? { wake: true, text: "Ha muerto esta noche: despiértalo para que use su habilidad." }
      : { wake: false, text: "Solo actúa si muere esta noche. Ahora no le despiertes." };
  }
  // La Niña de la Luna elige al morir (de día, en público) y esa noche muere su elegido si es bueno.
  if (characterId === "moonchild") {
    const dead = players.filter((p) => !p.alive);
    if (!dead.length) return { wake: false, text: "Solo actúa cuando muere. Ahora no hay nada que hacer." };
    return dead.some((p) => !has(p, "moonchild", "Sin habilidad"))
      ? { wake: true, text: "Ha muerto: si ya ha elegido a alguien en público, toca a quién (si es bueno, muere)." }
      : { wake: false, text: "Ya usó su habilidad." };
  }
  if (ACT_IF_DIED_RECENTLY.has(characterId)) {
    const recently = tonight || players.some((p) => (game.dayDeaths ?? []).includes(p.id));
    return recently
      ? { wake: true, text: "Ha muerto hoy o esta noche: su habilidad se activa ahora (si no lo has hecho ya)." }
      : { wake: false, text: "Solo actúa cuando muere. Ahora no hay nada que hacer." };
  }
  return undefined;
}

/**
 * Posiciones de los pasos especiales en la hoja de la primera noche, con la misma numeración
 * que los personajes del catálogo: algunos (Filósofo, Kazali…) van antes de la info de los Esbirros.
 */
export const FIRST_NIGHT_MINION_INFO = 20;
export const FIRST_NIGHT_DEMON_INFO = 24;

/**
 * Con menos de 7 jugadores los Esbirros y el Demonio no se conocen la primera noche, salvo con
 * el Juguetero. Con Tor nadie conoce su personaje, así que tampoco hay información del Mal.
 */
export const hasEvilInfo = (playerCount: number, fabledIds: string[] = []) =>
  !fabledIds.includes(TOR) && (playerCount >= 7 || fabledIds.includes(TOYMAKER));

const nightNumber = (game: Game) => (game.phase.kind === "night" ? game.phase.number : game.phase.number + 1);

/**
 * Si la hoja cambia en mitad de la noche (alguien cambia de personaje, aparece la información
 * del Cultivador de opio…), el Narrador sigue en el mismo paso: se busca por su clave y no por
 * su posición. Si el cambio era moverse por la hoja, se respeta.
 */
export function keepNightStep(before: Game, after: Game, characters: Map<string, Character>): Game {
  if (before.phase.kind !== "night" || after.phase.kind !== "night" || before.phase.number !== after.phase.number) return after;
  if (after.nightStep !== before.nightStep) return after;
  const oldSteps = buildNightOrder(before, characters);
  const key = oldSteps[Math.min(before.nightStep, oldSteps.length - 1)]?.key;
  const newSteps = buildNightOrder(after, characters);
  if (!key || newSteps[after.nightStep]?.key === key) return after;
  const index = newSteps.findIndex((s) => s.key === key);
  return index >= 0 ? { ...after, nightStep: index } : after;
}

export function buildNightOrder(game: Game, characters: Map<string, Character>): NightStep[] {
  const first = nightNumber(game) === 1;
  const steps: { order: number; step: NightStep }[] = [];
  const team = (p: Player) => characters.get(p.characterId)?.team;
  const seated = game.players.filter((p) => team(p) !== "traveller").length;

  steps.push({
    order: 0,
    step: {
      key: "dusk",
      kind: "dusk",
      title: "Crepúsculo",
      instruction: "Comprueba que todos los jugadores tienen los ojos cerrados. Algunos Viajeros y Fábulas actúan ahora.",
      playerIds: [],
    },
  });

  // Cultivador de opio: mientras viva sano, los malos no se conocen; la noche en que muere, sí.
  const poppies = game.players.filter((p) => p.characterId === "poppygrower");
  const poppyBlocks = poppies.some((p) => p.alive && healthy(p));
  const poppyDied = poppies.some((p) => [...(game.nightDeaths ?? []), ...(game.dayDeaths ?? [])].includes(p.id));
  const poppyOrder = characters.get("poppygrower")?.otherNight ?? 0;

  // Con Lil' Monsta no hay información de Esbirros ni de Demonio: se conocen en su paso.
  const evilInfo = first ? hasEvilInfo(seated, game.fabledIds) && !hasLilMonsta(game) && !poppyBlocks : poppyDied && hasEvilInfo(seated, game.fabledIds);
  if (evilInfo) {
    const minions = game.players.filter((p) => team(p) === "minion");
    const demons = game.players.filter((p) => team(p) === "demon");
    // La noche en que muere el Cultivador de opio, justo después de su paso (sin faroles: ya los tuvo).
    const later = !first;
    steps.push({
      order: later ? poppyOrder + 0.1 : FIRST_NIGHT_MINION_INFO,
      step: {
        key: "minion_info",
        kind: "minion_info",
        title: "Información de Esbirros",
        instruction: "Despierta a todos los Esbirros para que se reconozcan. Enséñales la ficha ESTE ES EL DEMONIO y señala al Demonio. Mándalos a dormir.",
        playerIds: minions.map((p) => p.id),
      },
    });
    steps.push({
      order: later ? poppyOrder + 0.2 : FIRST_NIGHT_DEMON_INFO,
      step: {
        key: "demon_info",
        kind: "demon_info",
        title: "Información del Demonio",
        instruction: later
          ? "Ha muerto el Cultivador de opio: despierta al Demonio y enséñale la ficha ESTOS SON TUS ESBIRROS señalando a los Esbirros."
          : "Despierta al Demonio. Enséñale la ficha ESTOS SON TUS ESBIRROS y señala a los Esbirros. Después enséñale ESTOS PERSONAJES NO ESTÁN EN JUEGO y los 3 faroles.",
        playerIds: demons.map((p) => p.id),
      },
    });
  }

  // Un paso por personaje en juego. El Borracho (o quien crea ser otro) se despierta como el
  // personaje que cree ser, y el Narrador le da información falsa. El Lunático no: su propio
  // paso ya le hace actuar como el Demonio que cree ser.
  const byCharacter = new Map<string, Player[]>();
  const add = (id: string, p: Player) => byCharacter.set(id, [...(byCharacter.get(id) ?? []), p]);
  for (const p of game.players) {
    add(p.characterId, p);
    if (p.shownCharacterId && p.characterId !== "lunatic") add(p.shownCharacterId, p);
  }
  // Las Fábulas y Lóricos no son jugadores: su paso lo hace el Narrador (anunciar, poner recordatorios…).
  for (const id of game.fabledIds ?? []) if (!byCharacter.has(id)) byCharacter.set(id, []);
  // Lil' Monsta no lo tiene nadie: en su paso despiertan los Esbirros para elegir quién lo cuida.
  if (hasLilMonsta(game)) byCharacter.set("lilmonsta", game.players.filter((p) => team(p) === "minion"));
  for (const [id, players] of byCharacter) {
    const c = characters.get(id);
    if (!c) continue;
    const order = first ? c.firstNight : c.otherNight;
    if (!order) continue;
    const deceived = players.filter((p) => p.shownCharacterId === id).map((p) => p.id);
    const note = players.length ? deathNote(game, id, players) : undefined;
    steps.push({
      order,
      step: {
        key: `char:${id}`,
        kind: "character",
        title: c.name,
        instruction: (first ? c.firstNightReminder : c.otherNightReminder) || c.ability,
        playerIds: players.map((p) => p.id),
        deceivedPlayerIds: deceived,
        character: c,
        // Los que actúan al morir se saltan si no les toca, aunque estén vivos.
        // El Esbirro muerto por el Vigormortis conserva su habilidad.
        dead: note ? !note.wake : players.length > 0 && players.every((p) => !reallyAlive(p) && !has(p, "vigormortis", "Tiene habilidad")),
        deathNote: note,
      },
    });
  }

  steps.push({
    order: Number.MAX_SAFE_INTEGER,
    step: {
      key: "dawn",
      kind: "dawn",
      title: "Amanecer",
      instruction: "Espera unos segundos. Despierta a todos los jugadores y anuncia quién ha muerto (nunca su personaje ni cómo).",
      playerIds: [],
    },
  });

  return steps.sort((a, b) => a.order - b.order).map((s) => s.step);
}
