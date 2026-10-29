import type { Character } from "../entities/Character";
import type { Game, Player } from "../entities/Game";
import { hasLilMonsta, reallyAlive } from "./Demons";
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

  // Con Lil' Monsta no hay información de Esbirros ni de Demonio: se conocen en su paso.
  if (first && hasEvilInfo(seated, game.fabledIds) && !hasLilMonsta(game)) {
    const minions = game.players.filter((p) => team(p) === "minion");
    const demons = game.players.filter((p) => team(p) === "demon");
    steps.push({
      order: FIRST_NIGHT_MINION_INFO,
      step: {
        key: "minion_info",
        kind: "minion_info",
        title: "Información de Esbirros",
        instruction: "Despierta a todos los Esbirros para que se reconozcan. Enséñales la ficha ESTE ES EL DEMONIO y señala al Demonio. Mándalos a dormir.",
        playerIds: minions.map((p) => p.id),
      },
    });
    steps.push({
      order: FIRST_NIGHT_DEMON_INFO,
      step: {
        key: "demon_info",
        kind: "demon_info",
        title: "Información del Demonio",
        instruction: "Despierta al Demonio. Enséñale la ficha ESTOS SON TUS ESBIRROS y señala a los Esbirros. Después enséñale ESTOS PERSONAJES NO ESTÁN EN JUEGO y los 3 faroles.",
        playerIds: demons.map((p) => p.id),
      },
    });
  }

  // Un paso por personaje en juego. El Borracho (o quien crea ser otro) se despierta como el
  // personaje que cree ser, y el Narrador le da información falsa.
  const byCharacter = new Map<string, Player[]>();
  const add = (id: string, p: Player) => byCharacter.set(id, [...(byCharacter.get(id) ?? []), p]);
  for (const p of game.players) {
    add(p.characterId, p);
    if (p.shownCharacterId) add(p.shownCharacterId, p);
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
        dead: players.length > 0 && players.every((p) => !reallyAlive(p)),
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
