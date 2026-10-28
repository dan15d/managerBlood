import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { errorMessage, useApp } from "../app/AppContext";

/** Entrar como Narrador con la contraseña común (la comprueba la base de datos, no la web). */
export function AdminLoginPage() {
  const { app, role, refreshRole, toast } = useApp();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (role === "admin") return <Navigate to="/" replace />;

  const submit = async () => {
    setBusy(true);
    try {
      await app.admin.login(password);
      await refreshRole();
      toast("Bienvenido, Narrador.");
      navigate("/", { replace: true });
    } catch (e) {
      toast(errorMessage(e), "error");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page page--flow" style={{ maxWidth: 440 }}>
      <h1>Modo Narrador</h1>
      <p className="muted">Escribe la contraseña de Narrador. Este dispositivo la recordará.</p>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="field">
          <span>Contraseña</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn btn--primary btn--big" disabled={busy || !password}>
          {busy ? "Comprobando…" : "Entrar"}
        </button>
      </form>
      <button className="btn btn--ghost" style={{ marginTop: 16 }} onClick={() => navigate("/")}>
        Volver
      </button>
    </main>
  );
}
