import { scriptCharacters } from "@application/use-cases/SetupUseCases";
import type { Character } from "@domain/entities/Character";
import { FIRST_NIGHT_DEMON_INFO, FIRST_NIGHT_MINION_INFO } from "@domain/services/NightOrder";
import { ArrowLeft, Copy, Moon, Pencil, Play, ScrollText, Sunrise } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../app/AppContext";
import { EditionBanner } from "../components/EditionBanner";
import { ScriptCharacterList } from "../components/ScriptCharacterList";
import { Token } from "../components/Token";
import { useAsync } from "../hooks/useAsync";
import { NIGHT_ICONS } from "../wikiAssets";

type Tab = "characters" | "first" | "other";

interface NightRow {
  order: number;
  key: string;
  icon: ReactNode;
  title: string;
  text: string;
}

const special = (key: keyof typeof NIGHT_ICONS, order: number, title: string, text: string): NightRow => ({
  order,
  key,
  icon: <img className="step-icon" src={NIGHT_ICONS[key]} alt="" width={40} height={40} />,
  title,
  text,
});

/** La hoja de noche del guion entero (útil para preparar la partida o repasar). */
function nightSheet(characters: Character[], first: boolean): NightRow[] {
  const rows: NightRow[] = characters
    .filter((c) => (first ? c.firstNight : c.otherNight) > 0)
    .map((c) => ({
      order: first ? c.firstNight : c.otherNight,
      key: c.id,
      icon: <Token character={c} size={40} />,
      title: c.name,
      text: (first ? c.firstNightReminder : c.otherNightReminder) || c.ability,
    }));
  rows.push(special("dusk", 0, "Crepúsculo", "Todos cierran los ojos."));
  if (first) {
    rows.push(special("minion_info", FIRST_NIGHT_MINION_INFO, "Información de Esbirros", "Con 7 o más jugadores: los Esbirros se reconocen y ven al Demonio."));
    rows.push(special("demon_info", FIRST_NIGHT_DEMON_INFO, "Información del Demonio", "Con 7 o más jugadores: el Demonio ve a sus Esbirros y recibe 3 faroles."));
  }
  rows.push(special("dawn", Number.MAX_SAFE_INTEGER, "Amanecer", "Todos abren los ojos; anuncia quién ha muerto."));
  return rows.sort((a, b) => a.order - b.order);
}

export function ScriptViewPage() {
  const { id } = useParams();
  const { app, toast } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("characters");
  const [fullText, setFullText] = useState(false);
  const scripts = useAsync(() => app.listScripts.execute(), [app]);
  const script = scripts.data?.find((s) => s.id === id);
  const characters = useMemo(() => (script ? scriptCharacters(app.catalog, script) : []), [app, script]);

  if (scripts.loading) return <main className="page page--flow muted">Cargando…</main>;
  if (!script) {
    return (
      <main className="page page--flow">
        <p className="muted">No encuentro ese guion.</p>
        <Link to="/guiones">Volver a los guiones</Link>
      </main>
    );
  }

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify([{ id: "_meta", name: script.name, author: script.author }, ...script.characterIds], null, 2),
      );
      toast("JSON copiado.");
    } catch {
      toast("No he podido copiar al portapapeles.", "error");
    }
  };

  return (
    <main className="page page--flow" style={{ maxWidth: 760 }}>
      <div className="game-bar">
        <Link to="/guiones" className="btn btn--ghost icon-btn" aria-label="Volver a los guiones">
          <ArrowLeft />
        </Link>
        <div style={{ flex: 1 }} />
        <button className="btn btn--small btn--ghost" onClick={copyJson} aria-label="Copiar JSON">
          <Copy />
          <span className="label-wide"> JSON</span>
        </button>
        <button
          className="btn btn--small"
          onClick={() => navigate(script.official ? `/guiones/nuevo?desde=${script.id}` : `/guiones/${script.id}`)}
        >
          <Pencil /> {script.official ? "Duplicar" : "Editar"}
        </button>
      </div>

      <div className="card edition-card" style={{ marginBottom: 16 }}>
        <EditionBanner scriptId={script.id} name={script.name} />
        <div className="edition-card__body">
          <h1 style={{ margin: "0 0 4px" }}>{script.name}</h1>
          {script.author && <div className="muted small">{script.author}</div>}
          {script.description && (
            <>
              <p className={fullText ? "" : "clamp-3"} style={{ margin: "10px 0 0" }}>
                {script.description}
              </p>
              {script.description.length > 180 && (
                <button className="btn btn--ghost btn--small" style={{ paddingLeft: 0 }} onClick={() => setFullText(!fullText)}>
                  {fullText ? "Leer menos" : "Leer más"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="tabs tabs--page" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === "characters"} onClick={() => setTab("characters")}>
          <ScrollText /> Personajes
        </button>
        <button className="tab" role="tab" aria-selected={tab === "first"} onClick={() => setTab("first")}>
          <Moon /> 1.ª noche
        </button>
        <button className="tab" role="tab" aria-selected={tab === "other"} onClick={() => setTab("other")}>
          <Sunrise /> Otras noches
        </button>
      </div>

      {tab === "characters" ? (
        <ScriptCharacterList characters={characters} />
      ) : (
        <ol className="night-sheet">
          {nightSheet(characters, tab === "first").map((row) => (
            <li key={row.key}>
              {row.icon}
              <div>
                <div className="pick__name">{row.title}</div>
                <div className="small muted">{row.text}</div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="wizard-footer">
        <button className="btn btn--primary btn--big" onClick={() => navigate(`/nueva?guion=${script.id}`)}>
          <Play /> Nueva partida con este guion
        </button>
      </div>
    </main>
  );
}
