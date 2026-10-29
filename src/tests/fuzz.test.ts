import { describe, expect, it } from "vitest";
import { StaticCharacterCatalog, StaticOfficialScripts } from "@infrastructure/catalog/StaticCatalog";
import type { Character } from "@domain/entities/Character";
import type { Game, Player } from "@domain/entities/Game";
import { RuleViolation } from "@domain/errors";
import { demonPlayers, reallyAlive } from "@domain/services/Demons";
import * as rules from "@domain/services/GameRules";
import { choiceReminder, infoHints } from "@domain/services/NightInfo";
import { buildNightOrder, keepNightStep } from "@domain/services/NightOrder";
import { pick, seededRandom, type RandomFn } from "@domain/services/Random";
import { applySetupEffects, pickBluffs, pickDecoys, randomSelection, seatMarionette } from "@domain/services/SetupGenerator";
import { isDealt } from "@domain/services/SetupRules";
import { publicPlayers, seatSecret } from "@domain/services/TableView";

// Partidas al azar de principio a fin: el Narrador sigue la hoja de noche, los jugadores nominan
// y votan al azar. En cada paso se comprueba que las reglas no se contradicen ni se rompen.

const catalog = new StaticCharacterCatalog();
const map = catalog.map();
const scripts = new StaticOfficialScripts().list();
// Un guion con todo lo que se puede preparar (sin los Demonios de preparación pendiente).
const UNSUPPORTED = new Set(["legion", "riot", "kazali", "lordoftyphon", "summoner", "atheist"]);
const everything = catalog.all().filter((c) => ["townsfolk", "outsider", "minion", "demon"].includes(c.team) && !UNSUPPORTED.has(c.id));
const pools: { name: string; characters: Character[] }[] = [
  ...scripts.map((s) => ({ name: s.name, characters: s.characterIds.map((id) => catalog.get(id)!).filter((c) => c.team !== "traveller") })),
  { name: "Todos", characters: everything },
];
const travellers = catalog.all().filter((c) => c.team === "traveller");
const FABLED = ["toymaker", "tor", "sentinel", "angel", "djinn"];
const demonPlayersOf = (g: Game) => demonPlayers(g, map);

function setUp(pool: Character[], playerCount: number, random: RandomFn): Game | null {
  let bag: Character[];
  try {
    bag = randomSelection(playerCount, pool, random);
  } catch {
    return null;
  }
  const decoys = pickDecoys(bag, pool, random);
  const dealt = bag.filter(isDealt);
  const order = [...dealt].sort(() => random() - 0.5);
  let players: Player[] = order.map((c, seat) => ({
    id: `p${seat}`,
    seat,
    name: `J${seat + 1}`,
    characterId: c.id,
    shownCharacterId: decoys[c.id],
    alignment: c.team === "minion" || c.team === "demon" ? "evil" : "good",
    alive: true,
    ghostVoteUsed: false,
    reminders: [],
  }));
  // A veces, un Viajero.
  if (random() < 0.3) {
    const t = pick(travellers, random)!;
    players.push({ id: `p${players.length}`, seat: players.length, name: `J${players.length + 1}`, characterId: t.id, alignment: random() < 0.5 ? "good" : "evil", alive: true, ghostVoteUsed: false, reminders: [] });
  }
  players = seatMarionette(players, map, random);
  let n = 0;
  players = applySetupEffects(players, map, random, () => `s${n++}`).players;
  return {
    id: "g",
    name: "Fuzz",
    mode: "manual",
    scriptId: "",
    scriptName: "",
    players,
    fabledIds: random() < 0.3 ? [pick(FABLED, random)!] : [],
    extraCharacterIds: bag.filter((c) => !isDealt(c)).map((c) => c.id),
    demonBluffs: pickBluffs([...bag.map((c) => c.id), ...Object.values(decoys)], pool, random),
    phase: { kind: "night", number: 1 },
    nightStep: 0,
    nominations: [],
    status: "in_progress",
    log: [],
    joinCode: "FUZZ",
    createdAt: "",
    updatedAt: "",
  };
}

