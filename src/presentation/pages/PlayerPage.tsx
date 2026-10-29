import type { Character } from "@domain/entities/Character";
import { TEAM_LABEL } from "@domain/entities/Character";
import type { PlayerView } from "@domain/entities/Table";
import { TOR } from "@domain/services/SpecialRules";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage, useApp } from "../app/AppContext";
import { CharacterGuide } from "../components/CharacterGuide";
import { ScriptCharacterList } from "../components/ScriptCharacterList";
import { Confirm } from "../components/Sheet";
import { SeatCircle } from "../components/SeatCircle";
import { Token } from "../components/Token";
import { EyeOff, Flag, Moon, ScrollText, Sun, Users, VenetianMask } from "lucide-react";

type Tab = "me" | "script" | "players";

/** El móvil de cada jugador: su personaje, el guion y la mesa, al día sin recargar. */
export function PlayerPage() {
  const { gameId = "", seatId = "" } = useParams();
  const { app, toast } = useApp();
  const navigate = useNavigate();
  const [view, setView] = useState<PlayerView | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("me");
  const [revealed, setRevealed] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!app.player) return;
    return app.player.watch(gameId, seatId, setView);
  }, [app, gameId, seatId]);

  // Cuando el Narrador cambia el personaje, se vuelve a ocultar para que nadie lo vea de rebote.
  const characterId = view?.characterId;
  useEffect(() => setRevealed(false), [characterId]);

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
            <button
              type="button"
              className="reveal__toggle"
              onClick={() => setRevealed(!revealed)}
              aria-label={revealed ? "Ocultar mi personaje" : "Ver mi personaje"}
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
                <button className="btn btn--ghost" onClick={() => setRevealed(false)}>
                  <EyeOff /> Ocultar
                </button>
              </>
            ) : (
              <p className="muted">Toca la ficha para ver tu personaje. Que nadie mire tu pantalla.</p>
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
                  return (
                    <>
                      <Token
                        character={traveller}
                        size={size}
                        dead={!p.alive}
                        hidden={!traveller}
                        glow={me}
                        label={`${p.name}${traveller ? `, ${traveller.name}` : ""}${p.alive ? "" : ", muerto"}${me ? " (tú)" : ""}`}
                      />
                      <span className="seat__name">
                        {!p.alive && !p.ghostVoteUsed && <span title="Le queda el voto">● </span>}
                        {p.name}
                        {me && " (tú)"}
                      </span>
                    </>
                  );
                }}
              />
              <p className="muted small">
                {alive} vivos de {view.players.length}. ● = muerto al que le queda el voto. Los Viajeros se ven porque son públicos.
              </p>
              <ul className="log">
                {view.players.map((p) => (
                  <li key={p.seat} className="row" style={{ opacity: p.alive ? 1 : 0.6 }}>
                    <span className="muted" style={{ width: 24 }}>
                      {p.seat + 1}
                    </span>
                    <span style={{ flex: 1 }}>
                      {p.name}
                      {p.seat === view.seat && <span className="muted small"> (tú)</span>}
                    </span>
                    <span className="small">{p.alive ? "Vivo" : p.ghostVoteUsed ? "Muerto, sin voto" : "Muerto, con voto"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
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
