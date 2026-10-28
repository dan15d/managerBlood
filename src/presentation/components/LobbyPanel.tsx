import type { Lobby, Seat } from "@domain/entities/Table";
import { useState } from "react";
import { errorMessage, useApp } from "../app/AppContext";
import { joinUrl, QrCode } from "./QrCode";

interface Props {
  lobby: Lobby;
  seats: Seat[];
}

/** Sala de espera: código y QR para unirse, y los asientos en el orden de la mesa. */
export function LobbyPanel({ lobby, seats }: Props) {
  const { app, toast } = useApp();
  const [name, setName] = useState("");
  const [showQr, setShowQr] = useState(true);
  const manage = app.lobby!;

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const share = async () => {
    const url = joinUrl(lobby.joinCode);
    try {
      if (navigator.share) await navigator.share({ title: "Únete a la partida", text: `Código: ${lobby.joinCode}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Enlace copiado.");
      }
    } catch {
      /* compartir cancelado */
    }
  };

  return (
    <div className="stack">
      <div className="card stack lobby-code">
        <span className="muted small">Código para unirse</span>
        <strong className="join-code" aria-label={`Código ${lobby.joinCode.split("").join(" ")}`}>
          {lobby.joinCode}
        </strong>
        {showQr && <QrCode text={joinUrl(lobby.joinCode)} size={210} />}
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn btn--small" onClick={share}>
            📤 Compartir enlace
          </button>
          <button className="btn btn--small btn--ghost" onClick={() => setShowQr(!showQr)}>
            {showQr ? "Ocultar QR" : "Ver QR"}
          </button>
        </div>
      </div>

      <div className="card stack">
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Jugadores</h2>
          <span className="counter">{seats.length}</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Aparecen al unirse. Ordénalos como estén sentados, en el sentido de las agujas del reloj.
        </p>
        {seats.length === 0 && <div className="empty small">Esperando a que entre alguien…</div>}
        <ol className="seat-list">
          {seats.map((s, i) => (
            <li key={s.id} className="seat-row">
              <span className="seat-input__num">{i + 1}</span>
              <span className="seat-row__name">
                {s.name}
                <span className="muted small">{s.userId ? " 📱" : " ✍️"}</span>
              </span>
              <button
                className="btn btn--ghost icon-btn"
                aria-label={`Subir a ${s.name}`}
                disabled={i === 0}
                onClick={() => run(() => manage.move(lobby.gameId, seats, s.id, -1))}
              >
                ▲
              </button>
              <button
                className="btn btn--ghost icon-btn"
                aria-label={`Bajar a ${s.name}`}
                disabled={i === seats.length - 1}
                onClick={() => run(() => manage.move(lobby.gameId, seats, s.id, 1))}
              >
                ▼
              </button>
              <button
                className="btn btn--ghost icon-btn"
                aria-label={`Quitar a ${s.name}`}
                onClick={() => run(() => manage.removeSeat(s.id))}
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => manage.addSeat(lobby.gameId, name)).then(() => setName(""));
          }}
        >
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Añadir a alguien sin móvil"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn" disabled={!name.trim()}>
            Añadir
          </button>
        </form>
      </div>
    </div>
  );
}
