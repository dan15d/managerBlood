import type { Character } from "@domain/entities/Character";
import type { Game } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { buildNightOrder } from "@domain/services/NightOrder";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage, useApp } from "../../app/AppContext";
import { CharacterPicker } from "../../components/CharacterPicker";
import { Sheet } from "../../components/Sheet";
import { AiPanel } from "./AiPanel";
import { DayPanel } from "./DayPanel";
import { FabledBar } from "./FabledBar";
import { Grimoire } from "./Grimoire";
import { NightPanel } from "./NightPanel";
import { PlayerSheet } from "./PlayerSheet";
import { ArrowLeft, ArrowLeftRight, Eye, EyeOff, Flag, Moon, ScrollText, Smartphone, Sparkles, Sun, Undo2 } from "lucide-react";
import { useWakeLock } from "../../hooks/useWakeLock";

type Tab = "phase" | "ai" | "log";

const UNDO_LIMIT = 30;

/** Solo ha cambiado el paso de la noche (o la hora de guardado). */
const onlyNavigation = (a: Game, b: Game) =>
  JSON.stringify({ ...a, nightStep: 0, updatedAt: "" }) === JSON.stringify({ ...b, nightStep: 0, updatedAt: "" });

/** Modo «toca una ficha»: poner un recordatorio o nominar sin abrir la hoja del jugador. */
type Pick =
  | { kind: "reminder"; sourceId: string; label: string }
  | { kind: "nominator" }
  | { kind: "nominee"; nominatorId: string }
  /** Cambiar sitios: se toca a uno y luego a otro, y se intercambian. Sigue activo hasta «Listo». */
  | { kind: "seat"; fromId?: string }
  /** Ejecutar sin votación (Virgen, Juez, Visir, locura…). */
  | { kind: "execute" }
  /** Pedir el exilio de un Viajero. */
  | { kind: "exile" };