/** Lo que nunca debería pasar, con el estado en el que pasó. */
function invariants(g: Game, where: string): string[] {
  const problems: string[] = [];
  const steps = buildNightOrder(g, map);
  const keys = steps.map((s) => s.key);
  if (new Set(keys).size !== keys.length) problems.push(`${where}: pasos de noche repetidos ${keys.join(",")}`);
  for (const p of g.players) {
    if (!map.get(p.characterId)) problems.push(`${where}: personaje desconocido ${p.characterId}`);
    if (p.alignment !== "good" && p.alignment !== "evil") problems.push(`${where}: bando raro en ${p.name}`);
  }
  const deaths = [...(g.nightDeaths ?? []), ...(g.dayDeaths ?? [])];
  if (new Set(g.nightDeaths ?? []).size !== (g.nightDeaths ?? []).length) problems.push(`${where}: muerte de noche repetida`);
  for (const id of deaths) if (!g.players.some((p) => p.id === id)) problems.push(`${where}: muerte de un jugador que no existe`);
  if (g.phase.kind === "day" && (g.nightDeaths ?? []).length) problems.push(`${where}: de día quedan muertes de noche sin anunciar`);
  // La mesa nunca ve muerto a alguien vivo.
  const pub = publicPlayers(g, map);
  g.players.forEach((p, i) => {
    if (p.alive && !pub[i].alive) problems.push(`${where}: la mesa ve muerto a ${p.name}, que está vivo`);
    seatSecret(p, map, g.fabledIds, pub[i].alive);
  });
  // Las ayudas de la noche no fallan ni dicen «undefined».
  for (const s of steps) {
    if (!s.character) continue;
    for (const h of infoHints(g, s.character, map)) if (/undefined|NaN/.test(h.text)) problems.push(`${where}: ayuda rara para ${s.character.id}: ${h.text}`);
  }
  // No puede sugerir a la vez una victoria y un nuevo Demonio.
  if (rules.victoryHint(g, map) && rules.demonSuccession(g, map)) problems.push(`${where}: victoria y heredero a la vez`);
  // Si no queda ningún Demonio vivo ni heredero, o hay que sugerir una victoria o explicar por qué sigue.
  const demons = demonPlayersOf(g);
  if (demons.length && !demons.some(reallyAlive) && !rules.demonSuccession(g, map) && !rules.victoryHint(g, map) && !rules.victoryNote(g, map)) {
    problems.push(`${where}: el Demonio ha muerto y la app no dice nada`);
  }
  for (const n of g.nominations) if (!Number.isFinite(rules.voteCount(g, n))) problems.push(`${where}: recuento de votos roto`);
  return problems;
}

/** Ejecuta una acción; una RuleViolation es un «no se puede» legítimo, cualquier otro error es un fallo. */
function attempt(g: Game, action: (g: Game) => Game, where: string, problems: string[]): Game {
  try {
    return action(g);
  } catch (e) {
    if (!(e instanceof RuleViolation)) problems.push(`${where}: ${(e as Error).stack?.split("\n").slice(0, 3).join(" | ")}`);
    return g;
  }
}

