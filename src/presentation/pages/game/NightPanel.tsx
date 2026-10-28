import type { Character } from "@domain/entities/Character";
import type { Game } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import type { NightStep } from "@domain/services/NightOrder";
import type { CSSProperties } from "react";
import { Token } from "../../components/Token";

interface Props {
  game: Game;
  steps: NightStep[];
  characters: Map<string, Character>;
  onChange: (mutate: (g: Game) => Game) => void;
  onOpenPlayer: (id: string) => void;
  onEditBluffs: () => void;
}

/** La hoja de noche: solo los personajes en juego, en orden, con lo que hay que hacer en cada paso. */
export function NightPanel({ game, steps, characters, onChange, onOpenPlayer, onEditBluffs }: Props) {
  const index = Math.min(game.nightStep, steps.length - 1);
  const step = steps[index];
  const player = (id: string) => game.players.find((p) => p.id === id)!;
  const last = index === steps.length - 1;

  return (
    <div>
      <div className="night-card" aria-live="polite">
        <div className="small muted">
          Paso {index + 1} de {steps.length}
        </div>
        <h2 className={step.character ? `team-${step.character.team}` : undefined}>{step.title}</h2>

        {step.playerIds.length > 0 && (
          <div className="wake-list">
            {step.playerIds.map((id) => {
              const p = player(id);
              return (
                <button key={id} className="chip" onClick={() => onOpenPlayer(id)}>
                  {step.deceivedPlayerIds?.includes(id) ? "🎭 " : ""}
                  {p.seat + 1}. {p.name}
                  {!p.alive && " ☠"}
                </button>
              );
            })}
          </div>
        )}
        {step.kind === "character" && step.playerIds.length === 0 && <p className="muted small">Nadie en juego.</p>}

        <p style={{ margin: "8px 0" }}>{step.instruction}</p>

        {step.dead && (
          <div className="alert alert--warning small">Está muerto: sáltalo, salvo que su habilidad diga que actúa al morir.</div>
        )}
        {!!step.deceivedPlayerIds?.length && (
          <div className="alert alert--warning small">
            🎭 {step.deceivedPlayerIds.map((id) => player(id).name).join(", ")} solo cree ser {step.title}: no tiene esta habilidad.
            Dale información falsa (o verdadera, si confunde más).
          </div>
        )}

        {step.kind === "minion_info" && (
          <p className="small">
            Demonio:{" "}
            <strong>
              {game.players
                .filter((p) => characters.get(p.characterId)?.team === "demon")
                .map((p) => `${p.seat + 1}. ${p.name}`)
                .join(", ") || "—"}
            </strong>
          </p>
        )}
        {step.kind === "demon_info" && (
          <>
            <p className="small">
              Esbirros:{" "}
              <strong>
                {game.players
                  .filter((p) => characters.get(p.characterId)?.team === "minion")
                  .map((p) => `${p.seat + 1}. ${p.name}`)
                  .join(", ") || "—"}
              </strong>
            </p>
            <div className="row" style={{ gap: 12 }}>
              {game.demonBluffs.map((id) => (
                <Token key={id} character={characters.get(id)} size={70} />
              ))}
              <button className="btn btn--small" onClick={onEditBluffs}>
                Cambiar faroles
              </button>
            </div>
          </>
        )}
        {step.kind === "dawn" && (
          <p className="small muted">Marca como muertos a quienes hayan muerto esta noche tocando su ficha antes de empezar el día.</p>
        )}
      </div>

      <ol className="night-list" aria-label="Orden de la noche">
        {steps.map((s, i) => (
          <li key={s.key}>
            <button
              className={`night-item ${i === index ? "night-item--current" : ""} ${i < index ? "night-item--done" : ""} ${s.dead ? "night-item--skip" : ""}`}
              onClick={() => onChange((g) => rules.setNightStep(g, i))}
            >
              <span
                className="night-item__dot"
                style={s.character ? ({ "--team": `var(--${s.character.team})` } as CSSProperties) : undefined}
              />
              <span style={{ flex: 1 }}>{s.title}</span>
              <span className="muted small">{s.playerIds.map((id) => player(id).name).join(", ")}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="action-bar">
        <button className="btn btn--ghost" style={{ flex: "0 0 auto" }} disabled={index === 0} onClick={() => onChange((g) => rules.setNightStep(g, index - 1))}>
          ◀
        </button>
        {last ? (
          <button className="btn btn--gold" onClick={() => onChange(rules.startDay)}>
            ☀ Empezar el día
          </button>
        ) : (
          <button className="btn btn--primary" onClick={() => onChange((g) => rules.setNightStep(g, index + 1))}>
            Siguiente ▶
          </button>
        )}
      </div>
    </div>
  );
}
