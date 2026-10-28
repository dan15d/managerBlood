import type { Character, Team } from "@domain/entities/Character";
import { TEAM_LABEL } from "@domain/entities/Character";
import { DECOYS, SETUP_MODIFIERS, type Distribution } from "@domain/services/SetupRules";
import { useState } from "react";
import { Token } from "./Token";

const TEAM_ORDER: Team[] = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric"];

interface Props {
  characters: Character[];
  selected: string[];
  onToggle: (id: string) => void;
  /** Cuántos debería haber de cada tipo (muestra contadores x/y). */
  target?: Distribution;
  teams?: Team[];
  searchable?: boolean;
}

/** Rejilla de personajes agrupados por tipo, con la habilidad visible para elegir sin dudas. */
export function CharacterPicker({ characters, selected, onToggle, target, teams = TEAM_ORDER, searchable }: Props) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q
    ? characters.filter(
        (c) => c.name.toLowerCase().includes(q) || c.nameEn?.toLowerCase().includes(q) || c.ability.toLowerCase().includes(q),
      )
    : characters;

  return (
    <div>
      {searchable && (
        <input
          className="input"
          type="search"
          placeholder="Buscar personaje o habilidad…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 16 }}
        />
      )}
      {teams.map((team) => {
        const list = visible.filter((c) => c.team === team);
        if (!list.length) return null;
        const count = characters.filter((c) => c.team === team && selected.includes(c.id)).length;
        const want = target && team in target ? target[team as keyof Distribution] : undefined;
        return (
          <section key={team} className="team-section">
            <div className="team-section__head">
              <h3 className={`team-${team}`}>{TEAM_LABEL[team].plural}</h3>
              {want !== undefined ? (
                <span className={`counter ${count === want ? "counter--ok" : count > want ? "counter--over" : ""}`}>
                  {count}/{want}
                </span>
              ) : (
                count > 0 && <span className="counter">{count}</span>
              )}
            </div>
            <div className="picker-grid">
              {list.map((c) => {
                const on = selected.includes(c.id);
                return (
                  <button key={c.id} type="button" className="pick" aria-pressed={on} onClick={() => onToggle(c.id)}>
                    <Token character={c} size={44} dim={!on} />
                    <span className="pick__body">
                      <span className="pick__name">{c.name}</span>
                      <span className="pick__ability">{c.ability}</span>
                      {SETUP_MODIFIERS[c.id] && <span className="pick__flag">⚙ {SETUP_MODIFIERS[c.id].note}</span>}
                      {DECOYS[c.id] && <span className="pick__flag">🎭 No sabe quién es</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function DistributionBar({ distribution, travellers = 0 }: { distribution: Distribution; travellers?: number }) {
  const items: [Team, number][] = [
    ["townsfolk", distribution.townsfolk],
    ["outsider", distribution.outsider],
    ["minion", distribution.minion],
    ["demon", distribution.demon],
  ];
  if (travellers) items.push(["traveller", travellers]);
  return (
    <div className="distribution">
      {items.map(([team, n]) => (
        <span key={team} className={`distribution__item team-${team}`}>
          <strong>{n}</strong> {n === 1 ? TEAM_LABEL[team].singular : TEAM_LABEL[team].plural}
        </span>
      ))}
    </div>
  );
}
