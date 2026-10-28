import type { Script } from "@domain/entities/Script";
import { TEAM_LABEL, type Team } from "@domain/entities/Character";
import { scriptToJson } from "@application/use-cases/ScriptUseCases";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage, useApp } from "../app/AppContext";
import { Confirm } from "../components/Sheet";
import { useAsync } from "../hooks/useAsync";
import { EditionBanner } from "../components/EditionBanner";

export function ScriptsPage() {
  const { app, toast } = useApp();
  const navigate = useNavigate();
  const scripts = useAsync(() => app.listScripts.execute(), [app]);
  const [deleting, setDeleting] = useState<Script | null>(null);

  const counts = (s: Script) => {
    const byTeam: Partial<Record<Team, number>> = {};
    for (const id of s.characterIds) {
      const team = app.catalog.get(id)?.team;
      if (team) byTeam[team] = (byTeam[team] ?? 0) + 1;
    }
    return (["townsfolk", "outsider", "minion", "demon"] as Team[])
      .map((t) => `${byTeam[t] ?? 0} ${TEAM_LABEL[t].plural.toLowerCase()}`)
      .join(" · ");
  };

  const exportScript = async (s: Script) => {
    const json = scriptToJson(s);
    try {
      await navigator.clipboard.writeText(json);
      toast("JSON copiado. Puedes pegarlo en la herramienta oficial de guiones.");
    } catch {
      toast("No he podido copiar al portapapeles.", "error");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await app.deleteScript.execute(deleting.id);
      toast("Guion borrado.");
      void scripts.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setDeleting(null);
  };

  return (
    <main className="page">
      <div className="page-header">
        <h1>Guiones</h1>
        <Link to="/guiones/nuevo" className="btn btn--primary">
          Crear guion
        </Link>
      </div>
      {scripts.error && <div className="alert alert--error">{scripts.error}</div>}
      <div className="grid">
        {scripts.data?.map((s) => (
          <article key={s.id} className="card edition-card">
            <EditionBanner scriptId={s.id} name={s.name} />
            <div className="edition-card__body stack" style={{ gap: 8 }}>
            {s.official && <span className="badge team-fabled" style={{ alignSelf: "flex-start" }}>Oficial</span>}
            {s.author && <div className="muted small">{s.author}</div>}
            <div className="small">{counts(s)}</div>
            {s.description && (
              <p className="muted small" style={{ margin: 0 }}>
                {s.description.length > 160 ? `${s.description.slice(0, 160)}…` : s.description}
              </p>
            )}
            <div className="row" style={{ marginTop: "auto" }}>
              {s.official ? (
                <button className="btn btn--small" onClick={() => navigate(`/guiones/nuevo?desde=${s.id}`)}>
                  Duplicar y editar
                </button>
              ) : (
                <>
                  <button className="btn btn--small" onClick={() => navigate(`/guiones/${s.id}`)}>
                    Editar
                  </button>
                  <button className="btn btn--small btn--ghost" onClick={() => setDeleting(s)}>
                    Borrar
                  </button>
                </>
              )}
              <button className="btn btn--small btn--ghost" onClick={() => exportScript(s)}>
                Copiar JSON
              </button>
            </div>
            </div>
          </article>
        ))}
      </div>
      {deleting && (
        <Confirm
          title="¿Borrar el guion?"
          message={`Se borrará «${deleting.name}». Las partidas ya creadas con él no cambian.`}
          confirmLabel="Borrar"
          onConfirm={remove}
          onCancel={() => setDeleting(null)}
        />
      )}
    </main>
  );
}
