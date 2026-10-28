import type { Game } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { useState } from "react";
import { Confirm } from "../../components/Sheet";

interface Props {
  game: Game;
  newId: () => string;
  onChange: (mutate: (g: Game) => Game) => void;
}

/** Nominaciones, votos y ejecución. El orden de voto empieza a la izquierda del nominado. */
export function DayPanel({ game, newId, onChange }: Props) {
  const [nominator, setNominator] = useState("");
  const [nominee, setNominee] = useState("");
  const [confirmDusk, setConfirmDusk] = useState(false);
  const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? "?";
  const threshold = rules.voteThreshold(game);
  const open = game.nominations.find((n) => !n.closed);
  const block = rules.onTheBlock(game);
  const problem = nominator && nominee ? rules.canNominate(game, nominator, nominee) : null;

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
                    {on ? "✋" : p.alive ? "·" : "👻"}
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
        <div className="card stack" style={{ boxShadow: "none" }}>
          <h3 style={{ margin: 0 }}>Nueva nominación</h3>
          <label className="field">
            <span>Quién nomina</span>
            <select className="input" value={nominator} onChange={(e) => setNominator(e.target.value)}>
              <option value="">— Elige —</option>
              {game.players
                .filter((p) => p.alive && !game.nominations.some((n) => n.nominatorId === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.seat + 1}. {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>A quién</span>
            <select className="input" value={nominee} onChange={(e) => setNominee(e.target.value)}>
              <option value="">— Elige —</option>
              {game.players
                .filter((p) => !game.nominations.some((n) => n.nomineeId === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.seat + 1}. {p.name}
                    {p.alive ? "" : " ☠"}
                  </option>
                ))}
            </select>
          </label>
          {problem && <div className="alert alert--warning small">{problem}</div>}
          <button
            className="btn btn--primary"
            disabled={!nominator || !nominee || !!problem}
            onClick={() => {
              onChange((g) => rules.nominate(g, nominator, nominee, newId()));
              setNominator("");
              setNominee("");
            }}
          >
            Nominar
          </button>
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
          ☾ Anochecer
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
