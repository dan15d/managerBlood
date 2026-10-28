import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage, useApp } from "../app/AppContext";
import { ClockMark } from "../components/ClockMark";
import { Confirm } from "../components/Sheet";
import { useAsync } from "../hooks/useAsync";

const timeAgo = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};

export function HomePage() {
  const { app, toast } = useApp();
  const navigate = useNavigate();
  const games = useAsync(() => app.listGames.execute(), [app]);
  // Salas abiertas que aún no han empezado (se pueden retomar o cerrar).
  const lobbies = useAsync(async () => (app.lobby ? app.lobby.listOpen() : []), [app]);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const remove = async () => {
    if (!deleting) return;
    try {
      await app.deleteGame.execute(deleting.id);
      toast("Partida borrada.");
      void games.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setDeleting(null);
  };

  const inProgress = games.data?.filter((g) => g.status === "in_progress") ?? [];
  const finished = games.data?.filter((g) => g.status === "finished") ?? [];

  return (
    <main className="page">
      <section className="hero">
        <ClockMark />
        <h1>El Grimorio</h1>
        <p>Narra Blood on the Clocktower sin perder el hilo: prepara la bolsa, sigue la noche paso a paso y cuenta los votos.</p>
        <Link to="/nueva" className="btn btn--primary" style={{ minHeight: 56, padding: "0 32px", fontSize: "0.95rem" }}>
          Nueva partida
        </Link>
      </section>

      {games.error && <div className="alert alert--error">{games.error}</div>}

      {!!lobbies.data?.length && (
        <section style={{ marginBottom: 28 }}>
          <h2>Salas esperando jugadores</h2>
          <div className="stack">
            {lobbies.data.map((l) => (
              <div key={l.gameId} className="card game-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="game-row__title">Código {l.joinCode}</div>
                  <div className="muted small">{l.scriptName}</div>
                </div>
                <button className="btn btn--small" onClick={() => navigate(`/nueva?sala=${l.gameId}`)}>
                  Seguir
                </button>
                <button
                  className="btn btn--ghost icon-btn"
                  aria-label={`Cerrar la sala ${l.joinCode}`}
                  onClick={async () => {
                    try {
                      await app.lobby!.close(l.gameId);
                      void lobbies.reload();
                    } catch (e) {
                      toast(errorMessage(e), "error");
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {inProgress.length > 0 && (
        <section>
          <h2>En curso</h2>
          <div className="stack">
            {inProgress.map((g) => (
              <GameRow key={g.id} {...g} onOpen={() => navigate(`/partida/${g.id}`)} onDelete={() => setDeleting(g)} />
            ))}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2>Terminadas</h2>
          <div className="stack">
            {finished.map((g) => (
              <GameRow key={g.id} {...g} onOpen={() => navigate(`/partida/${g.id}`)} onDelete={() => setDeleting(g)} />
            ))}
          </div>
        </section>
      )}

      {!games.loading && !games.data?.length && !games.error && (
        <div className="empty">
          <p>Todavía no hay partidas. Cuando crees una, aparecerá aquí para retomarla.</p>
        </div>
      )}

      {deleting && (
        <Confirm
          title="¿Borrar la partida?"
          message={`Se borrará «${deleting.name}» con todo su Grimorio. No se puede deshacer.`}
          confirmLabel="Borrar"
          onConfirm={remove}
          onCancel={() => setDeleting(null)}
        />
      )}
    </main>
  );
}

function GameRow(props: {
  name: string;
  scriptName: string;
  playerCount: number;
  phaseLabel: string;
  updatedAt: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card card--interactive game-row" onClick={props.onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && props.onOpen()}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="game-row__title">{props.name}</div>
        <div className="muted small">
          {props.scriptName} · {props.playerCount} jugadores · {props.phaseLabel} · {timeAgo(props.updatedAt)}
        </div>
      </div>
      <button
        className="btn btn--ghost icon-btn"
        aria-label={`Borrar ${props.name}`}
        onClick={(e) => {
          e.stopPropagation();
          props.onDelete();
        }}
      >
        🗑
      </button>
    </div>
  );
}
