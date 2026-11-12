import { GameConflictError, GameNotFoundError } from "@application/ports/GameRepository";
import { SaveQueue } from "@application/use-cases/SaveQueue";
import type { Character } from "@domain/entities/Character";
import type { Game } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { advanceAfterChoice } from "@domain/services/NightInfo";
import { buildNightOrder, keepNightStep } from "@domain/services/NightOrder";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage, useApp } from "../../app/AppContext";
import { CharacterPicker } from "../../components/CharacterPicker";
import { InfoTokenSheet } from "../../components/InfoTokenSheet";
import { LogList } from "../../components/LogList";
import { Menu } from "../../components/Menu";
import { Sheet } from "../../components/Sheet";
import { AiPanel } from "./AiPanel";
import { DayPanel } from "./DayPanel";
import { FabledBar } from "./FabledBar";
import { Grimoire } from "./Grimoire";
import { NightPanel } from "./NightPanel";
import { NightStrip } from "./NightStrip";
import { PhaseClock } from "./PhaseClock";
import { PlayerSheet } from "./PlayerSheet";
import { QuickSheet } from "./QuickSheet";
import { ArrowLeft, ArrowLeftRight, Eye, EyeOff, Flag, Moon, ScrollText, Smartphone, Sparkles, Sun, Undo2, WandSparkles } from "lucide-react";
import { useWakeLock } from "../../hooks/useWakeLock";

type Tab = "phase" | "ai" | "log";

const UNDO_LIMIT = 30;

/** Solo ha cambiado el paso de la noche, la cuenta atrás o la hora de guardado: nada del Grimorio. */
const onlyNavigation = (a: Game, b: Game) =>
  JSON.stringify({ ...a, nightStep: 0, timer: undefined, updatedAt: "" }) === JSON.stringify({ ...b, nightStep: 0, timer: undefined, updatedAt: "" });

/** Modo «toca una ficha»: poner un recordatorio o nominar sin abrir la hoja del jugador. */
type Pick =
  /** `advance`: es la acción principal del paso de noche; al tocar, la hoja pasa sola si no queda nada por hacer. */
  | { kind: "reminder"; sourceId: string; label: string; advance?: boolean }
  | { kind: "nominator" }
  | { kind: "nominee"; nominatorId: string }
  /** Cambiar sitios: se toca a uno y luego a otro, y se intercambian. Sigue activo hasta «Listo». */
  | { kind: "seat"; fromId?: string }
  /** Ejecutar sin votación (Virgen, Juez, Visir, locura…). */
  | { kind: "execute" }
  /** Pedir el exilio de un Viajero. */
  | { kind: "exile" }
  /** Disparo del Exterminador: primero quién dispara y después a quién. */
  | { kind: "shooter" }
  | { kind: "shot"; shooterId: string };

