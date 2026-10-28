import type { Game } from "@domain/entities/Game";
import { useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage, useApp } from "../../app/AppContext";

const QUICK = [
  "¿Qué información falsa le doy al Borracho o a los envenenados esta noche?",
  "Resume cómo va la partida y qué equipo lleva ventaja.",
  "¿Qué debería vigilar esta noche como Narrador?",
  "¿Cómo resuelvo la interacción entre los personajes en juego?",
];

/** Consejero de IA: ve el Grimorio entero y responde dudas del Narrador. Las respuestas no se guardan. */
export function AiPanel({ game }: { game: Game }) {
  const { app } = useApp();
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<{ q: string; a: string; error?: boolean }[]>([]);
  const [loading, setLoading] = useState(false);

  const ask = async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setQuestion("");
    try {
      const a = await app.askAi.execute(game, q);
      setAnswers((list) => [{ q, a }, ...list]);
    } catch (e) {
      setAnswers((list) => [{ q, a: errorMessage(e), error: true }, ...list]);
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
          El consejero de IA necesita conexión con OpenRouter. <Link to="/ajustes">Configúralo en Ajustes</Link>.
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
              placeholder="Pregunta lo que quieras sobre la partida…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button className="btn btn--primary" disabled={!question.trim() || loading}>
              {loading ? "Pensando…" : "Preguntar"}
            </button>
          </form>
          {answers.map((x, i) => (
            <div key={i} className={`alert ${x.error ? "alert--error" : "alert--info"}`}>
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
