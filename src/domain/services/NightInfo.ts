import type { Character } from "../entities/Character";
import type { Game, Player } from "../entities/Game";
import { demonPlayers } from "./Demons";

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
  bureaucrat: "3 votos",
  thief: "Voto negativo",
  snakecharmer: "Envenenado",
  // Eligen para recibir información: no ponen recordatorio, la app da la respuesta.
  dreamer: "Elegido",
  ravenkeeper: "Elegido",
  villageidiot: "Elegido",
};

/** Quien elige para recibir información sobre el elegido (la app da la respuesta). */
const INFO_ON_CHOICE = new Set(["dreamer", "ravenkeeper", "villageidiot"]);

/**
 * Quien al elegir no pone recordatorio: el Encantador de serpientes (intercambia personajes) y
 * los que reciben información sobre el elegido. El botón no nombra ningún recordatorio.
 */
export const CHOICE_WITHOUT_REMINDER = new Set(["snakecharmer", ...INFO_ON_CHOICE]);

export const isInfoChoice = (characterId: string) => INFO_ON_CHOICE.has(characterId);

/**
 * La respuesta para quien elige a un jugador para saber de él (Soñador, Guardián de cuervos,
 * Tonto del pueblo), con los avisos de siempre: Espía o Recluso, Vortox y quien elige sin habilidad.
 */
export function infoChoiceAnswer(game: Game, chooserCharacterId: string, target: Player, characters: Map<string, Character>): string {
  const character = characters.get(target.characterId);
  const name = character?.name ?? target.characterId;
  const good = target.alignment === "good";
  const answer = {
    dreamer: `${target.name} es ${name} (${good ? "bueno" : "malo"}): enséñale ${name} y un personaje ${good ? "malo" : "bueno"} que no esté en su sitio.`,
    ravenkeeper: `Enséñale ${name}, el personaje de ${target.name}.`,
    villageidiot: `${target.name} es ${good ? "bueno: pulgar hacia arriba" : "malo: pulgar hacia abajo"}.`,
  }[chooserCharacterId as "dreamer" | "ravenkeeper" | "villageidiot"];
  const chooser = characters.get(chooserCharacterId);
  const notes = chooser ? commonCaveats(game, characters, chooser) : [];
  const working = game.players.some((p) => p.characterId === chooserCharacterId && !p.reminders.some((r) => /envenen|borrach|sin habilidad/i.test(r.label)));
  if (!working) notes.unshift("Quien elige no tiene habilidad (Borracho, envenenado…): puedes darle información falsa.");
  return [answer, ...notes].join(" ");
}

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

/**
 * Hacia qué lado está el jugador malo más cercano (vivo o muerto), como aprende el Shugenja:
 * "clockwise" (sentido de las agujas del reloj), "counter", "both" si están a la misma distancia.
 */
