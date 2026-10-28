import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { errorMessage, useApp } from "../app/AppContext";

const NAME_KEY = "grimorio.playerName";
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

/** Unirse a una partida con el código (o desde el QR, que ya lo trae puesto). */
export function JoinPage() {
  const { app, toast } = useApp();
  const navigate = useNavigate();
  const params = useParams();
  const [code, setCode] = useState((params.code ?? "").toUpperCase());
  const [name, setName] = useState(savedName);
  const [busy, setBusy] = useState(false);

  if (!app.player) {
    return (
      <main className="page page--flow" style={{ maxWidth: 440 }}>
        <h1>Unirse</h1>
        <div className="alert alert--info">Esta instalación no tiene la nube configurada, así que no admite jugadores.</div>
      </main>
    );
  }

  const join = async () => {
    setBusy(true);
    try {
      const { gameId, seatId } = await app.player!.join(code, name);
      try {
        localStorage.setItem(NAME_KEY, name.trim());
      } catch {
        /* sin almacenamiento */
      }
      navigate(`/jugar/${gameId}/${seatId}`, { replace: true });
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  };

  return (
    <main className="page page--flow" style={{ maxWidth: 440 }}>
      <h1>Unirme a una partida</h1>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void join();
        }}
      >
        <label className="field">
          <span>Código de la partida</span>
          <input
            className="input input--code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
            placeholder="ABCDE"
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            autoFocus={!code}
          />
        </label>
        <label className="field">
          <span>Tu nombre</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 30))}
            placeholder="Como te llaman en la mesa"
            autoComplete="nickname"
            autoFocus={!!code}
          />
        </label>
        <button className="btn btn--primary btn--big" disabled={busy || code.length < 5 || !name.trim()}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <button className="btn btn--ghost" style={{ marginTop: 16 }} onClick={() => navigate("/")}>
        Volver
      </button>
    </main>
  );
}
