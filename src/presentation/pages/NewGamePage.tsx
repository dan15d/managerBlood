import type { SetupStyle } from "@application/ports/AiStoryteller";
import { TEAM_LABEL, type Character } from "@domain/entities/Character";
import type { GameMode } from "@domain/entities/Game";
import type { Script } from "@domain/entities/Script";
import type { Lobby, Seat } from "@domain/entities/Table";
import {
  baseDistribution,
  MAX_PLAYERS,
  maxTravellers,
  MIN_PLAYERS,
  targetDistribution,
  travellerCount,
  travellerSeats,
  validateSelection,
} from "@domain/services/SetupRules";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage, useApp } from "../app/AppContext";
import { CharacterPicker, DistributionBar } from "../components/CharacterPicker";
import { LobbyPanel } from "../components/LobbyPanel";
import { Token } from "../components/Token";
import { useAsync } from "../hooks/useAsync";
import { EditionBanner } from "../components/EditionBanner";
import { BookOpen, Check, Dices, PenLine, Pencil, Scale, Search, Shuffle, Skull, Sparkles, Sprout, Tornado, VenetianMask } from "lucide-react";

const STEPS = ["Modo", "Guion", "Jugadores", "Personajes", "Reparto"] as const;

const STYLES: { id: SetupStyle; label: string; icon: ReactNode }[] = [
  { id: "equilibrada", label: "Equilibrada", icon: <Scale /> },
  { id: "principiantes", label: "Para principiantes", icon: <Sprout /> },
  { id: "mucha_info", label: "Mucha información", icon: <Search /> },
  { id: "caotica", label: "Caótica", icon: <Tornado /> },
  { id: "maligna", label: "Ventaja al Mal", icon: <Skull /> },
];

const NAMES_KEY = "grimorio.lastNames";
const loadNames = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(NAMES_KEY) ?? "[]");
  } catch {
    return [];
  }
};