export function GamePage() {
  const { id } = useParams();
  const { app, toast } = useApp();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [scriptCharacters, setScriptCharacters] = useState<Character[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // Jugador tocado en el círculo: mini-hoja de acciones rápidas (la ficha entera se abre desde ella).
  const [quick, setQuick] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("phase");
  const [hidden, setHidden] = useState(false);
  const [editingBluffs, setEditingBluffs] = useState(false);
  const [dismissedHint, setDismissedHint] = useState("");
  const [pick, setPick] = useState<Pick | null>(null);
  const [ending, setEnding] = useState(false);
  const [addingFabled, setAddingFabled] = useState(false);
  const [composing, setComposing] = useState(false);
  const [pitHagTarget, setPitHagTarget] = useState<string | null>(null);
  const characters = app.catalog.map();
  const gameRef = useRef<Game | null>(null);
  // Estados anteriores para «Deshacer» (solo en esta pantalla; al recargar se pierden).
  const history = useRef<Game[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  // Versión que tiene la nube (la cargada, la recibida o la última guardada): al guardar se exige que
  // siga siendo esa, para no pisar lo que haya hecho otro dispositivo entretanto.
  const syncedAt = useRef<string | undefined>(undefined);
  // Versiones guardadas desde aquí: cuando la nube las devuelve por el canal, no son de otro.
  const ownVersions = useRef<string[]>([]);
  useWakeLock();

  useEffect(() => {
    if (!id) return;
    app.loadGame
      .execute(id)
      .then(async (g) => {
        gameRef.current = g;
        syncedAt.current = g.updatedAt;
        ownVersions.current = [g.updatedAt];
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

  /** La partida tal como está en la nube (la ha cambiado otro dispositivo): se enseña esa y se olvida lo de aquí. */
  const adopt = useCallback(
    (remote: Game | null) => {
      if (!remote) {
        toast("La partida ya no existe: se ha borrado desde otro dispositivo.", "error");
        navigate("/");
        return;
      }
      // Si allí solo se han movido por la hoja de noche, se sigue sin avisar y sin perder el «Deshacer».
      const quiet = !!gameRef.current && onlyNavigation(gameRef.current, remote);
      gameRef.current = remote;
      syncedAt.current = remote.updatedAt;
      ownVersions.current = [remote.updatedAt];
      setGame(remote);
      if (quiet) return;
      history.current = [];
      setCanUndo(false);
      toast("El Grimorio ha cambiado desde otro dispositivo.");
    },
    [navigate, toast],
  );

  // Los guardados van en cola; si uno falla (sin cobertura…) se reintenta solo hasta que entre.
  const saves = useMemo(() => {
    const queue = new SaveQueue<Game>(
      async (g) => {
        try {
          await app.saveGame.execute(g, syncedAt.current);
          syncedAt.current = g.updatedAt;
        } catch (e) {
          if (!(e instanceof GameConflictError)) throw e;
          // Otro dispositivo guardó antes: manda su versión y lo que había en cola aquí se descarta.
          // Solo si ya no existe se da por borrada; si no se puede leer (sin cobertura…), se avisa y se reintenta.
          const remote = await app.loadGame.execute(g.id).catch((err) => {
            if (err instanceof GameNotFoundError) return null;
            throw err;
          });
          queue.discard();
          adopt(remote);
        }
      },
      {
        onError: (e) => toast(`${errorMessage(e)} Se volverá a intentar solo.`, "error"),
        onRecovered: () => toast("Guardado: los móviles ya están al día."),
      },
    );
    return queue;
  }, [app, toast, adopt]);

  // Si la misma partida está abierta en otro dispositivo (el PC y el móvil), lo que se hace allí llega aquí.
  useEffect(() => {
    if (!id) return;
    return app.watchGame.execute(id, (remote) => {
      if (!gameRef.current) return;
      if (remote && ownVersions.current.includes(remote.updatedAt)) return;
      saves.discard();
      adopt(remote);
    });
  }, [app, id, saves, adopt]);

  const persist = useCallback(
    (game: Game) => {
      // Cada guardado lleva su hora, aunque la regla no la cambie (moverse por la hoja de noche):
      // así el otro dispositivo distingue cada versión.
      const next = game.updatedAt === gameRef.current?.updatedAt ? { ...game, updatedAt: new Date().toISOString() } : game;
      gameRef.current = next;
      ownVersions.current = [...ownVersions.current.slice(-49), next.updatedAt];
      setGame(next);
      void saves.save(next);
    },
    [saves],
  );

  // Reintento: al volver la conexión, al volver a la app y cada 10 segundos mientras falte guardar.
  useEffect(() => {
    const retry = () => {
      if (saves.failed && navigator.onLine !== false) void saves.retry();
    };
    const onVisible = () => document.visibilityState === "visible" && retry();
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(retry, 10_000);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [saves]);

  const undo = useCallback(() => {
    const previous = history.current.pop();
    const current = gameRef.current;
    if (!previous || !current) return;
    setCanUndo(history.current.length > 0);
    const undone = current.log.length > previous.log.length ? current.log[current.log.length - 1].text : undefined;
    // La cuenta atrás no se deshace: sigue la que hay.
    persist({ ...previous, timer: current.timer, updatedAt: new Date().toISOString() });
    toast(undone ? `Deshecho: ${undone}` : "Deshecho.", "info", { key: "change" });
  }, [persist, toast]);

  /** Aviso de lo que acaba de pasar, con «Deshacer» dentro: sustituye al anterior para que no se apilen. */
  const say = useCallback((message: string) => toast(message, "info", { key: "change", action: { label: "Deshacer", onClick: undo } }), [toast, undo]);

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
      // Si la hoja de noche cambia (pase del Diablillo, Cultivador de opio…), se sigue en el mismo paso.
      next = keepNightStep(current, next, characters);
      // Moverse por la hoja de noche no se deshace: solo lo que cambia el Grimorio.
      if (!onlyNavigation(current, next)) {
        history.current = [...history.current.slice(-(UNDO_LIMIT - 1)), current];
        setCanUndo(true);
        // Lo que el registro apunta de este cambio se avisa con «Deshacer» a mano.
        if (next.log.length > current.log.length) say(next.log[next.log.length - 1].text);
      }
      persist(next);
    },
    [persist, toast, say, characters],
  );

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
  const quickPlayer = quick ? game.players.find((p) => p.id === quick) : undefined;
  const hint = rules.victoryHint(game, characters);
  const hintKey = hint ? `${hint.winner}:${game.players.map((p) => +p.alive).join("")}` : "";
  const succession = rules.demonSuccession(game, characters);
  const successionKey = succession ? `succ:${game.phase.kind}:${game.players.map((p) => +p.alive).join("")}` : "";
  // Por qué la partida sigue aunque haya muerto el Demonio (Mente maestra, Gemela malvada).
  const note = rules.victoryNote(game, characters);
  const heretic = game.players.some((p) => p.characterId === "heretic");
  const name = (pid: string) => game.players.find((p) => p.id === pid)?.name ?? "";

  const tapPlayer = (pid: string) => {
    // Sin modo «toca»: la mini-hoja de acciones rápidas (matar, recordatorios) o la ficha entera desde ella.
    if (!pick) return setQuick(pid);
    if (pick.kind === "seat") {
      if (!pick.fromId) return setPick({ kind: "seat", fromId: pid });
      if (pick.fromId !== pid) {
        change((g) => rules.swapSeats(g, pick.fromId!, pid));
        say(`${name(pick.fromId)} y ${name(pid)} cambian de sitio.`);
      }
      return setPick({ kind: "seat" });
    }
    if (pick.kind === "reminder" && pick.sourceId === "pithag") {
      // La Pit-Hag: después de tocar al jugador se elige su nuevo personaje.
      setPitHagTarget(pid);
      return setPick(null);
    }
    if (pick.kind === "reminder") {
      // Pone el recordatorio y aplica lo que provoca (ataque del Demonio, veneno del Pukka…).
      const reminder = { id: app.newId(), sourceCharacterId: pick.sourceId, label: pick.label };
      let message = "";
      change((g) => {
        const result = rules.applyReminderChoice(g, pid, reminder, characters);
        message = result.message;
        return pick.advance ? advanceAfterChoice(g, result.game, pid, pick.sourceId, pick.label, characters) : result.game;
      });
      if (message) say(message);
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
      // El registro dice si sobrevive (Abogado del diablo, Marinero, Bufón…) y el aviso lo repite.
      change((g) => rules.executeNow(g, pid, undefined, characters));
      setPick(null);
      return setTab("phase");
    }
    if (pick.kind === "shooter") return setPick({ kind: "shot", shooterId: pid });
    if (pick.kind === "shot") {
      const shooterId = pick.shooterId;
      let message = "";
      change((g) => {
        const result = rules.slayerShot(g, shooterId, pid, characters);
        message = result.message;
        return result.game;
      });
      if (message) say(message);
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
    let died: string[] = [];
    change((g) => {
      const nominated = rules.nominate(g, nominatorId, pid, app.newId(), characters);
      // La Bruja o el Gólem pueden matar al nominar.
      died = g.players.filter((p) => p.alive && !nominated.players.find((x) => x.id === p.id)?.alive).map((p) => p.name);
      const result = rules.virginNomination(nominated, nominatorId, pid, characters);
      virgin = result;
      return result.executes
        ? rules.executeNow(result.game, nominatorId, `${name(nominatorId)} nomina a la Virgen siendo Aldeano: es ejecutado en el acto.`, characters)
        : result.game;
    });
    if (virgin.executes) say(`${name(pid)} es la Virgen y ${name(nominatorId)} es Aldeano: ${name(nominatorId)} es ejecutado en el acto.`);
    else if (virgin.spy) say(`${name(pid)} es la Virgen y la nomina el Espía: si decides que se registra como Aldeano, usa «Ejecutar sin votación».`);
    else if (died.length) say(`${died.join(" y ")} muere al nominar (${rules.witchCursed(game, nominatorId) ? "maldición de la Bruja" : "Gólem"}).`);
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
      : pick.kind === "shooter"
        ? "Toca a quien dispara (dice ser el Exterminador)"
      : pick.kind === "shot"
        ? `${name(pick.shooterId)} dispara a… toca al elegido`
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
          : pick?.kind === "execute" || pick?.kind === "shot"
            ? game.players.map((p) => p.id)
          : pick?.kind === "shooter"
            ? game.players.filter((p) => p.alive).map((p) => p.id)
            : (step?.playerIds ?? []);

  return (
    <main className="page page--wide page--flow">
      {/* Barra corta: lo de cada momento a mano (deshacer, ocultar) y el resto en el menú «…». */}
      <div className="game-bar">
        <Link to="/" className="btn btn--ghost icon-btn" aria-label="Volver a partidas">
          <ArrowLeft />
        </Link>
        <div className="game-bar__title">
          <div className="game-bar__name">{game.name}</div>
          <div className="muted small game-bar__sub">
            {game.scriptName} · {game.players.length} jugadores
          </div>
        </div>
        <button className="btn btn--ghost icon-btn" disabled={!canUndo} onClick={undo} aria-label="Deshacer" title="Deshace el último cambio del Grimorio">
          <Undo2 />
        </button>
        <button
          className="btn btn--ghost icon-btn"
          aria-pressed={hidden}
          aria-label={hidden ? "Mostrar personajes" : "Ocultar personajes"}
          onClick={() => setHidden(!hidden)}
          title="Oculta los personajes por si alguien mira la pantalla"
        >
          {hidden ? <Eye /> : <EyeOff />}
        </button>
        <Menu
          label="Más acciones"
          items={[
            { icon: <Eye />, label: "Enseñar al jugador…", onSelect: () => setComposing(true) },
            {
              icon: <ArrowLeftRight />,
              label: pick?.kind === "seat" ? "Dejar de cambiar sitios" : "Cambiar sitios",
              pressed: pick?.kind === "seat",
              onSelect: () => setPick(pick?.kind === "seat" ? null : { kind: "seat" }),
            },
            { icon: <Smartphone />, label: "Repartir personajes", onSelect: () => navigate(`/partida/${game.id}/revelar`) },
            { icon: <WandSparkles />, label: "Fábulas y Lóricos…", onSelect: () => setAddingFabled(true) },
            ...(game.status !== "finished" ? [{ icon: <Flag />, label: "Terminar la partida", danger: true, onSelect: () => setEnding(true) }] : []),
          ]}
        />
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
          {/* En el móvil, el paso de la noche y su acción principal justo bajo el círculo: sin bajar al panel. */}
          {night && step && game.status === "in_progress" && (
            <NightStrip
              game={game}
              steps={steps}
              characters={characters}
              onChange={change}
              onPickReminder={(sourceId, label) => setPick({ kind: "reminder", sourceId, label, advance: true })}
            />
          )}
          <FabledBar
            game={game}
            characters={characters}
            jinxes={app.catalog.jinxes()}
            adding={addingFabled}
            onAddingChange={setAddingFabled}
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
            {tab === "phase" && game.status === "in_progress" && <PhaseClock game={game} onChange={change} />}
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
                  onPickReminder={(sourceId, label, main) => {
                    setPick({ kind: "reminder", sourceId, label, advance: main });
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
                  onStartShot={() => {
                    setPick({ kind: "shooter" });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              ))}
            {tab === "ai" && <AiPanel game={game} />}
            {tab === "log" && <LogList log={game.log} />}
          </div>
        </section>
      </div>

      {quickPlayer && (
        <QuickSheet
          key={quickPlayer.id}
          player={quickPlayer}
          characters={characters}
          newId={app.newId}
          onChange={change}
          onOpenSheet={() => {
            setQuick(null);
            setSelected(quickPlayer.id);
          }}
          onClose={() => setQuick(null)}
        />
      )}

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

      {composing && (
        <InfoTokenSheet
          scriptCharacters={scriptCharacters}
          suggested={step?.character ? [step.character] : []}
          bluffs={game.demonBluffs.map((id) => characters.get(id)).filter((c): c is Character => !!c)}
          onClose={() => setComposing(false)}
        />
      )}

      {pitHagTarget && (
        <Sheet onClose={() => setPitHagTarget(null)} title={`¿En qué se convierte ${name(pitHagTarget)}?`} label="Personaje nuevo (Pit-Hag)">
          <p className="muted small">Solo cambia si el personaje no está en juego. Conserva su bando.</p>
          <CharacterPicker
            characters={scriptCharacters.filter((c) => c.team !== "traveller" && !game.players.some((p) => p.characterId === c.id))}
            selected={[]}
            searchable
            onToggle={(cid) => {
              const targetId = pitHagTarget;
              let message = "";
              change((g) => {
                const result = rules.pitHagChoose(g, targetId, cid, characters);
                message = result.message;
                return result.game;
              });
              setPitHagTarget(null);
              if (message) say(message);
            }}
          />
        </Sheet>
      )}
    </main>
  );
}
