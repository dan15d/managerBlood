import type { Character } from "@domain/entities/Character";
import type { Game } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { useState } from "react";
import { Confirm, Sheet } from "../../components/Sheet";
import { Gavel, Ghost, Hand, Moon } from "lucide-react";

interface Props {
  game: Game;
  characters: Map<string, Character>;
  onChange: (mutate: (g: Game) => Game) => void;
  /** Nominar tocando en el Grimorio: primero quién nomina y después a quién. */
  onStartNomination: () => void;
  /** Ejecutar sin votación tocando al jugador en el Grimorio (Virgen, Juez, Visir…). */
  onStartExecution: () => void;
}

/** Nominaciones, votos y ejecución. El orden de voto empieza a la izquierda del nominado. */
export function DayPanel({ game, characters, onChange, onStartNomination, onStartExecution }: Props) {
  const [confirmDusk, setConfirmDusk] = useState(false);
  /** Recordatorios marcados para quitar al anochecer (null: la hoja está cerrada). */
  const [cleaning, setCleaning] = useState<string[] | null>(null);
  /** Victoria que se decide al anochecer (Vortox, Alcalde, Leviatán…). */
  const [duskWin, setDuskWin] = useState<rules.VictoryHint | null>(null);
  const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? "?";
  const threshold = rules.voteThreshold(game);
  const open = game.nominations.find((n) => !n.closed);
  const votes = open ? rules.voteCount(game, open) : 0;
  const block = rules.onTheBlock(game);

  const voteOrder = (nomineeId: string) => {
    const seat = game.players.find((p) => p.id === nomineeId)!.seat;
    const n = game.players.length;
    return [...game.players].sort((a, b) => ((a.seat - seat - 1 + n) % n) - ((b.seat - seat - 1 + n) % n));
  };

  // Al anochecer se proponen para quitar los recordatorios que solo valían una noche y un día.
  const expiring = rules.expiringReminders(game);
  const goToNight = () => {
    if (expiring.length) {
      setCleaning(expiring.map((e) => e.reminder.id));
      return;
    }
    onChange(rules.startNight);
  };
  // Victorias que se deciden al acabar el día (Vortox o Alcalde sin ejecución, Leviatán tras el día 5).
  const checkDuskVictory = () => {
    const win = rules.duskVictory(game, characters);
    if (win) setDuskWin(win);
    else goToNight();
  };
  const endDay = () => {
    if (block && !game.executedToday) setConfirmDusk(true);
    else checkDuskVictory();
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
              // Burócrata (×3) y Ladrón (−1): su voto no vale 1.
              const weight = rules.voteWeight(p);
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
                  {weight !== 1 && <span className="vote-weight">{weight > 0 ? `×${weight}` : "−1"}</span>}
                </button>
              );
            })}
          </div>
          <div className="row" style={{ margin: "12px 0 6px" }}>
            <span className="big-number">{votes}</span>
            <span className="muted">/ {threshold} necesarios</span>
          </div>
          <div className="meter">
            <div style={{ width: `${Math.max(0, Math.min(100, (votes / Math.max(threshold, 1)) * 100))}%` }} />
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
          <button className="btn btn--small btn--ghost" style={{ alignSelf: "center" }} onClick={onStartExecution}>
            Ejecutar sin votación…
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
                  <strong className={rules.voteCount(game, n) >= threshold ? "team-fabled" : "muted"}>{rules.voteCount(game, n)} votos</strong>
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
            checkDuskVictory();
          }}
          onCancel={() => setConfirmDusk(false)}
        />
      )}
      {duskWin && (
        <Sheet onClose={() => setDuskWin(null)} title={duskWin.winner === "good" ? "¿Gana el Bien?" : "¿Gana el Mal?"} label="Victoria al anochecer">
          <p style={{ marginTop: 0 }}>{duskWin.reason}</p>
          <p className="muted small">
            Si su habilidad no funciona hoy (está borracho o envenenado), la partida sigue.
          </p>
          <div className="action-bar action-bar--sheet">
            <button
              className="btn"
              onClick={() => {
                setDuskWin(null);
                goToNight();
              }}
            >
              <Moon /> La partida sigue
            </button>
            <button
              className="btn btn--gold"
              onClick={() => {
                const winner = duskWin.winner;
                setDuskWin(null);
                onChange((g) => rules.declareWinner(g, winner));
              }}
            >
              {duskWin.winner === "good" ? "Gana el Bien" : "Gana el Mal"}
            </button>
          </div>
        </Sheet>
      )}
      {cleaning && (
        <Sheet onClose={() => setCleaning(null)} title="Antes de anochecer" label="Recordatorios que caducan">
          <p className="muted small" style={{ marginTop: 0 }}>
            Estos recordatorios solo valían anoche y hoy. Marcados, se quitan; toca los que quieras dejar.
          </p>
          <div className="chips">
            {expiring.map(({ playerId, reminder }) => {
              const on = cleaning.includes(reminder.id);
              const source = characters.get(reminder.sourceCharacterId);
              return (
                <button
                  key={reminder.id}
                  className="chip"
                  aria-pressed={on}
                  onClick={() => setCleaning(on ? cleaning.filter((x) => x !== reminder.id) : [...cleaning, reminder.id])}
                >
                  {reminder.label}
                  {source ? ` (${source.name})` : ""} · {name(playerId)}
                </button>
              );
            })}
          </div>
          <div className="action-bar action-bar--sheet">
            <button
              className="btn"
              onClick={() => {
                setCleaning(null);
                onChange(rules.startNight);
              }}
            >
              No quitar nada
            </button>
            <button
              className="btn btn--primary"
              onClick={() => {
                const ids = cleaning;
                setCleaning(null);
                onChange((g) => rules.startNight(rules.removeReminders(g, ids)));
              }}
            >
              <Moon /> Quitar {cleaning.length} y anochecer
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
