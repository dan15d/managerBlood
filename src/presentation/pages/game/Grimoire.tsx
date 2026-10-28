import type { Character } from "@domain/entities/Character";
import type { Game } from "@domain/entities/Game";
import { alivePlayers, phaseLabel, voteThreshold } from "@domain/services/GameRules";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Token } from "../../components/Token";
import { Moon, Sun } from "lucide-react";

interface Props {
  game: Game;
  characters: Map<string, Character>;
  highlighted: string[];
  hidden: boolean;
  /** Modo «toca una ficha»: se apagan las que no se pueden elegir. */
  picking?: boolean;
  /** Línea bajo la fase (el paso de la noche en el que se va). */
  centerNote?: string;
  onSelect: (playerId: string) => void;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(360);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Los jugadores en círculo, como en la mesa, empezando arriba y en el sentido de las agujas del reloj. */
export function Grimoire({ game, characters, highlighted, hidden, picking, centerNote, onSelect }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const n = game.players.length;
  // Las fichas crecen hasta donde caben sin pisarse, y el radio se encoge para que no se salgan por los lados.
  const size = Math.round(Math.max(38, Math.min(96, ((Math.PI * 2 * 0.4 * width) / n) * 0.62)));
  const radius = Math.min(0.4, 0.5 - (size / 2 + 6) / width);
  const alive = alivePlayers(game).length;

  return (
    <div className="circle" ref={ref} style={{ "--size": `${size}px` } as CSSProperties}>
      <div className="circle__center">
        <div className={`phase-pill phase-pill--${game.phase.kind}`}>
          {game.phase.kind === "night" ? <Moon /> : <Sun />} {phaseLabel(game.phase)}
        </div>
        {centerNote && <div className="circle__note">{centerNote}</div>}
        <div className="stat-row">
          <div className="stat">
            <span className="big-number">{alive}</span>
            <span>vivos</span>
          </div>
          <div className="stat">
            <span className="big-number">{voteThreshold(game)}</span>
            <span title="Votos necesarios para ejecutar">votos</span>
          </div>
        </div>
      </div>
      {game.players.map((p, i) => {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
        const left = 50 + Math.cos(angle) * radius * 100;
        const top = 50 + Math.sin(angle) * radius * 100;
        const character = characters.get(p.characterId);
        return (
          <div key={p.id} className="seat" style={{ left: `${left}%`, top: `${top}%` }}>
            <Token
              character={character}
              alignment={p.alignment}
              size={size}
              dead={!p.alive}
              dim={picking && !highlighted.includes(p.id)}
              hidden={hidden}
              glow={highlighted.includes(p.id)}
              onClick={() => onSelect(p.id)}
              label={`${p.name}${hidden ? "" : `, ${character?.name}`}${p.alive ? "" : ", muerto"}`}
            />
            <span className={`seat__name ${!hidden && p.alignment === "evil" ? "seat__name--evil" : ""}`}>
              {!p.alive && !p.ghostVoteUsed && <span title="Le queda el voto">● </span>}
              {p.name}
            </span>
            {!hidden && (p.reminders.length > 0 || p.shownCharacterId) && (
              <div className="seat__meta">
                {p.shownCharacterId && <span className="reminder-dot">Cree: {characters.get(p.shownCharacterId)?.name}</span>}
                {p.reminders.map((r) => (
                  <span key={r.id} className="reminder-dot">
                    {r.label}
                  </span>
                ))}
              </div>
            )}
            {!hidden && p.reminders.length + (p.shownCharacterId ? 1 : 0) > 0 && (
              <span className="reminder-count" aria-label="Recordatorios">
                {p.reminders.length + (p.shownCharacterId ? 1 : 0)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
