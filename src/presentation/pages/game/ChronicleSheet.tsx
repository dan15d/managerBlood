import type { Game } from "@domain/entities/Game";
import { Copy, Feather, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage, useApp } from "../../app/AppContext";
import { Sheet } from "../../components/Sheet";

interface Props {
  game: Game;
  /** Guarda la crónica en la partida, para no tener que pedirla otra vez. */
  onSave: (text: string) => void;
  onClose: () => void;
}

/** Crónica de la partida terminada. Solo se escribe al pulsar el botón: cada una es una consulta a la IA. */
export function ChronicleSheet({ game, onSave, onClose }: Props) {
  const { app, toast } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [title, ...rest] = (game.chronicle ?? "").split("\n");
  const body = rest.join("\n").trim();

  const write = async () => {
    setLoading(true);
    setError("");
    try {
      onSave(await app.writeChronicle.execute(game));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(game.chronicle ?? "");
      toast("Crónica copiada.");
    } catch {
      toast("No he podido copiar al portapapeles.", "error");
    }
  };

  return (
    <Sheet onClose={onClose} title="Crónica de la partida" label="Crónica de la partida">
      <div className="stack">
        {game.chronicle ? (
          <article>
            <h3 className="chronicle__title">{title}</h3>
            <p className="chronicle">{body}</p>
          </article>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            La IA cuenta la partida a partir del registro: quién era quién, las muertes, las votaciones y el momento que la decidió. Se
            guarda con la partida, así que solo se pide una vez.
          </p>
        )}

        {error && <div className="alert alert--error">{error}</div>}

        {!app.aiAvailable ? (
          <div className="alert alert--info">
            Para escribirla necesitas conectar la IA. <Link to="/ajustes">Configúrala en Ajustes</Link>.
          </div>
        ) : (
          <div className="action-bar action-bar--sheet">
            {game.chronicle && (
              <button className="btn" onClick={write} disabled={loading}>
                <RefreshCw /> {loading ? "Escribiendo…" : "Otra versión"}
              </button>
            )}
            {game.chronicle ? (
              <button className="btn btn--primary" onClick={copy}>
                <Copy /> Copiar
              </button>
            ) : (
              <button className="btn btn--primary" onClick={write} disabled={loading}>
                <Feather /> {loading ? "Escribiendo la crónica…" : "Escribir la crónica"}
              </button>
            )}
          </div>
        )}
        {!app.aiAvailable && game.chronicle && (
          <div className="action-bar action-bar--sheet">
            <button className="btn btn--primary" onClick={copy}>
              <Copy /> Copiar
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
