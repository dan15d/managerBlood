import type { Game } from "@domain/entities/Game";
import { useState, type Dispatch, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import { errorMessage, useApp } from "../../app/AppContext";

const QUICK = [
  "¿Qué información falsa le doy al Borracho o a los envenenados esta noche?",
  "Resume cómo va la partida y qué equipo lleva ventaja.",
  "¿Qué debería vigilar esta noche como Narrador?",
  "¿Cómo resuelvo la interacción entre los personajes en juego?",
];

/** Una pregunta al consejero y lo que respondió (o el error, que no cuenta como conversación). */
export interface AiExchange {
  q: string;
  a: string;
  error?: boolean;
}

interface Props {
  game: Game;
  /** Lo hablado hasta ahora, lo último primero. Lo guarda la página para que sobreviva al cambio de pestaña. */
  thread: AiExchange[];
  onThreadChange: Dispatch<SetStateAction<AiExchange[]>>;
}

/**
 * Consejero de IA: ve el Grimorio entero y responde dudas del Narrador. Recuerda la conversación
 * mientras la partida siga abierta, así que se puede repreguntar; no se guarda con la partida.
 */
export function AiPanel({ game, thread, onThreadChange }: Props) {
  const { app } = useApp();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setQuestion("");
    // Al consejero se le recuerda en orden, de lo más antiguo a lo más reciente, y sin los errores.
    const history = thread
      .filter((x) => !x.error)
      .map((x) => ({ question: x.q, answer: x.a }))
      .reverse();
    try {
      const a = await app.askAi.execute(game, q, history);
      onThreadChange((list) => [{ q, a }, ...list]);
    } catch (e) {
      onThreadChange((list) => [{ q, a: errorMessage(e), error: true }, ...list]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stack">
      {game.aiNotes && (
        <details className="card" style={{ boxShadow: "none" }}>
          <summary style={{ cursor: "pointer", fontFamily: "var(--font-display)" }}>Notas de la preparación</summary>
          <p style={{ whiteSpace: "pre-line", marginTop: 10 }}>{game.aiNotes}</p>
        </details>
      )}

      {!app.aiAvailable ? (
        <div className="alert alert--info">
          El consejero de IA necesita conexión con DeepSeek. <Link to="/ajustes">Configúralo en Ajustes</Link>.
        </div>
      ) : (
        <>
          <div className="chips">
            {QUICK.map((q) => (
              <button key={q} className="chip small" disabled={loading} onClick={() => ask(q)} style={{ textAlign: "left", whiteSpace: "normal" }}>
                {q}
              </button>
            ))}
          </div>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <textarea
              className="input"
              placeholder={thread.length ? "Sigue preguntando: recuerda lo que habéis hablado…" : "Pregunta lo que quieras sobre la partida…"}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <div className="row">
              <button className="btn btn--primary" style={{ flex: 1 }} disabled={!question.trim() || loading}>
                {loading ? "Pensando…" : "Preguntar"}
              </button>
              {thread.length > 0 && (
                <button type="button" className="btn btn--ghost" disabled={loading} onClick={() => onThreadChange([])}>
                  Empezar de cero
                </button>
              )}
            </div>
          </form>
          {thread.map((x, i) => (
            <div key={thread.length - i} className={`alert ${x.error ? "alert--error" : "alert--info"}`}>
              <div className="small muted" style={{ marginBottom: 6 }}>
                {x.q}
              </div>
              <div style={{ whiteSpace: "pre-line" }}>{x.a}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
