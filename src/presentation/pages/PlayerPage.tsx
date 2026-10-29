import type { Character } from "@domain/entities/Character";
import { TEAM_LABEL } from "@domain/entities/Character";
import type { PlayerView } from "@domain/entities/Table";
import { TOR } from "@domain/services/SpecialRules";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage, useApp } from "../app/AppContext";
import { CharacterGuide } from "../components/CharacterGuide";
import { ScriptCharacterList } from "../components/ScriptCharacterList";
import { Confirm, Sheet } from "../components/Sheet";
import { SeatCircle } from "../components/SeatCircle";
import { Token } from "../components/Token";
import { usePlayerNotes, type SeatNote } from "../hooks/usePlayerNotes";
import { Eye, EyeOff, Flag, Moon, NotebookPen, ScrollText, Sun, Users, VenetianMask } from "lucide-react";

type Tab = "me" | "script" | "players";

/** El móvil de cada jugador: su personaje, el guion y la mesa, al día sin recargar. */
export function PlayerPage() {
  const { gameId = "", seatId = "" } = useParams();
  const { app, toast } = useApp();
  const navigate = useNavigate();
  const [view, setView] = useState<PlayerView | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("me");
  const [revealed, setRevealed] = useState(false);
  /** Se está manteniendo pulsada la ficha (al soltar se oculta). */
  const [holding, setHolding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [noting, setNoting] = useState<string | null>(null);
  const { notes, update: updateNote } = usePlayerNotes(gameId);

  useEffect(() => {
    if (!app.player) return;
    return app.player.watch(gameId, seatId, setView);
  }, [app, gameId, seatId]);

  // Cuando el Narrador cambia el personaje, se vuelve a ocultar para que nadie lo vea de rebote.
  const characterId = view?.characterId;
  useEffect(() => setRevealed(false), [characterId]);

  // A la vista se oculta solo: al salir de la app, al cambiar de pestaña o al minuto.
  useEffect(() => {
    const hide = () => document.visibilityState !== "visible" && setRevealed(false);
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    if (!revealed || holding) return;
    const timer = setTimeout(() => setRevealed(false), 60_000);
    return () => clearTimeout(timer);
  }, [revealed, holding]);
  useEffect(() => setRevealed(false), [tab]);

  const character = characterId ? app.catalog.get(characterId) : undefined;
  const alive = view?.players.filter((p) => p.alive).length ?? 0;
  const script = useMemo(
    () => (view?.characterIds ?? []).map((id) => app.catalog.get(id)).filter((c): c is Character => !!c),
    [app, view?.characterIds],
  );
  const fabled = useMemo(
    () => (view?.fabledIds ?? []).map((id) => app.catalog.get(id)).filter((c): c is Character => !!c),
    [app, view?.fabledIds],
  );

  if (view === undefined) return <main className="page page--flow muted">Conectando con la mesa…</main>;
  if (view === null) {
    return (
      <main className="page page--flow" style={{ maxWidth: 480 }}>
        <h1>Sin partida</h1>
        <p className="muted">Esta partida ya no existe o el Narrador te ha quitado de la mesa.</p>
        <Link to="/unirse" className="btn btn--primary">
          Unirme a otra
        </Link>
      </main>
    );
  }

  const leave = async () => {
    try {
      await app.player!.leave(seatId);
      navigate("/", { replace: true });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <main className="page page--flow" style={{ maxWidth: 640 }}>
      <div className="game-bar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="game-row__title">{view.name}</div>
          <div className="muted small">
            {view.scriptName} · asiento {view.seat + 1}
          </div>
        </div>
        {view.status === "lobby" ? (
          <span className="phase-pill">Sala de espera</span>
        ) : (
          <span className={`phase-pill phase-pill--${view.phaseLabel?.startsWith("Noche") ? "night" : "day"}`}>
            {view.phaseLabel?.startsWith("Noche") ? <Moon /> : view.status === "finished" ? <Flag /> : <Sun />} {view.phaseLabel}
          </span>
        )}
      </div>

      {view.status === "finished" && (
        <div className={`banner banner--${view.winner}`}>
          <h2>{view.winner === "good" ? "Ha ganado el Bien" : "Ha ganado el Mal"}</h2>
        </div>
      )}

      <div className="tabs tabs--page" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === "me"} onClick={() => setTab("me")}>
          <VenetianMask /> Mi personaje
        </button>
        <button className="tab" role="tab" aria-selected={tab === "script"} onClick={() => setTab("script")}>
          <ScrollText /> Guion
        </button>
        <button className="tab" role="tab" aria-selected={tab === "players"} onClick={() => setTab("players")}>
          <Users /> Mesa
        </button>
      </div>

      {tab === "me" &&
        (!character ? (
          <section className="reveal">
            <div className="token token--hidden" style={{ "--size": "160px" } as CSSProperties}>
              <span className="token__mark" style={{ color: "var(--muted)", filter: "none" }}>
                ?
              </span>
            </div>
            {view.status !== "lobby" && view.fabledIds.includes(TOR) ? (
              <>
                <h2>No conoces tu personaje</h2>
                <p className="muted">Se juega con Tor: nadie sabe su personaje ni su bando. Lo descubrirás al morir.</p>
              </>
            ) : (
              <>
                <h2>Esperando al Narrador…</h2>
                <p className="muted">
                  Estás en la sala. Cuando el Narrador reparta, tu personaje aparecerá aquí solo, sin recargar.
                </p>
              </>
            )}
            {view.status === "lobby" && (
              <button className="btn btn--ghost" onClick={() => setLeaving(true)}>
                Salir de la sala
              </button>
            )}
          </section>
        ) : (
          <section className="reveal" style={{ minHeight: "auto", paddingTop: 12 }}>
            {/* Mantener pulsado para mirar: al soltar se oculta. Con teclado, Intro lo muestra y lo oculta. */}
            <button
              type="button"
              className="reveal__toggle reveal__toggle--hold"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setHolding(true);
                setRevealed(true);
              }}
              onPointerUp={() => {
                if (holding) setRevealed(false);
                setHolding(false);
              }}
              onPointerCancel={() => {
                setHolding(false);
                setRevealed(false);
              }}
              onClick={(e) => e.detail === 0 && setRevealed(!revealed)}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={revealed ? "Ocultar mi personaje" : "Ver mi personaje (mantén pulsado)"}
            >
              <Token character={character} alignment={view.alignment} size={200} hidden={!revealed} dead={!view.alive} />
            </button>
            {revealed ? (
              <>
                <h1 className={`team-${character.team}`} style={{ margin: 0 }}>
                  {character.name}
                </h1>
                <span className={`badge team-${view.alignment === "evil" ? "demon" : "townsfolk"}`}>
                  {TEAM_LABEL[character.team].singular} · {view.alignment === "evil" ? "Malvado" : "Bueno"}
                </span>
                <p className="ability" style={{ textAlign: "left", maxWidth: 480 }}>
                  {character.ability}
                </p>
                {/* La guía del personaje que cree ser (el Borracho ve la de su Aldeano), sin nada de la partida. */}
                <div style={{ width: "100%", maxWidth: 480, textAlign: "left" }}>
                  <CharacterGuide key={character.id} characterId={character.id} audience="player" />
                </div>
                {!holding && (
                  <button className="btn btn--ghost" onClick={() => setRevealed(false)}>
                    <EyeOff /> Ocultar
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="muted" style={{ margin: 0 }}>
                  Mantén pulsada la ficha para mirar tu personaje; al soltar se oculta. Que nadie mire tu pantalla.
                </p>
                <button className="btn btn--ghost btn--small" onClick={() => setRevealed(true)}>
                  <Eye /> Dejarlo a la vista para leer la guía
                </button>
              </>
            )}
            <div className={`alert ${view.alive ? "alert--ok" : "alert--warning"}`} style={{ width: "100%", maxWidth: 480 }}>
              {view.alive
                ? "Estás vivo."
                : view.ghostVoteUsed
                  ? "Estás muerto y ya has gastado tu voto."
                  : "Estás muerto. Te queda un voto para el resto de la partida."}
            </div>
          </section>
        ))}

      {tab === "script" && (
        <>
          {fabled.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Anunciados por el Narrador</h2>
              <ScriptCharacterList characters={fabled} audience="player" />
            </div>
          )}
          <ScriptCharacterList characters={script} audience="player" />
        </>
      )}

      {tab === "players" && (
        <section>
          {view.players.length === 0 ? (
            <p className="muted">La lista aparecerá cuando empiece la partida.</p>
          ) : (
            <>
              <SeatCircle
                items={view.players}
                itemKey={(p) => String(p.seat)}
                center={
                  <>
                    {view.phaseLabel && (
                      <div className={`phase-pill phase-pill--${view.phaseLabel.startsWith("Noche") ? "night" : "day"}`}>
                        {view.phaseLabel.startsWith("Noche") ? <Moon /> : <Sun />} {view.phaseLabel}
                      </div>
                    )}
                    <div className="stat-row">
                      <div className="stat">
                        <span className="big-number">{alive}</span>
                        <span>vivos</span>
                      </div>
                      <div className="stat">
                        <span className="big-number">{Math.ceil(alive / 2)}</span>
                        <span title="Votos necesarios para ejecutar">votos</span>
                      </div>
                    </div>
                  </>
                }
                renderSeat={(p, size) => {
                  const traveller = p.travellerId ? app.catalog.get(p.travellerId) : undefined;
                  const me = p.seat === view.seat;
                  // Lo que dice ser según mis notas (los Viajeros enseñan su personaje real, que es público).
                  const note = notes[p.name];
                  const claimed = !traveller && note?.claim ? app.catalog.get(note.claim) : undefined;
                  return (
                    <>
                      <Token
                        character={traveller ?? claimed}
                        alignment={note?.guess}
                        size={size}
                        dead={!p.alive}
                        hidden={!traveller && !claimed}
                        dim={!!claimed}
                        glow={me}
                        onClick={me ? undefined : () => setNoting(p.name)}
                        label={`${p.name}${traveller ? `, ${traveller.name}` : claimed ? `, dice ser ${claimed.name}` : ""}${p.alive ? "" : ", muerto"}${me ? " (tú)" : ""}`}
                      />
                      <span className={`seat__name ${note?.guess === "evil" ? "seat__name--evil" : ""}`}>
                        {!p.alive && !p.ghostVoteUsed && <span title="Le queda el voto">● </span>}
                        {p.name}
                        {me && " (tú)"}
                      </span>
                    </>
                  );
                }}
              />
              <p className="muted small">
                {alive} vivos de {view.players.length}. ● = muerto al que le queda el voto. Toca a un jugador para apuntar qué dice ser y
                qué crees que es: tus notas solo se guardan en este móvil.
              </p>
              <ul className="log">
                {view.players.map((p) => (
                  <li key={p.seat} className="row" style={{ opacity: p.alive ? 1 : 0.6 }}>
                    <span className="muted" style={{ width: 24 }}>
                      {p.seat + 1}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {p.name}
                      {p.seat === view.seat && <span className="muted small"> (tú)</span>}
                      {notes[p.name] && <NoteSummary note={notes[p.name]} />}
                    </span>
                    <span className="small">{p.alive ? "Vivo" : p.ghostVoteUsed ? "Muerto, sin voto" : "Muerto, con voto"}</span>
                    {p.seat !== view.seat && (
                      <button className="btn btn--small btn--ghost icon-btn" aria-label={`Notas sobre ${p.name}`} onClick={() => setNoting(p.name)}>
                        <NotebookPen />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {noting && (
        <NotesSheet
          name={noting}
          note={notes[noting] ?? {}}
          script={script}
          onChange={(note) => updateNote(noting, note)}
          onClose={() => setNoting(null)}
        />
      )}

      {leaving && (
        <Confirm
          title="¿Salir de la sala?"
          message="Dejarás tu asiento. Puedes volver a entrar con el código mientras no empiece la partida."
          confirmLabel="Salir"
          onConfirm={leave}
          onCancel={() => setLeaving(false)}
        />
      )}
    </main>
  );
}

/** Resumen de mis notas sobre un jugador, debajo de su nombre en la lista. */
function NoteSummary({ note }: { note: SeatNote }) {
  const { app } = useApp();
  const claim = note.claim ? app.catalog.get(note.claim)?.name : undefined;
  const parts = [claim && `dice ${claim}`, note.guess && (note.guess === "good" ? "creo bueno" : "creo malo"), note.text?.trim()].filter(Boolean);
  return (
    <span className={`small ${note.guess === "evil" ? "team-demon" : "muted"}`} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {parts.join(" · ")}
    </span>
  );
}

/** Mis notas sobre otro jugador: qué dice ser, qué creo que es y lo que quiera apuntar. */
function NotesSheet(props: { name: string; note: SeatNote; script: Character[]; onChange: (note: SeatNote) => void; onClose: () => void }) {
  const { name, note, script, onChange, onClose } = props;
  const claimable = script.filter((c) => c.team !== "fabled" && c.team !== "loric");
  return (
    <Sheet onClose={onClose} title={`Notas sobre ${name}`} label={`Notas sobre ${name}`}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Solo las ves tú: se guardan en este móvil y no llegan al Narrador.
      </p>
      <label className="field">
        <span>Dice ser</span>
        <select className="input" value={note.claim ?? ""} onChange={(e) => onChange({ ...note, claim: e.target.value || undefined })}>
          <option value="">— No lo ha dicho —</option>
          {claimable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>Creo que es</span>
        <div className="chips">
          {(
            [
              [undefined, "No sé"],
              ["good", "Bueno"],
              ["evil", "Malo"],
            ] as const
          ).map(([guess, label]) => (
            <button key={label} className="chip" aria-pressed={note.guess === guess} onClick={() => onChange({ ...note, guess })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Notas</span>
        <textarea
          className="input"
          value={note.text ?? ""}
          placeholder="Qué información dijo, a quién nominó, a quién votó…"
          onChange={(e) => onChange({ ...note, text: e.target.value })}
        />
      </label>
      <div className="action-bar action-bar--sheet">
        <button className="btn btn--gold" onClick={onClose}>
          Listo
        </button>
      </div>
    </Sheet>
  );
}