function play(pool: Character[], playerCount: number, seed: number): string[] {
  const random = seededRandom(seed);
  let g = setUp(pool, playerCount, random);
  if (!g) return [];
  const problems: string[] = [];
  const label = () => `[${playerCount} jug., semilla ${seed}, ${rules.phaseLabel(g!.phase)}]`;
  let ids = 0;

  for (let round = 0; round < 10 && g.status === "in_progress"; round++) {
    // ---- Noche: se recorre la hoja; quien elige, elige al azar.
    const night = g.phase.number;
    for (let i = 0; i < 40; i++) {
      const steps = buildNightOrder(g, map);
      if (g.nightStep >= steps.length - 1) break;
      const step = steps[g.nightStep];
      const label2 = choiceReminder(step.character?.id ?? "", night === 1);
      if (step.character && label2 && step.playerIds.length && !step.dead) {
        const target = pick(g.players, random)!;
        const before = g;
        g = attempt(
          g,
          (x) => {
            const result = rules.applyReminderChoice(x, target.id, { id: `c${ids++}`, sourceCharacterId: step.character!.id, label: label2 }, map);
            if (/undefined|NaN/.test(result.message)) problems.push(`${label()} aviso raro: ${result.message}`);
            return result.game;
          },
          `${label()} ${step.character.id}`,
          problems,
        );
        g = keepNightStep(before, g, map);
        // Si aparece un heredero del Demonio, se acepta el primero.
        const s = rules.demonSuccession(g, map);
        if (s) g = attempt(g, (x) => rules.succeedDemon(x, s, s.heirs[0].id, map), `${label()} heredero`, problems);
      }
      problems.push(...invariants(g, `${label()} paso ${step.key}`));
      g = rules.setNightStep(g, g.nightStep + 1);
    }
    if (rules.victoryHint(g, map)) break;
    g = attempt(g, rules.startDay, `${label()} amanecer`, problems);
    problems.push(...invariants(g, `${label()} amanecer`));

    // ---- Día: algún exilio, unas nominaciones al azar y, si hay picota, ejecución.
    const traveller = g.players.find((p) => p.alive && map.get(p.characterId)?.team === "traveller");
    if (traveller && random() < 0.3) {
      const id = `e${ids++}`;
      g = attempt(g, (x) => rules.callExile(x, traveller.id, id, map), `${label()} exilio`, problems);
      for (const p of g.players) if (random() < 0.6) g = attempt(g, (x) => rules.toggleVote(x, id, p.id), `${label()} voto exilio`, problems);
      g = attempt(g, (x) => rules.closeNomination(x, id), `${label()} cierre exilio`, problems);
    }
    for (let k = 0; k < 3; k++) {
      const nominator = pick(g.players, random)!;
      const nominee = pick(g.players, random)!;
      if (rules.canNominate(g, nominator.id, nominee.id)) continue;
      const id = `n${ids++}`;
      g = attempt(g, (x) => rules.nominate(x, nominator.id, nominee.id, id, map), `${label()} nominación`, problems);
      if (!g.nominations.some((n) => n.id === id)) continue;
      for (const p of g.players) if (random() < 0.55) g = attempt(g, (x) => rules.toggleVote(x, id, p.id), `${label()} voto`, problems);
      g = attempt(g, (x) => rules.closeNomination(x, id), `${label()} cierre`, problems);
      problems.push(...invariants(g, `${label()} tras votar`));
    }
    const block = rules.onTheBlock(g);
    if (block) g = attempt(g, (x) => rules.execute(x, block.playerId, map), `${label()} ejecución`, problems);
    problems.push(...invariants(g, `${label()} tras ejecutar`));
    const s = rules.demonSuccession(g, map);
    if (s) g = attempt(g, (x) => rules.succeedDemon(x, s, s.heirs[0].id, map), `${label()} heredero de día`, problems);
    // Los muertos que ya gastaron su voto no pueden haber votado después (salvo exilio, Voudon o Banshee).
    if (rules.victoryHint(g, map) || rules.duskVictory(g, map)) break;
    const expiring = rules.expiringReminders(g).map((e) => e.reminder.id);
    g = attempt(g, (x) => rules.startNight(rules.removeReminders(x, expiring)), `${label()} anochecer`, problems);
    problems.push(...invariants(g, `${label()} anochecer`));
  }
  // Una partida sin vivos o con todos muertos sería un fallo de las reglas de victoria.
  if (g.players.filter(reallyAlive).length === 0) problems.push(`${label()}: han muerto todos sin que nadie gane`);
  return problems;
}

describe("Partidas al azar", () => {
  for (const pool of pools) {
    it(`${pool.name}: 5 a 15 jugadores sin errores`, () => {
      const problems: string[] = [];
      for (let players = 5; players <= 15; players++) {
        for (let seed = 1; seed <= 25; seed++) problems.push(...play(pool.characters, players, seed * 101 + players));
      }
      const unique = [...new Set(problems.map((p) => p.replace(/\[[^\]]*\]/, "").trim()))];
      expect(unique.slice(0, 15)).toEqual([]);
    });
  }
});