export function nearestEvilSide(game: Game, from: Player): "clockwise" | "counter" | "both" | undefined {
  const seated = [...game.players].sort((a, b) => a.seat - b.seat);
  const n = seated.length;
  const at = seated.findIndex((p) => p.id === from.id);
  for (let k = 1; k < n; k++) {
    const cw = seated[(at + k) % n].alignment === "evil";
    const ccw = seated[(at - k + n) % n].alignment === "evil";
    if (cw && ccw) return "both";
    if (cw) return "clockwise";
    if (ccw) return "counter";
  }
  return undefined;
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
  const demons = demonPlayers(game, characters);

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
        if (!executed) return "Hoy no ha habido ejecución: no le despiertes.";
        // Solo aprende al que ha muerto por la ejecución (no al Marinero o al Bufón que sobreviven).
        if (!(game.dayDeaths ?? []).includes(executed.id)) return `${executed.name} fue ejecutado pero no murió: no le despiertes.`;
        return `Enséñale ${characters.get(executed.characterId)?.name} (ejecutado: ${executed.name}).`;
      }
      case "fortuneteller": {
        // Quien cuida a Lil' Monsta también es el Demonio para la Pitonisa.
        const demons = demonPlayers(game, characters);
        const herring = game.players.find((p) => p.reminders.some((r) => r.sourceCharacterId === "fortuneteller"));
        const yes = [...demons, ...(herring ? [herring] : [])].map((p) => `${p.seat + 1}. ${p.name}`);
        return `Responde SÍ si elige a ${yes.join(" o ")}${herring ? " (pista falsa incluida)" : ""}.${herring ? "" : " Falta poner la pista falsa en un jugador bueno."}`;
      }
      case "towncrier": {
        // Las nominaciones del día siguen en la partida hasta el amanecer.
        const minions = game.nominations
          .filter((n) => !n.exile)
          .map((n) => game.players.find((p) => p.id === n.nominatorId))
          .filter((p): p is Player => !!p && team(p) === "minion");
        return minions.length
          ? `Asiente: sí ha nominado un Esbirro (${[...new Set(minions.map((p) => p.name))].join(", ")}).`
          : "Niega: hoy no ha nominado ningún Esbirro.";
      }
      case "flowergirl": {
        const demonIds = new Set(demonPlayers(game, characters).map((p) => p.id));
        const voted = game.nominations.some((n) => n.voterIds.some((id) => demonIds.has(id)));
        return voted ? "Asiente: el Demonio ha votado hoy." : "Niega: hoy el Demonio no ha votado.";
      }
      case "oracle": {
        const evilDead = game.players.filter((p) => !p.alive && p.alignment === "evil").length;
        return `Enseña ${evilDead} con los dedos (muertos malos).`;
      }
      case "shugenja": {
        const side = nearestEvilSide(game, self);
        return side === "both"
          ? "Equidistante: señala hacia el lado que quieras."
          : side
            ? `Señala ${side === "clockwise" ? "en el sentido de las agujas del reloj" : "en sentido contrario a las agujas del reloj"}.`
            : null;
      }
      case "knight": {
        const notDemon = game.players.filter((p) => p.id !== self.id && !demons.some((d) => d.id === p.id));
        return `Señala a 2 de estos (no son el Demonio): ${list(notDemon)}.`;
      }
      case "noble": {
        const evil = game.players.filter((p) => p.id !== self.id && p.alignment === "evil");
        const good = game.players.filter((p) => p.id !== self.id && p.alignment === "good");
        return `Señala a 1 malo (${list(evil)}) y 2 buenos (${list(good)}).`;
      }
      case "steward": {
        const good = game.players.filter((p) => p.id !== self.id && p.alignment === "good");
        return `Señala a 1 jugador bueno: ${list(good)}.`;
      }
      case "grandmother": {
        const grandchild = game.players.find((p) => p.reminders.some((r) => r.sourceCharacterId === "grandmother" && r.label === "Nieto"));
        if (!grandchild) return "Falta poner el recordatorio «Nieto» en un jugador bueno.";
        return game.phase.number === 1 && game.phase.kind === "night"
          ? `Señala a ${grandchild.name} y enséñale ${characters.get(grandchild.characterId)?.name}.`
          : null;
      }
      case "sage": {
        // Solo si el Demonio le ha matado esta noche (el paso ya dice si toca despertarle).
        if (!(game.nightDeaths ?? []).includes(self.id)) return null;
        return `Señala al Demonio (${demons.map((p) => p.name).join(" o ")}) y a otro jugador.`;
      }
      case "king": {
        if (game.phase.number === 1) return `El Rey es ${self.name}: señálaselo al Demonio.`;
        const dead = game.players.filter((p) => !p.alive).length;
        const alive = game.players.filter((p) => p.alive);
        return dead >= alive.length
          ? `Hay tantos muertos como vivos o más: enséñale el personaje de 1 vivo (${list(alive.filter((p) => p.id !== self.id))}).`
          : "Hay más vivos que muertos: no le despiertes.";
      }
      case "choirboy": {
        const king = game.players.find((p) => p.characterId === "king");
        const killedByDemon = king && (game.nightDeaths ?? []).includes(king.id) && king.reminders.some((r) => r.label === "Muerto" && characters.get(r.sourceCharacterId)?.team === "demon");
        return killedByDemon ? `El Demonio ha matado al Rey: señala al Demonio (${demons.map((p) => p.name).join(", ")}).` : "El Demonio no ha matado al Rey esta noche: no le despiertes.";
      }
      case "bountyhunter": {
        const known = game.players.find((p) => p.reminders.some((r) => r.sourceCharacterId === "bountyhunter" && r.label === "Conocido"));
        const evil = game.players.filter((p) => p.alive && p.alignment === "evil" && p.id !== known?.id);
        if (!known) return `Falta poner «Conocido» en un jugador malo: ${list(evil)}.`;
        if (game.phase.number === 1 && game.phase.kind === "night") return `Señala a ${known.name}.`;
        const diedRecently = [...(game.nightDeaths ?? []), ...(game.dayDeaths ?? [])].includes(known.id);
        return diedRecently ? `Ha muerto ${known.name}: mueve «Conocido» y señala a otro malo (${list(evil)}).` : "Su jugador conocido sigue vivo: no le despiertes.";
      }
      case "godfather":
        if (game.phase.number !== 1) return null;
        return `Forasteros en juego: ${list(game.players.filter((p) => team(p) === "outsider")) || "ninguno"}.`;
      case "marionette":
        return `Despierta al Demonio y señálale a la Marioneta: ${self.name}.`;
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
