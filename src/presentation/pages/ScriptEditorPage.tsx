import type { Edition } from "@domain/entities/Character";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { errorMessage, useApp } from "../app/AppContext";
import { CharacterPicker } from "../components/CharacterPicker";
import { Sheet } from "../components/Sheet";

const EDITIONS: { id: Edition | "all"; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "tb", label: "Trouble Brewing" },
  { id: "bmr", label: "Bad Moon Rising" },
  { id: "snv", label: "Sects & Violets" },
  { id: "exp", label: "Experimentales" },
];

export function ScriptEditorPage() {
  const { app, toast } = useApp();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [edition, setEdition] = useState<Edition | "all">("all");
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [saving, setSaving] = useState(false);

  // Cargar el guion que se edita o el oficial del que se parte.
  useEffect(() => {
    const source = id ?? params.get("desde");
    if (!source) return;
    void app.listScripts.execute().then((list) => {
      const s = list.find((x) => x.id === source);
      if (!s) return;
      setName(id ? s.name : `${s.name} (mi versión)`);
      setAuthor(id ? s.author : "");
      setDescription(s.description ?? "");
      setSelected(s.characterIds);
    });
  }, [app, id, params]);

  const characters = useMemo(
    () => app.catalog.all().filter((c) => edition === "all" || c.edition === edition || selected.includes(c.id)),
    [app, edition, selected],
  );

  const toggle = (cid: string) => setSelected((s) => (s.includes(cid) ? s.filter((x) => x !== cid) : [...s, cid]));

  const save = async () => {
    setSaving(true);
    try {
      await app.saveScript.execute({ id, name, author, description, characterIds: selected });
      toast("Guion guardado.");
      navigate("/guiones");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const doImport = () => {
    try {
      const parsed = app.parseScriptJson.execute(importText);
      setSelected(parsed.characterIds);
      if (parsed.name) setName(parsed.name);
      if (parsed.author) setAuthor(parsed.author);
      setImporting(false);
      toast(
        parsed.unknown.length
          ? `Importados ${parsed.characterIds.length}. No reconozco: ${parsed.unknown.join(", ")}.`
          : `Importados ${parsed.characterIds.length} personajes.`,
        parsed.unknown.length ? "error" : "info",
      );
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const count = (team: string) => selected.filter((s) => app.catalog.get(s)?.team === team).length;

  return (
    <main className="page page--flow">
      <div className="page-header">
        <h1>{id ? "Editar guion" : "Nuevo guion"}</h1>
        <button className="btn btn--small" onClick={() => setImporting(true)}>
          Importar JSON
        </button>
      </div>

      <section className="card stack">
        <label className="field">
          <span>Nombre</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Noche de difuntos" />
        </label>
        <label className="field">
          <span>Autor</span>
          <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Opcional" />
        </label>
        <label className="field">
          <span>Descripción</span>
          <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
        </label>
      </section>

      <div className="sticky-bar" style={{ marginTop: 16 }}>
        <div className="row small">
          <strong>{selected.length} personajes</strong>
          <span className="team-townsfolk">{count("townsfolk")} aldeanos</span>
          <span className="team-outsider">{count("outsider")} forasteros</span>
          <span className="team-minion">{count("minion")} esbirros</span>
          <span className="team-demon">{count("demon")} demonios</span>
        </div>
        <div className="chips chips--scroll" style={{ marginTop: 8 }}>
          {EDITIONS.map((e) => (
            <button key={e.id} className="chip" aria-pressed={edition === e.id} onClick={() => setEdition(e.id)}>
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <p className="muted small">Consejo: un guion clásico tiene 13 Aldeanos, 4 Forasteros, 4 Esbirros y 4 Demonios.</p>
      <CharacterPicker characters={characters} selected={selected} onToggle={toggle} searchable />

      <div className="wizard-footer">
        <button className="btn btn--ghost" onClick={() => navigate("/guiones")}>
          Cancelar
        </button>
        <button className="btn btn--primary" onClick={save} disabled={saving}>
          Guardar guion
        </button>
      </div>

      {importing && (
        <Sheet onClose={() => setImporting(false)} label="Importar guion">
          <h2>Importar guion</h2>
          <p className="muted small">
            Pega el JSON de la herramienta oficial (script.bloodontheclocktower.com) o una lista de ids de personajes.
          </p>
          <textarea
            className="input"
            style={{ minHeight: 200, fontFamily: "monospace", fontSize: 14 }}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='[{"id":"_meta","name":"Mi guion"},"washerwoman","imp"]'
          />
          <div className="action-bar">
            <button className="btn btn--primary" onClick={doImport} disabled={!importText.trim()}>
              Importar
            </button>
          </div>
        </Sheet>
      )}
    </main>
  );
}
