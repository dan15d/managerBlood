import type { Character, Team } from "@domain/entities/Character";
import { TEAM_LABEL } from "@domain/entities/Character";
import { useState } from "react";
import { ShowCard } from "./ShowCard";
import { Token } from "./Token";

const SCRIPT_TEAMS: Team[] = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric"];

/** Personajes de un guion por tipo, con su habilidad completa (como la hoja de personajes). */
export function ScriptCharacterList({ characters }: { characters: Character[] }) {
  const [shown, setShown] = useState<Character | null>(null);
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
                <button key={c.id} type="button" className="pick" onClick={() => setShown(c)} aria-label={`Ver ${c.name} en grande`}>
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
      {shown && <ShowCard characters={[shown]} showAbility onClose={() => setShown(null)} />}
    </section>
  );
}
