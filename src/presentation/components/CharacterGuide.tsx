import type { GuideBlock } from "@application/ports/CharacterGuides";
import type { GuideAudience } from "@application/use-cases/GuideUseCases";
import { BookOpen, Puzzle } from "lucide-react";
import type { ReactNode } from "react";
import { useApp } from "../app/AppContext";
import { useAsync } from "../hooks/useAsync";
import { JinxList } from "./JinxList";

/** Párrafos, listas y ejemplos de la guía, agrupando los puntos seguidos en una lista. */
function Blocks({ blocks }: { blocks: GuideBlock[] }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === "li") {
      const items: GuideBlock[] = [];
      while (blocks[i]?.kind === "li") items.push(blocks[i++]);
      i--;
      out.push(
        <ul key={i}>
          {items.map((it, k) => (
            <li key={k}>{it.text}</li>
          ))}
        </ul>,
      );
    } else if (b.kind === "quote") {
      out.push(<blockquote key={i}>{b.text}</blockquote>);
    } else {
      out.push(<p key={i}>{b.text}</p>);
    }
  }
  return <>{out}</>;
}

/**
 * Guía de la wiki de un personaje, con solo los apartados de quien la lee (ver GUIDE_SECTIONS).
 * Los apartados van plegados; con `openSummary` el resumen sale abierto.
 */
export function CharacterGuide({ characterId, audience, openSummary }: { characterId: string; audience: GuideAudience; openSummary?: boolean }) {
  const { app } = useApp();
  const guide = useAsync(() => app.readGuide.execute(characterId, audience), [app, characterId, audience]);
  if (guide.loading) return <p className="muted small">Cargando la guía…</p>;
  if (guide.error) return <p className="muted small">No se ha podido cargar la guía.</p>;
  if (!guide.data?.sections.length) return null;
  return (
    <div className="guide">
      {guide.data.sections.map((s) => (
        <details key={s.section} className="guide__section" open={openSummary && s.section === "summary"}>
          <summary>
            {s.section === "howToRun" && <BookOpen />} {s.title}
          </summary>
          <div className="guide__body">
            <Blocks blocks={s.blocks} />
          </div>
        </details>
      ))}
      {guide.data.quote && <p className="guide__quote">{guide.data.quote}</p>}
      <p className="small muted" style={{ margin: 0 }}>
        Guía de la wiki de Villacuervos.
      </p>
    </div>
  );
}

/**
 * Incompatibilidades e interacciones de la wiki de un personaje con los demás en juego.
 * Solo para el Narrador: dicen qué personajes hay en la partida.
 */
export function SpecialCases({ characterId, inPlayIds }: { characterId: string; inPlayIds: string[] }) {
  const { app } = useApp();
  const key = inPlayIds.join();
  const cases = useAsync(() => app.listSpecialCases.execute(characterId, inPlayIds), [app, characterId, key]);
  const characters = app.catalog.map();
  if (!cases.data) return null;
  const { jinxes, interactions } = cases.data;
  if (!jinxes.length && !interactions.length) return null;
  return (
    <details className="guide__section" open>
      <summary>
        <Puzzle /> Casos especiales en esta partida ({jinxes.length + interactions.length})
      </summary>
      <div className="guide__body stack" style={{ gap: 6 }}>
        <JinxList jinxes={jinxes} characters={characters} label={() => "Incompatibilidad"} />
        <JinxList jinxes={interactions} characters={characters} label={(i) => (i.official ? "Oficial" : undefined)} />
      </div>
    </details>
  );
}