export function GamePage() {
  const { id } = useParams();
  const { app, toast } = useApp();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [scriptCharacters, setScriptCharacters] = useState<Character[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("phase");
  const [hidden, setHidden] = useState(false);
  const [editingBluffs, setEditingBluffs] = useState(false);
  const [dismissedHint, setDismissedHint] = useState("");
  const [pick, setPick] = useState<Pick | null>(null);
  const [ending, setEnding] = useState(false);
  const characters = app.catalog.map();
  const saving = useRef(Promise.resolve());
  const gameRef = useRef<Game | null>(null);
  // Estados anteriores para «Deshacer» (solo en esta pantalla; al recargar se pierden).
  const history = useRef<Game[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  useWakeLock();

  useEffect(() => {
    if (!id) return;
    app.loadGame
      .execute(id)
      .then(async (g) => {
        gameRef.current = g;
        setGame(g);
        const script = (await app.listScripts.execute()).find((s) => s.id === g.scriptId);
        const ids = script?.characterIds ?? app.catalog.all().map((c) => c.id);
        const travellers = app.catalog.all().filter((c) => c.team === "traveller").map((c) => c.id);
        setScriptCharacters([...new Set([...ids, ...travellers])].map((x) => app.catalog.get(x)!).filter(Boolean));
      })
      .catch((e) => {
        toast(errorMessage(e), "error");
        navigate("/");
      });
  }, [app, id, navigate, toast]);

  const persist = useCallback(
    (next: Game) => {
      gameRef.current = next;
      setGame(next);
      saving.current = saving.current.then(() => app.saveGame.execute(next)).catch((e) => toast(errorMessage(e), "error"));
    },
    [app, toast],
  );

  /** Aplica una regla del dominio y guarda (en cola, para no pisar guardados anteriores). */
  const change = useCallback(
    (mutate: (g: Game) => Game) => {
      const current = gameRef.current;
      if (!current) return;
      let next: Game;
      try {
        next = mutate(current);
      } catch (e) {
        toast(errorMessage(e), "error");
        return;
      }
      if (next === current) return;
      // Moverse por la hoja de noche no se deshace: solo lo que cambia el Grimorio.
      if (!onlyNavigation(current, next)) {
        history.current = [...history.current.slice(-(UNDO_LIMIT - 1)), current];
        setCanUndo(true);
      }
      persist(next);
    },
    [persist, toast],
  );

  const undo = useCallback(() => {
    const previous = history.current.pop();
    const current = gameRef.current;
    if (!previous || !current) return;
    setCanUndo(history.current.length > 0);
    const undone = current.log.length > previous.log.length ? current.log[current.log.length - 1].text : undefined;
    persist({ ...previous, updatedAt: new Date().toISOString() });
    toast(undone ? `Deshecho: ${undone}` : "Deshecho.");
  }, [persist, toast]);

  const steps = useMemo(() => (game ? buildNightOrder(game, characters) : []), [game, characters]);

  if (!game) {
    return (
      <main className="page page--flow">
        <p className="muted">Abriendo el Grimorio…</p>
      </main>
    );
  }

  const night = game.phase.kind === "night";
  const step = night ? steps[Math.min(game.nightStep, steps.length - 1)] : undefined;
  const player = selected ? game.players.find((p) => p.id === selected) : undefined;
  const hint = rules.victoryHint(game, characters);
  const hintKey = hint ? `${hint.winner}:${game.players.map((p) => +p.alive).join("")}` : "";
  const succession = rules.demonSuccession(game, characters);
  const successionKey = succession ? `succ:${game.phase.kind}:${game.players.map((p) => +p.alive).join("")}` : "";
  // Por qué la partida sigue aunque haya muerto el Demonio (Mente maestra, Gemela malvada).
  const note = rules.victoryNote(game, characters);
  const heretic = game.players.some((p) => p.characterId === "heretic");
  const name = (pid: string) => game.players.find((p) => p.id === pid)?.name ?? "";

  const tapPlayer = (pid: string) => {
    if (!pick) return setSelected(pid);
    if (pick.kind === "seat") {
      if (!pick.fromId) return setPick({ kind: "seat", fromId: pid });
      if (pick.fromId !== pid) {
        change((g) => rules.swapSeats(g, pick.fromId!, pid));
        toast(`${name(pick.fromId)} y ${name(pid)} cambian de sitio.`);
      }
      return setPick({ kind: "seat" });
    }
    if (pick.kind === "reminder") {
      // Pone el recordatorio y aplica lo que provoca (ataque del Demonio, veneno del Pukka…).
      const reminder = { id: app.newId(), sourceCharacterId: pick.sourceId, label: pick.label };
      let message = "";
      change((g) => {
        const result = rules.applyReminderChoice(g, pid, reminder, characters);
        message = result.message;
        return result.game;
      });
      if (message) toast(message);
      return setPick(null);
    }
    if (pick.kind === "exile") {
      const problem = rules.canExile(game, pid, characters);
      if (problem) return toast(problem, "error");
      change((g) => rules.callExile(g, pid, app.newId(), characters));
      setPick(null);
      return setTab("phase");
    }
    if (pick.kind === "execute") {
      change((g) => rules.executeNow(g, pid, undefined, characters));
      toast(`${name(pid)} es ejecutado.`);
      setPick(null);
      return setTab("phase");
    }
    if (pick.kind === "nominator") {
      const problem = rules.canNominate(game, pid, "");
      if (problem) return toast(problem, "error");
      return setPick({ kind: "nominee", nominatorId: pid });
    }
    const problem = rules.canNominate(game, pick.nominatorId, pid);
    if (problem) return toast(problem, "error");
    // La Virgen: si la nomina un Aldeano por primera vez, ese Aldeano es ejecutado en el acto.
    const nominatorId = pick.nominatorId;
    let virgin = { executes: false, spy: false };
    change((g) => {
      const result = rules.virginNomination(rules.nominate(g, nominatorId, pid, app.newId()), nominatorId, pid, characters);
      virgin = result;
      return result.executes
        ? rules.executeNow(result.game, nominatorId, `${name(nominatorId)} nomina a la Virgen siendo Aldeano: es ejecutado en el acto.`, characters)
        : result.game;
    });
    if (virgin.executes) toast(`${name(pid)} es la Virgen y ${name(nominatorId)} es Aldeano: ${name(nominatorId)} es ejecutado en el acto.`);
    else if (virgin.spy) toast(`${name(pid)} es la Virgen y la nomina el Espía: si decides que se registra como Aldeano, usa «Ejecutar sin votación».`);
    setPick(null);
    setTab("phase");
  };

  const pickText = !pick
    ? null
    : pick.kind === "seat"
      ? pick.fromId
        ? `¿Con quién cambia de sitio ${name(pick.fromId)}?`
        : "Toca a un jugador y después a otro para cambiarlos de sitio"
      : pick.kind === "reminder"
      ? `Toca al jugador para poner «${pick.label}»`
      : pick.kind === "exile"
        ? "Toca al Viajero que se quiere exiliar"
      : pick.kind === "execute"
        ? "Toca al jugador que se ejecuta sin votación"
      : pick.kind === "nominator"
        ? "Toca a quien nomina"
        : `${name(pick.nominatorId)} nomina a… toca al nominado`;
  // Durante la nominación se resaltan quienes pueden nominar o ser nominados.
  const highlighted =
    pick?.kind === "nominator"
      ? game.players.filter((p) => p.alive && !game.nominations.some((n) => n.nominatorId === p.id)).map((p) => p.id)
      : pick?.kind === "nominee"
        ? game.players.filter((p) => !game.nominations.some((n) => n.nomineeId === p.id)).map((p) => p.id)
        : pick?.kind === "seat"
          ? pick.fromId
            ? [pick.fromId]
            : game.players.map((p) => p.id)
          : pick?.kind === "exile"
            ? game.players.filter((p) => p.alive && characters.get(p.characterId)?.team === "traveller").map((p) => p.id)
          : pick?.kind === "execute"
            ? game.players.map((p) => p.id)
            : (step?.playerIds ?? []);

  return (
    <main className="page page--wide page--flow">
      <div className="game-bar">
        <Link to="/" className="btn btn--ghost icon-btn" aria-label="Volver a partidas">
          <ArrowLeft />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {game.name}
          </div>
          <div className="muted small">
            {game.scriptName} · {game.players.length} jugadores
          </div>
        </div>
        <button className="btn btn--small" disabled={!canUndo} onClick={undo} aria-label="Deshacer" title="Deshace el último cambio del Grimorio">
          <Undo2 />
          <span className="label-wide"> Deshacer</span>
        </button>
        <button
          className="btn btn--small"
          aria-pressed={hidden}
          aria-label={hidden ? "Mostrar personajes" : "Ocultar personajes"}
          onClick={() => setHidden(!hidden)}
          title="Oculta los personajes por si alguien mira la pantalla"
        >
          {hidden ? <Eye /> : <EyeOff />}
          <span className="label-wide">{hidden ? " Mostrar" : " Ocultar"}</span>
        </button>
        <button
          className="btn btn--small"
          aria-pressed={pick?.kind === "seat"}
          aria-label="Cambiar sitios"
          onClick={() => setPick(pick?.kind === "seat" ? null : { kind: "seat" })}
          title="Toca dos jugadores para cambiarlos de sitio"
        >
          <ArrowLeftRight />
          <span className="label-wide"> Sitios</span>
        </button>
        <Link to={`/partida/${game.id}/revelar`} className="btn btn--small" aria-label="Repartir personajes">
          <Smartphone />
          <span className="label-wide"> Repartir</span>
        </Link>
        {game.status !== "finished" && (
          <button className="btn btn--small" aria-label="Terminar la partida" title="Declarar quién gana" onClick={() => setEnding(true)}>
            <Flag />
            <span className="label-wide"> Terminar</span>
          </button>
        )}
      </div>

      {ending && (
        <Sheet onClose={() => setEnding(false)} title="Terminar la partida" label="Terminar la partida">
          <p className="muted small" style={{ marginTop: 0 }}>
            {heretic && <strong>Hay Hereje en juego: elige ya el ganador final (invertido). </strong>}
            Para las victorias que la app no detecta sola: el Patoso, la Damisela, el Goblin… Se puede
            reabrir si te equivocas.
          </p>
          <div className="action-bar action-bar--sheet">
            <button
              className="btn"
              onClick={() => {
                setEnding(false);
                change((g) => rules.declareWinner(g, "evil"));
              }}
            >
              Gana el Mal
            </button>
            <button
              className="btn btn--gold"
              onClick={() => {
                setEnding(false);
                change((g) => rules.declareWinner(g, "good"));
              }}
            >
              Gana el Bien
            </button>
          </div>
        </Sheet>
      )}

      {game.status === "finished" ? (
        <div className={`banner banner--${game.winner}`}>
          <h2 style={{ flex: 1 }}>{game.winner === "good" ? "Ha ganado el Bien" : "Ha ganado el Mal"}</h2>
          <button className="btn btn--small" onClick={() => change(rules.reopen)}>
            Reabrir
          </button>
        </div>
      ) : note ? (
        <div className="alert alert--info" role="status">
          {note}
        </div>
      ) : succession ? (
        dismissedHint !== successionKey && (
          <div className="banner banner--evil" role="alert">
            <div style={{ flex: 1, minWidth: 200 }}>
              <h2>¿Nuevo Demonio?</h2>
              <div className="small">{succession.reason}</div>
              {succession.caveat && <div className="small muted">{succession.caveat}</div>}
              <div className="small muted">Esta noche, despiértalo y enséñale TÚ ERES y la ficha del Demonio.</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {succession.heirs.map((h) => (
                <button
                  key={h.id}
                  className="btn btn--small btn--gold"
                  onClick={() => change((g) => rules.succeedDemon(g, succession, h.id, characters))}
                >
                  {h.name} ({characters.get(h.characterId)?.name}) → {characters.get(succession.demon.characterId)?.name}
                </button>
              ))}
              <button className="btn btn--small" onClick={() => change((g) => rules.declareWinner(g, "good"))}>
                Ganan los buenos
              </button>
              <button className="btn btn--small btn--ghost" onClick={() => setDismissedHint(successionKey)}>
                Ahora no
              </button>
            </div>
          </div>
        )
      ) : (
        hint &&
        dismissedHint !== hintKey && (
          <div className={`banner banner--${hint.winner}`}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h2>{hint.winner === "good" ? "¿Gana el Bien?" : "¿Gana el Mal?"}</h2>
              <div className="small muted">{hint.reason}</div>
            </div>
            <button className="btn btn--small btn--gold" onClick={() => change((g) => rules.declareWinner(g, hint.winner))}>
              Declarar victoria
            </button>
            <button className="btn btn--small btn--ghost" onClick={() => setDismissedHint(hintKey)}>
              La partida sigue
            </button>
          </div>
        )
      )}

      {pickText && (
        <div className="pick-banner" role="status">
          <span>{pickText}</span>
          <button className={`btn btn--small ${pick?.kind === "seat" ? "btn--gold" : ""}`} onClick={() => setPick(null)}>
            {pick?.kind === "seat" ? "Listo" : "Cancelar"}
          </button>
        </div>
      )}

      <div className="game-layout">
        <div>
          <Grimoire
            game={game}
            characters={characters}
            hidden={hidden}
            highlighted={highlighted}
            picking={!!pick}
            centerNote={night && step ? `${Math.min(game.nightStep, steps.length - 1) + 1}/${steps.length} · ${step.title}` : undefined}
            onSelect={tapPlayer}
            onRemoveReminder={(pid, rid) => change((g) => rules.removeReminder(g, pid, rid))}
          />
          <FabledBar
            game={game}
            characters={characters}
            jinxes={app.catalog.jinxes()}
            onChange={change}
            onPickReminder={(sourceId, label) => {
              setPick({ kind: "reminder", sourceId, label });
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </div>

        <section className="card panel">
          <div className="tabs" role="tablist">
            <button className="tab" role="tab" aria-selected={tab === "phase"} onClick={() => setTab("phase")}>
              {night ? <Moon /> : <Sun />} {night ? "Noche" : "Día"}
            </button>
            <button className="tab" role="tab" aria-selected={tab === "ai"} onClick={() => setTab("ai")}>
              <Sparkles /> IA
            </button>
            <button className="tab" role="tab" aria-selected={tab === "log"} onClick={() => setTab("log")}>
              <ScrollText /> Registro
            </button>
          </div>
          <div className="panel__body">
            {tab === "phase" &&
              (night ? (
                <NightPanel
                  game={game}
                  steps={steps}
                  characters={characters}
                  onChange={change}
                  onOpenPlayer={setSelected}
                  onEditBluffs={() => setEditingBluffs(true)}
                  scriptCharacters={scriptCharacters}
                  onPickReminder={(sourceId, label) => {
                    setPick({ kind: "reminder", sourceId, label });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              ) : (
                <DayPanel
                  game={game}
                  characters={characters}
                  onChange={change}
                  onStartNomination={() => {
                    setPick({ kind: "nominator" });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  onStartExile={() => {
                    setPick({ kind: "exile" });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  onStartExecution={() => {
                    setPick({ kind: "execute" });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              ))}
            {tab === "ai" && <AiPanel game={game} />}
            {tab === "log" && (
              <ul className="log">
                {[...game.log].reverse().map((l, i) => (
                  <li key={i}>
                    <span className="muted small">{l.phase} · </span>
                    {l.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {player && (
        <PlayerSheet
          key={player.id}
          game={game}
          player={player}
          characters={characters}
          scriptCharacters={scriptCharacters}
          newId={app.newId}
          onChange={change}
          onClose={() => setSelected(null)}
        />
      )}

      {editingBluffs && (
        <Sheet onClose={() => setEditingBluffs(false)} title="Faroles del Demonio" label="Faroles del Demonio">
          <p className="muted small">Elige 3 personajes buenos que no estén en juego ({game.demonBluffs.length}/3).</p>
          <CharacterPicker
            characters={scriptCharacters.filter(
              (c) =>
                (c.team === "townsfolk" || c.team === "outsider") &&
                !game.players.some((p) => p.characterId === c.id || p.shownCharacterId === c.id),
            )}
            selected={game.demonBluffs}
            onToggle={(cid) =>
              change((g) =>
                rules.setBluffs(
                  g,
                  g.demonBluffs.includes(cid) ? g.demonBluffs.filter((x) => x !== cid) : [...g.demonBluffs, cid].slice(-3),
                ),
              )
            }
          />
        </Sheet>
      )}
    </main>
  );
}
