import type { Character } from "../entities/Character";
import type { Game, Player } from "../entities/Game";

// La respuesta verdadera de los personajes de información, calculada con el Grimorio.
// Es una ayuda: el Narrador decide si la da (o da otra si está borracho, envenenado…).

export interface InfoHint {
  playerId: string;
  /** La respuesta verdadera, lista para dar. */
  text: string;
  /** Lo que puede cambiarla (personajes que se registran distinto, Vortox…). */
  caveats: string[];
}

/**
 * Recordatorio que se pone sobre el jugador que elige cada noche quien tiene esta habilidad
 * (Envenenador → «Envenenado», Monje → «A salvo», Demonios → «Muerto»…).
 */
export const CHOICE_REMINDER: Record<string, string> = {
  poisoner: "Envenenado",
  monk: "A salvo",
  butler: "Señor",
  innkeeper: "A salvo",
  sailor: "Borracho",
  exorcist: "Elegido",
  gambler: "Muerto",
  devilsadvocate: "Sobrevive ejecución",
  assassin: "Muerto",
  godfather: "Muerto",
  witch: "Maldito",
  cerenovus: "Loco",
  harpy: "Loco",
  widow: "Envenenado",
  fearmonger: "Terror",
  acrobat: "Elegido",
  preacher: "Sin habilidad",
  professor: "Vivo",
  courtier: "Borracho 1",
  ogre: "Amigo",
  lunatic: "Elegido",
  imp: "Muerto",
  po: "Muerto",
  pukka: "Envenenado",
  shabaloth: "Muerto",
  zombuul: "Muerto",
  fanggu: "Muerto",
  nodashii: "Muerto",
  vigormortis: "Muerto",
  vortox: "Muerto",
  lleech: "Muerto",
  ojo: "Muerto",
  kazali: "Muerto",
  lordoftyphon: "Muerto",
  legion: "Muerto",
  lilmonsta: "Es el Demonio",
  yaggababble: "Muerto",
  alhadikhia: "1",
};

/** Lo que pone quien elige esta noche: el Lleech, la primera noche, envenena a su huésped. */
export const choiceReminder = (characterId: string, firstNight: boolean): string | undefined =>
  characterId === "lleech" && firstNight ? "Envenenado" : CHOICE_REMINDER[characterId];

const label = (p: Player, characters: Map<string, Character>) => `${p.seat + 1}. ${p.name} (${characters.get(p.characterId)?.name ?? "?"})`;

/** Los vecinos vivos más cercanos a cada lado, saltando a los muertos. */
export function aliveNeighbours(game: Game, player: Player): Player[] {
  const seated = [...game.players].sort((a, b) => a.seat - b.seat);
  const n = seated.length;
  const at = seated.findIndex((p) => p.id === player.id);
  const walk = (dir: 1 | -1) => {
    for (let k = 1; k < n; k++) {
      const p = seated[(at + dir * k + n) % n];
      if (p.alive && p.id !== player.id) return p;
    }
    return undefined;
  };
  return [...new Set([walk(-1), walk(1)].filter((p): p is Player => !!p))];
}

/** Parejas de jugadores malos sentados juntos (vivos o muertos), como cuenta el Chef. */
export function evilPairs(game: Game): number {
  const seated = [...game.players].sort((a, b) => a.seat - b.seat);
  if (seated.length < 2) return 0;
  return seated.filter((p, i) => p.alignment === "evil" && seated[(i + 1) % seated.length].alignment === "evil").length;
}

/** Pasos desde el Demonio hasta el Esbirro más cercano, como cuenta el Relojero. */
export function demonToMinion(game: Game, characters: Map<string, Character>): number | undefined {
  const n = game.players.length;
  const team = (p: Player) => characters.get(p.characterId)?.team;
  const demons = game.players.filter((p) => team(p) === "demon");
  const minions = game.players.filter((p) => team(p) === "minion");
  const distances = demons.flatMap((d) => minions.map((m) => Math.min(Math.abs(d.seat - m.seat), n - Math.abs(d.seat - m.seat))));
  return distances.length ? Math.min(...distances) : undefined;
}

