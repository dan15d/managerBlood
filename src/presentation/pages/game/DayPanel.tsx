import type { Game } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { useState } from "react";
import { Confirm } from "../../components/Sheet";
import { Gavel, Ghost, Hand, Moon } from "lucide-react";

interface Props {
  game: Game;
  onChange: (mutate: (g: Game) => Game) => void;
  /** Nominar tocando en el Grimorio: primero quién nomina y después a quién. */
  onStartNomination: () => void;
}

/** Nominaciones, votos y ejecución. El orden de voto empieza a la izquierda del nominado. */
export function DayPanel({ game, onChange, onStartNomination }: Props) {
  const [confirmDusk, setConfirmDusk] = useState(false);
  const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? "?";
  const threshold = rules.voteThreshold(game);
  const open = game.nominations.find((n) => !n.closed);
  const block = rules.onTheBlock(game);

  const voteOrder = (nomineeId: string) => {
    const seat = game.players.find((p) => p.id === nomineeId)!.seat;
    const n = game.players.length;
    return [...game.players].sort((a, b) => ((a.seat - seat - 1 + n) % n) - ((b.seat - seat - 1 + n) % n));
  };

  const endDay = () => {
    if (block && !game.executedToday) setConfirmDusk(true);
    else onChange(rules.startNight);
  };

  return (
    <div className="stack">
      {game.executedToday ? (
        <div className="alert alert--info">
          <strong>{name(game.executedToday)}</strong> ha sido ejecutado hoy. Ya no hay más nominaciones.
        </div>
      ) : open ? (
        <div className="night-card" style={{ borderColor: "var(--gold)" }}>
          <div className="small muted">
            {name(open.nominatorId)} nomina a
          </div>
          <h2>{name(open.nomineeId)}</h2>
          <p className="small muted" style={{ marginTop: -4 }}>
            Deja que se defienda. Después cuenta en el sentido del reloj, empezando por quien está a su izquierda.
          </p>
          <div className="vote-list">
            {voteOrder(open.nomineeId).map((p) => {
              const on = open.voterIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  className="vote-btn"
                  aria-pressed={on}
                  disabled={!on && !rules.canVote(p)}
                  onClick={() => onChange((g) => rules.toggleVote(g, open.id, p.id))}
                >
                  <span className="hand" aria-hidden>
                    {on ? <Hand /> : p.alive ? null : <Ghost />}
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                </button>
              );
            })}
          </div>
          <div className="row" style={{ margin: "12px 0 6px" }}>
            <span className="big-number">{open.voterIds.length}</span>
            <span className="muted">/ {threshold} necesarios</span>
          </div>
          <div className="meter">
            <div style={{ width: `${Math.min(100, (open.voterIds.length / Math.max(threshold, 1)) * 100)}%` }} />
          </div>
          <button className="btn btn--primary btn--block" style={{ marginTop: 12 }} onClick={() => onChange((g) => rules.closeNomination(g, open.id))}>
            Cerrar votación
          </button>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <button className="btn btn--primary btn--big" onClick={onStartNomination}>
            <Gavel /> Nueva nominación
          </button>
          <p className="muted small" style={{ margin: 0, textAlign: "center" }}>
            Después toca en el Grimorio a quien nomina y a quien es nominado.
          </p>
        </div>
      )}

      {game.nominations.some((n) => n.closed) && (
        <div>
          <div className="section-title">Votaciones de hoy</div>
          <ul className="log">
            {game.nominations
              .filter((n) => n.closed)
              .map((n) => (
                <li key={n.id} className="row">
                  <span style={{ flex: 1 }}>
                    {name(n.nomineeId)} <span className="muted small">(por {name(n.nominatorId)})</span>
                  </span>
                  <strong className={n.voterIds.length >= threshold ? "team-fabled" : "muted"}>{n.voterIds.length} votos</strong>
                </li>
              ))}
          </ul>
        </div>
      )}

      {!game.executedToday && (
        <div className="alert alert--info small">
          {block ? (
            <>
              En la picota: <strong>{name(block.playerId)}</strong> con {block.votes} votos.
            </>
          ) : game.nominations.some((n) => n.closed) ? (
            "Nadie está en la picota (sin votos suficientes o empate)."
          ) : (
            `Se necesitan ${threshold} votos para ejecutar. Pide nominaciones cuando hayan hablado unos minutos.`
          )}
        </div>
      )}

      <div className="action-bar">
        {block && !game.executedToday && !open && (
          <button className="btn btn--primary" onClick={() => onChange((g) => rules.execute(g, block.playerId))}>
            Ejecutar a {name(block.playerId)}
          </button>
        )}
        <button className="btn" disabled={!!open} onClick={endDay}>
          <Moon /> Anochecer
        </button>
      </div>

      {confirmDusk && block && (
        <Confirm
          title="¿Terminar el día sin ejecutar?"
          message={`${name(block.playerId)} está en la picota con ${block.votes} votos. Si anochece ahora, no se le ejecuta.`}
          confirmLabel="Anochecer sin ejecutar"
          onConfirm={() => {
            setConfirmDusk(false);
            onChange(rules.startNight);
          }}
          onCancel={() => setConfirmDusk(false)}
        />
      )}
    </div>
  );
}
