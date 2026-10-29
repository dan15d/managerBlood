import type { GuideAudience } from "@application/use-cases/GuideUseCases";
import type { Character, Team } from "@domain/entities/Character";
import { TEAM_LABEL } from "@domain/entities/Character";
import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { CharacterGuide } from "./CharacterGuide";
import { Sheet } from "./Sheet";
import { ShowCard } from "./ShowCard";
import { Token } from "./Token";

const SCRIPT_TEAMS: Team[] = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric"];

/**
 * Personajes de un guion por tipo, con su habilidad completa (como la hoja de personajes).
 * Al tocar uno se abre su guía para quien la lee: el Narrador o un jugador.
 */
export function ScriptCharacterList({ characters, audience }: { characters: Character[]; audience: GuideAudience }) {
  const [open, setOpen] = useState<Character | null>(null);
  const [big, setBig] = useState(false);
  return (
    <section>
      {SCRIPT_TEAMS.map((team) => {
        const list = characters.filter((c) => c.team === team);
        if (!list.length) return null;
        return (
          <div key={team} className="team-section">
            <div className="team-section__head">
              <h3 className={`team-${team}`}>{TEAM_LABEL[team].plural}</h3>
              <span className="counter">{list.length}</span>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {list.map((c) => (
                <button key={c.id} type="button" className="pick" onClick={() => setOpen(c)} aria-label={`Ver la guía de ${c.name}`}>
                  <Token character={c} size={48} />
                  <span className="pick__body">
                    <span className="pick__name">{c.name}</span>
                    <span className="pick__ability pick__ability--full">{c.ability}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {open && (
        <Sheet onClose={() => setOpen(null)} title={open.name} label={open.name}>
          <div className="player-head">
            <Token character={open} size={76} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <span className={`badge team-${open.team}`}>{TEAM_LABEL[open.team].singular}</span>
              <p className="ability" style={{ marginBottom: 0 }}>
                {open.ability}
              </p>
            </div>
          </div>
          <button className="btn btn--small btn--ghost" onClick={() => setBig(true)}>
            <Maximize2 /> Ver en grande
          </button>
          <CharacterGuide key={open.id} characterId={open.id} audience={audience} openSummary />
        </Sheet>
      )}
      {big && open && <ShowCard characters={[open]} showAbility onClose={() => setBig(false)} />}
    </section>
  );
}
