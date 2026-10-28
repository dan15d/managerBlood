import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage, useApp } from "../app/AppContext";
import { supabaseConfigured } from "../app/container";

// Sugerencias; se puede escribir cualquier modelo de OpenRouter.
const MODELS = [{ id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash (barato y rápido)" }];

export function SettingsPage() {
  const { app, settings, updateSettings, toast, refreshRole } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState(settings);
  const [testing, setTesting] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  const test = async () => {
    setTesting(true);
    try {
      await app.testAi.execute();
      toast("La IA responde correctamente.");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <div className="page-header">
        <h1>Ajustes</h1>
      </div>

      <section className="card stack">
        <h2>Dónde se guardan las partidas</h2>
        {app.storage === "supabase" ? (
          <div className="alert alert--ok">
            En la nube (Supabase), ligadas a la sesión de este navegador. Desde otro móvil, o si borras los datos del
            navegador, no las verás: para eso hará falta iniciar sesión con una cuenta.
          </div>
        ) : (
          <div className="alert alert--info">
            En este navegador. Para guardarlas en la nube (y, más adelante, que los jugadores se unan desde su móvil), configura
            Supabase: mira el README del proyecto.
          </div>
        )}
      </section>

      <section className="card stack" style={{ marginTop: 16 }}>
        <h2>Modo IA</h2>
        <p className="muted">
          La IA prepara repartos de personajes y te aconseja durante la partida. Usa OpenRouter con DeepSeek: cuesta céntimos por
          partida.
        </p>

        {supabaseConfigured && (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="section-title">Conexión</legend>
            <label className="row">
              <input
                type="radio"
                name="transport"
                checked={form.aiTransport === "cloud"}
                onChange={() => setForm({ ...form, aiTransport: "cloud" })}
              />
              <span>
                <strong>Función en la nube</strong> <span className="muted small">(recomendado: la clave queda en Supabase)</span>
              </span>
            </label>
            <label className="row">
              <input
                type="radio"
                name="transport"
                checked={form.aiTransport === "browser"}
                onChange={() => setForm({ ...form, aiTransport: "browser" })}
              />
              <span>
                <strong>Desde este navegador</strong> <span className="muted small">(con tu clave de OpenRouter)</span>
              </span>
            </label>
          </fieldset>
        )}

        {form.aiTransport === "browser" && (
          <label className="field">
            <span>Clave de OpenRouter</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              placeholder="sk-or-…"
              value={form.openRouterKey}
              onChange={(e) => setForm({ ...form, openRouterKey: e.target.value.trim() })}
            />
            <small className="muted">
              Se guarda solo en este navegador. Créala en{" "}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                openrouter.ai/keys
              </a>{" "}
              y ponle un límite de gasto.
            </small>
          </label>
        )}

        <label className="field">
          <span>Modelo</span>
          <input
            className="input"
            list="models"
            value={form.aiModel}
            onChange={(e) => setForm({ ...form, aiModel: e.target.value.trim() })}
          />
          <datalist id="models">
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </datalist>
        </label>

        <div className="row">
          <button className="btn btn--primary" disabled={!dirty} onClick={() => updateSettings(form)}>
            Guardar
          </button>
          <button className="btn" disabled={dirty || !app.aiAvailable || testing} onClick={test}>
            {testing ? "Probando…" : "Probar conexión"}
          </button>
        </div>
        {!app.aiAvailable && !dirty && <p className="muted small">El modo IA está desactivado hasta que configures la conexión.</p>}
      </section>

      {app.admin.required && (
        <section className="card stack" style={{ marginTop: 16 }}>
          <h2>Modo Narrador</h2>
          <p className="muted" style={{ margin: 0 }}>
            Este dispositivo es de Narrador. Si lo vas a usar como jugador (o es un móvil prestado), sal del modo Narrador.
          </p>
          <button
            className="btn"
            onClick={async () => {
              try {
                await app.admin.logout();
                await refreshRole();
                navigate("/", { replace: true });
              } catch (e) {
                toast(errorMessage(e), "error");
              }
            }}
          >
            Salir del modo Narrador
          </button>
        </section>
      )}
    </main>
  );
}