function commonCaveats(game: Game, characters: Map<string, Character>, character: Character): string[] {
  const inPlay = new Set(game.players.map((p) => p.characterId));
  const caveats: string[] = [];
  const misregister = ["spy", "recluse"].filter((id) => inPlay.has(id)).map((id) => characters.get(id)!.name);
  if (misregister.length) caveats.push(`${misregister.join(" y ")} puede aparecer distinto: decides tú.`);
  if (inPlay.has("vortox") && character.team === "townsfolk") caveats.push("Con Vortox en juego, la información de los Aldeanos debe ser falsa.");
  return caveats;
}

/**
 * La respuesta verdadera para cada jugador de un paso de noche (también para quien solo cree ser
 * ese personaje, que la recibirá falsa si al Narrador le conviene). Vacío si el personaje no es
 * de información o la respuesta depende de lo que elija el jugador.
 */
export function infoHints(game: Game, character: Character, characters: Map<string, Character>): InfoHint[] {
  const players = game.players.filter((p) => p.characterId === character.id || p.shownCharacterId === character.id);
  const team = (p: Player) => characters.get(p.characterId)?.team;
  const caveats = commonCaveats(game, characters, character);
  const others = (self: Player, t: string) => game.players.filter((p) => p.id !== self.id && team(p) === t);
  const list = (ps: Player[]) => ps.map((p) => label(p, characters)).join(", ");

  const answer = (self: Player): string | null => {
    switch (character.id) {
      case "empath": {
        const evil = aliveNeighbours(game, self).filter((p) => p.alignment === "evil").length;
        return `Enseña ${evil} con los dedos.`;
      }
      case "chef":
        return `Enseña ${evilPairs(game)} con los dedos.`;
      case "clockmaker": {
        const steps = demonToMinion(game, characters);
        return steps === undefined ? null : `Enseña ${steps} con los dedos.`;
      }
      case "washerwoman": {
        const ts = others(self, "townsfolk");
        return ts.length ? `Aldeanos que puedes enseñar: ${list(ts)}.` : null;
      }
      case "librarian": {
        const os = others(self, "outsider");
        return os.length ? `Forasteros que puedes enseñar: ${list(os)}.` : "No hay Forasteros: enséñale el 0.";
      }
      case "investigator": {
        const ms = others(self, "minion");
        return ms.length ? `Esbirros que puedes enseñar: ${list(ms)}.` : null;
      }
      case "undertaker": {
        const executed = game.players.find((p) => p.id === game.executedToday);
        return executed ? `Enséñale ${characters.get(executed.characterId)?.name} (ejecutado: ${executed.name}).` : "Hoy no ha habido ejecución: no le despiertes.";
      }
      case "fortuneteller": {
        const demons = game.players.filter((p) => team(p) === "demon");
        const herring = game.players.find((p) => p.reminders.some((r) => r.sourceCharacterId === "fortuneteller"));
        const yes = [...demons, ...(herring ? [herring] : [])].map((p) => `${p.seat + 1}. ${p.name}`);
        return `Responde SÍ si elige a ${yes.join(" o ")}${herring ? " (pista falsa incluida)" : ""}.${herring ? "" : " Falta poner la pista falsa en un jugador bueno."}`;
      }
      case "zombuul": {
        // Solo ataca si nadie ha muerto durante el día (también cuenta su propia muerte aparente).
        const died = (game.dayDeaths ?? []).map((id) => game.players.find((p) => p.id === id)?.name).filter(Boolean);
        return died.length ? `Hoy ha muerto ${died.join(", ")}: no despiertes al Zombuul.` : "Hoy no ha muerto nadie: despierta al Zombuul para que elija.";
      }
      default:
        return null;
    }
  };

  return players.flatMap((p) => {
    const text = answer(p);
    return text ? [{ playerId: p.id, text, caveats }] : [];
  });
}
