import type { AiScriptSwap } from "@application/ports/AiStoryteller";
import type { ScriptReview } from "@application/use-cases/AiScriptUseCases";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage, useApp } from "../app/AppContext";
import { Sheet } from "./Sheet";
import { Token } from "./Token";

/**
 * Revisión de un guion con IA. La revisión vive en la página, no en la hoja: al cerrarla y volver a
 * abrirla se enseña la misma, y solo se gasta otra consulta si el Narrador pide revisar otra vez.
 */
export function useScriptReview() {
  const { app } = useApp();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<ScriptReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(
    async (name: string, characterIds: string[]) => {
      setLoading(true);
      setError("");
      try {
        setReview(await app.reviewAiScript.execute({ name, characterIds }));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [app],
  );

  /** Abre la hoja; la primera vez (o si la anterior falló) lanza la revisión. */
  const start = (name: string, characterIds: string[]) => {
    setOpen(true);
    if (app.aiAvailable && !review && !loading) void run(name, characterIds);
  };

  return { open, review, loading, error, run, start, close: () => setOpen(false) };
}

interface Props {
  state: ReturnType<typeof useScriptReview>;
  name: string;
  characterIds: string[];
  /** Si se pasa, cada cambio propuesto lleva un botón para aplicarlo al guion que se está editando. */
  onApply?: (swap: AiScriptSwap) => void;
}

export function ScriptReviewSheet({ state, name, characterIds, onApply }: Props) {
  const { app } = useApp();
  const { review, loading, error } = state;
  const inScript = new Set(characterIds);
  const isApplied = (swap: AiScriptSwap) => !inScript.has(swap.removeId) && inScript.has(swap.addId);
  // Aplicar los cambios propuestos no cuenta como «el guion ha cambiado»: solo lo que se toque aparte.
  const expected = review?.reviewedIds.map((id) => review.swaps.find((s) => s.removeId === id && isApplied(s))?.addId ?? id) ?? [];
  const changed = !!review && (expected.length !== characterIds.length || expected.some((id) => !inScript.has(id)));

  return (
    <Sheet onClose={state.close} title="Revisión del guion" label="Revisión del guion">
      {!app.aiAvailable ? (
        <div className="alert alert--info">
          Necesitas conectar la IA. <Link to="/ajustes">Configúrala en Ajustes</Link>.
        </div>
      ) : (
        <div className="stack">
          {loading && (
            <p className="muted" role="status">
              Revisando el guion…
            </p>
          )}
          {error && !loading && <div className="alert alert--error">{error}</div>}

          {review && !loading && (
            <>
              {changed && <div className="alert alert--warning small">El guion ha cambiado desde esta revisión.</div>}
              {review.verdict && <p style={{ margin: 0 }}>{review.verdict}</p>}

              {review.strengths.length > 0 && (
                <section>
                  <h3 className="log-group__title">Lo que funciona</h3>
                  <ul className="review-list">
                    {review.strengths.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="log-group__title">A vigilar</h3>
                {review.problems.length ? (
                  <ul className="review-list">
                    {review.problems.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small" style={{ margin: 0 }}>
                    No ve problemas serios.
                  </p>
                )}
              </section>

              {review.swaps.length > 0 && (
                <section>
                  <h3 className="log-group__title">Cambios que propone</h3>
                  <ul className="review-swaps">
                    {review.swaps.map((swap) => {
                      const out = app.catalog.get(swap.removeId);
                      const into = app.catalog.get(swap.addId);
                      if (!out || !into) return null;
                      const applied = isApplied(swap);
                      const possible = inScript.has(swap.removeId) && !inScript.has(swap.addId);
                      return (
                        <li key={`${swap.removeId}-${swap.addId}`} className="review-swap">
                          <div className="review-swap__pair">
                            <Token character={out} size={36} />
                            <span className={`team-${out.team}`}>{out.name}</span>
                            <ArrowRight aria-label="se cambia por" />
                            <Token character={into} size={36} />
                            <span className={`team-${into.team}`}>{into.name}</span>
                          </div>
                          <div className="small muted">{swap.reason}</div>
                          <div className="small">
                            <strong>{into.name}:</strong> {into.ability}
                          </div>
                          {onApply &&
                            (applied ? (
                              <span className="small muted">
                                <Check /> Aplicado
                              </span>
                            ) : (
                              possible && (
                                <button className="btn btn--small" onClick={() => onApply(swap)}>
                                  Aplicar el cambio
                                </button>
                              )
                            ))}
                        </li>
                      );
                    })}
                  </ul>
                  {!onApply && (
                    <p className="muted small" style={{ marginBottom: 0 }}>
                      Para aplicarlos, abre el guion en el editor y revísalo desde allí.
                    </p>
                  )}
                </section>
              )}
            </>
          )}

          {!loading && (
            <div className="action-bar action-bar--sheet">
              <button className="btn" onClick={() => void state.run(name, characterIds)}>
                <RefreshCw /> {review ? "Revisar otra vez" : "Reintentar"}
              </button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
