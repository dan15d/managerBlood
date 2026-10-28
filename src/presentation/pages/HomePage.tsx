import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage, useApp } from "../app/AppContext";
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

function ClockMark() {
  return (
    <svg className="hero__clock" viewBox="0 0 120 120" aria-hidden>
      <circle cx="60" cy="60" r="56" fill="#140c0e" stroke="#c9a35b" strokeWidth="3" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="#5a4434" strokeWidth="1.5" strokeDasharray="2 6" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={60 + Math.sin(a) * 40}
            y1={60 - Math.cos(a) * 40}
            x2={60 + Math.sin(a) * 47}
            y2={60 - Math.cos(a) * 47}
            stroke="#e6c784"
            strokeWidth={i % 3 === 0 ? 3 : 1.5}
          />
        );
      })}
      <path d="M60 60 L60 24" stroke="#ecdfc4" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M60 60 L80 70" stroke="#ecdfc4" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M60 24 C56 34 54 40 56 46 C58 50 62 50 64 46 C66 40 64 34 60 24Z" fill="#d12a35" />
      <circle cx="60" cy="60" r="4.5" fill="#c9a35b" />
    </svg>
  );
}
