import type { Character, Team } from "@domain/entities/Character";
import { TEAM_LABEL } from "@domain/entities/Character";
import { Token } from "./Token";

const SCRIPT_TEAMS: Team[] = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric"];

/** Personajes de un guion por tipo, con su habilidad completa (como la hoja de personajes). */
export function ScriptCharacterList({ characters }: { characters: Character[] }) {
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
                <div key={c.id} className="pick" style={{ cursor: "default" }}>
                  <Token character={c} size={48} />
                  <span className="pick__body">
                    <span className="pick__name">{c.name}</span>
                    <span className="pick__ability pick__ability--full">{c.ability}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
