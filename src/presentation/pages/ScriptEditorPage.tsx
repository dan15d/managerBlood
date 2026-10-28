import type { ScriptSize } from "@application/use-cases/AiScriptUseCases";
import type { Edition } from "@domain/entities/Character";
import { FileJson, ImagePlus, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { errorMessage, useApp } from "../app/AppContext";
import { CharacterPicker } from "../components/CharacterPicker";
import { EditionBanner } from "../components/EditionBanner";
import { shrinkImage } from "../imageFile";
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
  const [image, setImage] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const [edition, setEdition] = useState<Edition | "all">("all");
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [saving, setSaving] = useState(false);
  // Crear con IA (se abre solo si se llega con ?ia=1 desde la lista de guiones).
  const [aiOpen, setAiOpen] = useState(params.get("ia") === "1");
  const [idea, setIdea] = useState("");
  const [size, setSize] = useState<ScriptSize>("classic");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<{ explanation: string; warnings: string[] } | null>(null);

  const generate = async () => {
    setAiBusy(true);
    try {
      const result = await app.generateAiScript.execute({ idea, size });
      setName(result.name);
      setDescription(result.description);
      setAuthor((a) => a || "Creado con IA");
      setSelected(result.characterIds);
      setEdition("all");
      setAiNote({ explanation: result.explanation, warnings: result.warnings });
      setAiOpen(false);
      toast("Guion propuesto. Revísalo y guárdalo.");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setAiBusy(false);
    }
  };

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
      setImage(s.image);
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
      await app.saveScript.execute({ id, name, author, description, image, characterIds: selected });
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
      if (parsed.logo) setImage(parsed.logo);
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
        <div className="row">
          <button className="btn btn--small btn--primary" onClick={() => setAiOpen(true)}>
            <Sparkles /> Con IA
          </button>
          <button className="btn btn--small" onClick={() => setImporting(true)}>
            <FileJson /> JSON
          </button>
        </div>
      </div>

      {aiNote && (
        <div className="alert alert--info" style={{ marginBottom: 16 }}>
          <strong>Propuesta de la IA.</strong> {aiNote.explanation}
          {aiNote.warnings.map((w) => (
            <div key={w} className="small" style={{ marginTop: 6 }}>
              <TriangleAlert /> {w}
            </div>
          ))}
        </div>
      )}

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
        <div className="field">
          <span>Imagen</span>
          {image && (
            <div className="edition-card" style={{ overflow: "hidden", borderRadius: 12 }}>
              <EditionBanner scriptId="" name={name || "Sin nombre"} image={image} />
            </div>
          )}
          <div className="row">
            <label className="btn btn--small">
              <ImagePlus /> {image ? "Cambiar imagen" : "Subir imagen"}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    setImage(await shrinkImage(file));
                  } catch (err) {
                    toast(errorMessage(err), "error");
                  }
                }}
              />
            </label>
            {image && (
              <button className="btn btn--small btn--ghost" onClick={() => setImage(undefined)}>
                <Trash2 /> Quitar
              </button>
            )}
          </div>
          <small className="muted">Opcional: un logo o ilustración para reconocer el guion. Se reduce antes de guardarla.</small>
        </div>
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

      {aiOpen && (
        <Sheet onClose={() => setAiOpen(false)} title="Crear guion con IA" label="Crear guion con IA">
          {!app.aiAvailable ? (
            <div className="alert alert--info">
              Necesitas conectar la IA. <Link to="/ajustes">Configúrala en Ajustes</Link>.
            </div>
          ) : (
            <div className="stack">
              <label className="field">
                <span>Tu idea</span>
                <textarea
                  className="input"
                  style={{ minHeight: 130 }}
                  placeholder="Ej.: un pueblo de pescadores donde nadie se fía de nadie, con mucho envenenamiento y un Demonio que se esconde bien"
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                />
              </label>
              <div className="field">
                <span>Tamaño</span>
                <div className="chips">
                  <button className="chip" aria-pressed={size === "classic"} onClick={() => setSize("classic")}>
                    Clásico · 13 / 4 / 4 / 4
                  </button>
                  <button className="chip" aria-pressed={size === "teensy"} onClick={() => setSize("teensy")}>
                    Pequeño · 6 / 2 / 2 / 1
                  </button>
                </div>
                <small className="muted">Aldeanos / Forasteros / Esbirros / Demonios. El pequeño es para 5 o 6 jugadores.</small>
              </div>
              <div className="action-bar action-bar--sheet">
                <button className="btn btn--primary" onClick={generate} disabled={aiBusy || !idea.trim()}>
                  <Sparkles /> {aiBusy ? "Diseñando el guion…" : "Proponer guion"}
                </button>
              </div>
            </div>
          )}
        </Sheet>
      )}

      {importing && (
        <Sheet onClose={() => setImporting(false)} title="Importar guion" label="Importar guion">
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