export function NewGamePage() {
  const { app, toast } = useApp();
  const navigate = useNavigate();
  const scripts = useAsync(() => app.listScripts.execute(), [app]);

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<GameMode | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [playerCount, setPlayerCount] = useState(() => Math.max(MIN_PLAYERS, loadNames().length || 8));
  const [names, setNames] = useState<string[]>(loadNames);
  const [selected, setSelected] = useState<string[]>([]);
  const [decoys, setDecoys] = useState<Record<string, string>>({});
  const [bluffs, setBluffs] = useState<string[]>([]);
  const [travellers, setTravellers] = useState<string[]>([]);
  // Viajero → asiento que ha elegido el Narrador (si no, ocupan los últimos asientos).
  const [chosenTravellerSeats, setChosenTravellerSeats] = useState<Record<string, number>>({});
  const [style, setStyle] = useState<SetupStyle>("equilibrada");
  const [extra, setExtra] = useState("");
  const [aiNotes, setAiNotes] = useState<{ explanation?: string; tips?: string[] } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [editingAi, setEditingAi] = useState(false);
  const [manualSeats, setManualSeats] = useState(false);
  const [assignment, setAssignment] = useState<Record<number, string>>({});
  const [gameName, setGameName] = useState("");
  const [creating, setCreating] = useState(false);
  // Con la nube, los jugadores se unen a una sala y sus nombres forman los asientos.
  const [params] = useSearchParams();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [openingLobby, setOpeningLobby] = useState(false);

  // Guion elegido desde su ficha (?guion=id): al escoger el modo se va directo a la sala.
  const preselected = scripts.data?.find((s) => s.id === params.get("guion"));
  const chooseMode = (m: GameMode) => {
    setMode(m);
    if (preselected && !lobby) void chooseScript(preselected);
    else setStep(1);
  };

  // Retomar una sala abierta desde la portada (?sala=id).
  const resumeId = params.get("sala");
  useEffect(() => {
    if (!resumeId || !app.lobby || !scripts.data) return;
    void app.lobby.get(resumeId).then((l) => {
      if (!l) return;
      setLobby(l);
      setScript(scripts.data!.find((s) => s.id === l.scriptId) ?? null);
      setMode((m) => m ?? "manual");
      setStep(2);
    });
  }, [app, resumeId, scripts.data]);

  useEffect(() => {
    if (!lobby || !app.lobby) return;
    return app.lobby.watch(lobby.gameId, setSeats);
  }, [app, lobby]);

  // En la sala, el número de jugadores y sus nombres salen de quién se ha unido.
  useEffect(() => {
    if (!lobby) return;
    setNames(seats.map((s) => s.name));
    if (playerCount !== seats.length) {
      // Si entra o sale alguien, la bolsa elegida ya no cuadra.
      setPlayerCount(seats.length);
      setSelected([]);
      setAssignment({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby, seats]);

  const pool = useMemo(
    () => (script ? script.characterIds.map((id) => app.catalog.get(id)).filter((c): c is Character => !!c) : []),
    [app, script],
  );
  const travellerPool = useMemo(() => {
    const own = pool.filter((c) => c.team === "traveller");
    return own.length ? own : app.catalog.all().filter((c) => c.team === "traveller");
  }, [app, pool]);
  const forcedTravellers = travellerCount(playerCount);
  const bagCount = playerCount - Math.max(travellers.length, forcedTravellers);
  const travellerBySeat = travellerSeats(playerCount, travellers, chosenTravellerSeats);
  const bagSeats = Array.from({ length: playerCount }, (_, seat) => seat).filter((seat) => !(seat in travellerBySeat));
  const bagAssignment = Object.fromEntries(Object.entries(assignment).filter(([seat]) => bagSeats.includes(Number(seat))));
  const chosen = selected.map((id) => app.catalog.get(id)!).filter(Boolean);
  const issues = validateSelection(bagCount, chosen);
  const errors = issues.filter((i) => i.level === "error");
  const target = targetDistribution(bagCount, chosen);
  const playerNames = Array.from({ length: playerCount }, (_, i) => names[i]?.trim() || `Jugador ${i + 1}`);

  // Si quedan menos jugadores, sobran Viajeros: la bolsa nunca baja de 5.
  useEffect(() => {
    if (travellers.length > maxTravellers(playerCount)) setTravellers((t) => t.slice(0, maxTravellers(playerCount)));
  }, [playerCount, travellers.length]);

  // En el móvil, que el paso actual se vea en la tira de pasos.
  useEffect(() => {
    document.querySelector(".steps__item--current")?.scrollIntoView({ inline: "center", block: "nearest" });
    window.scrollTo(0, 0);
  }, [step]);

  // Cada vez que cambia la bolsa, se completan los engaños (Borracho…) y los faroles.
  useEffect(() => {
    if (!script || !selected.length) return;
    const done = app.completeManualSetup.execute(script, selected, { decoys, bluffIds: bluffs });
    if (JSON.stringify(done.decoys) !== JSON.stringify(decoys)) setDecoys(done.decoys);
    if (JSON.stringify(done.bluffIds) !== JSON.stringify(bluffs)) setBluffs(done.bluffIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, script, selected]);

  const resetSelection = () => {
    setSelected([]);
    setDecoys({});
    setBluffs([]);
    setAiNotes(null);
    setEditingAi(false);
    setAssignment({});
  };

  const randomize = () => {
    if (!script) return;
    try {
      const p = app.suggestRandomSetup.execute(script, bagCount);
      setSelected(p.characterIds);
      setDecoys(p.decoys);
      setBluffs(p.bluffIds);
      setAssignment({});
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const askAi = async () => {
    if (!script) return;
    setAiLoading(true);
    try {
      const p = await app.generateAiSetup.execute({ script, playerNames: playerNames.slice(0, bagCount), style, extraInstructions: extra });
      setSelected(p.characterIds);
      setDecoys(p.decoys);
      setBluffs(p.bluffIds);
      setAiNotes({ explanation: p.explanation, tips: p.tips });
      setAssignment({});
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setAiLoading(false);
    }
  };

  const chooseScript = async (s: Script) => {
    if (script?.id !== s.id) resetSelection();
    if (app.lobby) {
      setOpeningLobby(true);
      try {
        if (!lobby) setLobby(await app.lobby.open(s));
        else if (lobby.scriptId !== s.id) {
          await app.lobby.changeScript(lobby.gameId, s);
          setLobby({ ...lobby, scriptId: s.id, scriptName: s.name, characterIds: s.characterIds });
        }
      } catch (e) {
        toast(errorMessage(e), "error");
        return;
      } finally {
        setOpeningLobby(false);
      }
    }
    setScript(s);
    setStep(2);
  };

  const canAdvance = [
    !!mode,
    !!script,
    lobby ? seats.length >= MIN_PLAYERS : playerCount >= MIN_PLAYERS,
    selected.length > 0 && errors.length === 0 && travellers.length >= forcedTravellers,
    !manualSeats || Object.keys(bagAssignment).length === bagCount,
  ][step];

  const create = async () => {
    if (!script || !mode) return;
    setCreating(true);
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(playerNames));
    } catch {
      /* sin almacenamiento */
    }
    try {
      const notes = aiNotes
        ? [aiNotes.explanation, ...(aiNotes.tips ?? []).map((t) => `• ${t}`)].filter(Boolean).join("\n")
        : undefined;
      const game = await app.createGame.execute({
        name: gameName,
        mode,
        script,
        playerNames,
        characterIds: selected,
        bluffIds: bluffs,
        decoys,
        assignment: manualSeats ? bagAssignment : undefined,
        travellers: travellerBySeat,
        aiNotes: notes,
        table: lobby ? { gameId: lobby.gameId, joinCode: lobby.joinCode, seats } : undefined,
      });
      navigate(`/partida/${game.id}`, { replace: true });
    } catch (e) {
      toast(errorMessage(e), "error");
      setCreating(false);
    }
  };

  const next = () => (step === STEPS.length - 1 ? create() : setStep(step + 1));

  return (
    <main className="page page--flow">
      <nav className="steps" aria-label="Pasos">
        {STEPS.map((label, i) => (
          <button
            key={label}
            className={`steps__item ${i === step ? "steps__item--current" : i < step ? "steps__item--done" : ""}`}
            disabled={i > step}
            onClick={() => setStep(i)}
            aria-current={i === step ? "step" : undefined}
          >
            <span className="steps__num">{i < step ? <Check /> : i + 1}</span>
            {label}
          </button>
        ))}
      </nav>

      {step === 0 && (
        <section>
          <h1>¿Cómo quieres narrar?</h1>
          <div className="grid">
            <ModeCard
              icon={<BookOpen />}
              title="Manual"
              text="Tú eliges los personajes de la bolsa (o pides un reparto al azar). Control total."
              selected={mode === "manual"}
              onClick={() => chooseMode("manual")}
            />
            <ModeCard
              icon={<Sparkles />}
              title="Con IA"
              text="La IA prepara un reparto equilibrado según el estilo que pidas, te explica por qué y te aconseja durante la partida."
              selected={mode === "ai"}
              disabled={!app.aiAvailable}
              onClick={() => chooseMode("ai")}
            />
          </div>
          {!app.aiAvailable && (
            <p className="muted small" style={{ marginTop: 12 }}>
              El modo IA necesita conexión con OpenRouter. <Link to="/ajustes">Configúralo en Ajustes</Link>.
            </p>
          )}
        </section>
      )}

      {step === 1 && (
        <section>
          <h1>Elige el guion</h1>
          <div className="grid">
            {scripts.data?.map((s) => (
              <button
                key={s.id}
                className={`card card--interactive edition-card ${script?.id === s.id ? "card--selected" : ""}`}
                disabled={openingLobby}
                onClick={() => void chooseScript(s)}
              >
                <EditionBanner scriptId={s.id} name={s.name} image={s.image} />
                <div className="edition-card__body">
                  <p className="muted small" style={{ margin: 0 }}>
                    {s.description ? `${s.description.slice(0, 120)}${s.description.length > 120 ? "…" : ""}` : s.author || "Guion personalizado"}
                  </p>
                  {s.recommendedMinPlayers && s.recommendedMinPlayers > 5 && (
                    <p className="small team-fabled" style={{ margin: "6px 0 0" }}>
                      Recomendado con {s.recommendedMinPlayers} o más jugadores
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
          <p style={{ marginTop: 16 }}>
            <Link to="/guiones/nuevo">+ Crear un guion personalizado</Link>
          </p>
        </section>
      )}

      {step === 2 && lobby && (
        <section className="stack">
          <h1>Sala de espera</h1>
          <p className="muted" style={{ marginTop: -8 }}>
            Que cada jugador escanee el QR o entre con el código. Necesitas al menos {MIN_PLAYERS}.
          </p>
          <LobbyPanel lobby={lobby} seats={seats} />
          {seats.length >= MIN_PLAYERS && (
            <DistributionBar distribution={baseDistribution(seats.length)} travellers={travellerCount(seats.length)} />
          )}
        </section>
      )}

      {step === 2 && !lobby && (
        <section className="stack">
          <h1>¿Cuántos jugadores?</h1>
          <div className="card stack" style={{ alignItems: "center" }}>
            <div className="stepper">
              <button
                className="btn"
                aria-label="Menos jugadores"
                disabled={playerCount <= MIN_PLAYERS}
                onClick={() => {
                  setPlayerCount(playerCount - 1);
                  resetSelection();
                }}
              >
                −
              </button>
              <span className="stepper__value" aria-live="polite">
                {playerCount}
              </span>
              <button
                className="btn"
                aria-label="Más jugadores"
                disabled={playerCount >= MAX_PLAYERS}
                onClick={() => {
                  setPlayerCount(playerCount + 1);
                  resetSelection();
                }}
              >
                +
              </button>
            </div>
            <DistributionBar distribution={baseDistribution(playerCount)} travellers={travellerCount(playerCount)} />
            {script?.recommendedMinPlayers && playerCount < script.recommendedMinPlayers && (
              <div className="alert alert--warning small">
                {script.name} se recomienda con {script.recommendedMinPlayers} o más jugadores.
              </div>
            )}
          </div>
          <h2 style={{ marginTop: 8 }}>Nombres</h2>
          <p className="muted small" style={{ marginTop: -6 }}>
            En el orden en que están sentados, en el sentido de las agujas del reloj. Opcional.
          </p>
          <div className="names-grid">
            {Array.from({ length: playerCount }, (_, i) => (
              <label key={i} className="seat-input">
                <span className="seat-input__num">{i + 1}</span>
                <input
                  className="input"
                  value={names[i] ?? ""}
                  placeholder={`Jugador ${i + 1}`}
                  enterKeyHint="next"
                  onChange={(e) => {
                    const copy = [...names];
                    copy[i] = e.target.value;
                    setNames(copy);
                  }}
                />
              </label>
            ))}
          </div>
          {names.some(Boolean) && (
            <button className="btn btn--ghost btn--small" style={{ alignSelf: "flex-start" }} onClick={() => setNames([])}>
              Borrar nombres
            </button>
          )}
        </section>
      )}

      {step === 3 && script && (
        <section>
          <h1>Personajes</h1>

          <details className="card travellers-card" open={forcedTravellers > 0 || travellers.length > 0}>
            <summary>
              <span className="team-traveller">{TEAM_LABEL.traveller.plural}</span>
              <span className="muted small">{forcedTravellers > 0 ? `al menos ${forcedTravellers}` : "opcional"}</span>
              <span className="spacer" />
              {travellers.length > 0 && <span className="counter">{travellers.length}</span>}
            </summary>
            <p className="muted small">
              {forcedTravellers > 0
                ? `Con más de 15 jugadores, al menos ${forcedTravellers} juegan como Viajeros. `
                : "Para quien llega tarde o se va antes. "}
              No salen de la bolsa: cada Viajero es un jugador menos en ella ({bagCount} en la bolsa). En el último paso eliges
              quién es cada uno; su bando lo decides tú desde su ficha en el Grimorio.
            </p>
            <CharacterPicker
              characters={travellerPool}
              teams={["traveller"]}
              selected={travellers}
              onToggle={(id) =>
                setTravellers((t) =>
                  t.includes(id) ? t.filter((x) => x !== id) : t.length < maxTravellers(playerCount) ? [...t, id] : t,
                )
              }
            />
          </details>

          {mode === "ai" && !editingAi && (
            <div className="card stack" style={{ marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>¿Qué partida quieres?</h2>
              <div className="chips">
                {STYLES.map((s) => (
                  <button key={s.id} className="chip" aria-pressed={style === s.id} onClick={() => setStyle(s.id)}>
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
              <textarea
                className="input"
                placeholder="Indicaciones opcionales: «que salga el Barón», «sin Borracho», «es la primera partida de Ana»…"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
              <button className="btn btn--primary btn--block" onClick={askAi} disabled={aiLoading}>
                <Sparkles /> {aiLoading ? "La IA está pensando…" : selected.length ? "Otra propuesta" : "Preparar reparto con IA"}
              </button>
            </div>
          )}

          {mode === "ai" && aiNotes && !editingAi && (
            <div className="card stack" style={{ marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>La propuesta</h2>
              <BagPreview characters={chosen} />
              {aiNotes.explanation && <p className="ability">{aiNotes.explanation}</p>}
              {!!aiNotes.tips?.length && (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {aiNotes.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
              <button className="btn btn--small" style={{ alignSelf: "flex-start" }} onClick={() => setEditingAi(true)}>
                <Pencil /> Retocar a mano
              </button>
            </div>
          )}

          {(mode === "manual" || editingAi) && (
            <>
              <div className="sticky-bar">
                <div className="row">
                  <DistributionBar distribution={target} />
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn btn--small btn--gold" onClick={randomize}>
                    <Dices /> Al azar
                  </button>
                  <button className="btn btn--small btn--ghost" onClick={resetSelection} disabled={!selected.length}>
                    Vaciar
                  </button>
                  <span className="spacer" />
                  <span className={`counter ${selected.length === bagCount ? "counter--ok" : ""}`}>
                    {selected.length}/{bagCount}
                  </span>
                </div>
              </div>
              <CharacterPicker
                characters={pool}
                teams={["townsfolk", "outsider", "minion", "demon"]}
                selected={selected}
                target={target}
                onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
              />
            </>
          )}

          {selected.length > 0 && (
            <div className="stack" style={{ marginTop: 8 }}>
              {issues.map((i) => (
                <div key={i.message} className={`alert alert--${i.level === "error" ? "error" : "warning"} small`}>
                  {i.message}
                </div>
              ))}
              <DecoyAndBluffs
                pool={pool}
                selected={selected}
                decoys={decoys}
                bluffs={bluffs}
                onDecoy={(id, shown) => setDecoys({ ...decoys, [id]: shown })}
                onBluffs={setBluffs}
              />
            </div>
          )}

        </section>
      )}

      {step === 4 && script && (
        <section className="stack">
          <h1>Reparto</h1>
          <div className="card stack">
            <label className="field">
              <span>Nombre de la partida</span>
              <input
                className="input"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                placeholder={`${script.name} · ${new Date().toLocaleDateString("es-ES")}`}
              />
            </label>
          </div>
          <div className="grid">
            <ModeCard
              icon={<Shuffle />}
              title="Sacar de la bolsa"
              text="Los personajes se reparten al azar entre los asientos, como en la mesa."
              selected={!manualSeats}
              onClick={() => setManualSeats(false)}
            />
            <ModeCard
              icon={<PenLine />}
              title="Asignar a mano"
              text="Ya habéis sacado las fichas físicas: indica qué le tocó a cada uno."
              selected={manualSeats}
              onClick={() => setManualSeats(true)}
            />
          </div>
          {travellers.length > 0 && (
            <div className="card stack">
              <h2 style={{ margin: 0 }}>¿Quién es Viajero?</h2>
              {travellers.map((id) => {
                const seat = Number(Object.keys(travellerBySeat).find((s) => travellerBySeat[Number(s)] === id));
                return (
                  <label key={id} className="seat-input">
                    <span className="team-traveller" style={{ flex: "0 0 40%", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {app.catalog.get(id)?.name}
                    </span>
                    <select
                      className="input"
                      value={seat}
                      onChange={(e) => setChosenTravellerSeats({ ...chosenTravellerSeats, [id]: Number(e.target.value) })}
                    >
                      {playerNames.map((n, s) => (
                        <option key={s} value={s} disabled={s in travellerBySeat && travellerBySeat[s] !== id}>
                          {s + 1}. {n}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          )}
          {manualSeats && (
            <div className="card stack">
              {bagSeats.map((seat) => (
                <label key={seat} className="seat-input">
                  <span className="seat-input__num">{seat + 1}</span>
                  <span style={{ flex: "0 0 30%", overflow: "hidden", textOverflow: "ellipsis" }}>{playerNames[seat]}</span>
                  <select
                    className="input"
                    value={bagAssignment[seat] ?? ""}
                    onChange={(e) => {
                      const copy = { ...bagAssignment };
                      if (e.target.value) copy[seat] = e.target.value;
                      else delete copy[seat];
                      setAssignment(copy);
                    }}
                  >
                    <option value="">— Elige —</option>
                    {chosen
                      .filter((c) => bagAssignment[seat] === c.id || !Object.values(bagAssignment).includes(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          <div className="alert alert--info small">
            Al empezar irás al Grimorio. Desde allí puedes pasar el móvil para que cada jugador vea su personaje en secreto.
          </div>
        </section>
      )}

      <div className="wizard-footer">
        <button className="btn btn--ghost" onClick={() => (step ? setStep(step - 1) : navigate("/"))}>
          {step ? "Atrás" : "Cancelar"}
        </button>
        {step > 0 && (
          <button className="btn btn--primary" disabled={!canAdvance || creating} onClick={next}>
            {step === STEPS.length - 1 ? (creating ? "Preparando…" : "Empezar partida") : "Siguiente"}
          </button>
        )}
      </div>
    </main>
  );
}

function ModeCard(props: { icon: ReactNode; title: string; text: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className={`card card--interactive mode-card ${props.selected ? "card--selected" : ""}`}
      onClick={props.onClick}
      disabled={props.disabled}
      style={props.disabled ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
    >
      <span className="mode-card__icon" aria-hidden>
        {props.icon}
      </span>
      <h2 style={{ margin: 0 }}>{props.title}</h2>
      <span className="muted">{props.text}</span>
    </button>
  );
}

function BagPreview({ characters }: { characters: Character[] }) {
  const order = ["townsfolk", "outsider", "minion", "demon"];
  return (
    <div className="row" style={{ gap: 12 }}>
      {[...characters]
        .sort((a, b) => order.indexOf(a.team) - order.indexOf(b.team))
        .map((c) => (
          <Token key={c.id} character={c} size={64} />
        ))}
    </div>
  );
}

function DecoyAndBluffs(props: {
  pool: Character[];
  selected: string[];
  decoys: Record<string, string>;
  bluffs: string[];
  onDecoy: (id: string, shown: string) => void;
  onBluffs: (ids: string[]) => void;
}) {
  const { pool, selected, decoys, bluffs } = props;
  const taken = new Set([...selected, ...Object.values(decoys)]);
  const name = (id: string) => pool.find((c) => c.id === id)?.name ?? id;
  const good = pool.filter((c) => (c.team === "townsfolk" || c.team === "outsider") && !taken.has(c.id));

  return (
    <div className="card stack">
      {Object.entries(decoys).map(([id, shown]) => {
        const team = pool.find((c) => c.id === shown)?.team;
        const options = pool.filter((c) => c.team === team && (c.id === shown || !taken.has(c.id)));
        return (
          <label key={id} className="field">
            <span><VenetianMask /> {name(id)} cree ser</span>
            <select className="input" value={shown} onChange={(e) => props.onDecoy(id, e.target.value)}>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      <div className="field">
        <span>Faroles del Demonio (no están en juego)</span>
        <div className="stack" style={{ gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <select
              key={i}
              className="input"
              value={bluffs[i] ?? ""}
              onChange={(e) => {
                const copy = [...bluffs];
                copy[i] = e.target.value;
                props.onBluffs(copy.filter(Boolean));
              }}
            >
              {bluffs[i] && <option value={bluffs[i]}>{name(bluffs[i])}</option>}
              {!bluffs[i] && <option value="">— Elige —</option>}
              {good
                .filter((c) => !bluffs.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          ))}
        </div>
      </div>
    </div>
  );
}
