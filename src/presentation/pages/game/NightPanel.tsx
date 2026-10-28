import type { Character } from "@domain/entities/Character";
import type { Game } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import type { NightStep } from "@domain/services/NightOrder";
import { Token } from "../../components/Token";
import { NIGHT_ICONS } from "../../wikiAssets";
import { ChevronLeft, ChevronRight, Skull, Sun, VenetianMask } from "lucide-react";

interface Props {
  game: Game;
  steps: NightStep[];
  characters: Map<string, Character>;
  onChange: (mutate: (g: Game) => Game) => void;
  onOpenPlayer: (id: string) => void;
  onEditBluffs: () => void;
  /** Elegir un recordatorio y después tocar al jugador en el Grimorio. */
  onPickReminder: (sourceCharacterId: string, label: string) => void;
}

/** Icono del paso: la ficha del personaje o el de la hoja de noche (crepúsculo, Esbirros…). */
function StepIcon({ step, size }: { step: NightStep; size: number }) {
  if (step.character) return <Token character={step.character} size={size} />;
  const src = step.kind === "character" ? undefined : NIGHT_ICONS[step.kind];
  return src ? <img className="step-icon" src={src} alt="" width={size} height={size} /> : null;
}

/** La hoja de noche: solo los personajes en juego, en orden, con lo que hay que hacer en cada paso. */
export function NightPanel({ game, steps, characters, onChange, onOpenPlayer, onEditBluffs, onPickReminder }: Props) {
  const index = Math.min(game.nightStep, steps.length - 1);
  const step = steps[index];
  const player = (id: string) => game.players.find((p) => p.id === id)!;
  const last = index === steps.length - 1;

  return (
    <div>
      <div className="night-card" aria-live="polite">
        <div className="night-card__head">
          <StepIcon step={step} size={64} />
          <div style={{ minWidth: 0 }}>
            <div className="small muted">
              Paso {index + 1} de {steps.length}
            </div>
            <h2 className={step.character ? `team-${step.character.team}` : undefined} style={{ margin: 0 }}>
              {step.title}
            </h2>
          </div>
        </div>

        {step.playerIds.length > 0 && (
          <div className="wake-list">
            {step.playerIds.map((id) => {
              const p = player(id);
              return (
                <button key={id} className="chip" onClick={() => onOpenPlayer(id)}>
                  {step.deceivedPlayerIds?.includes(id) && <VenetianMask />}
                  {p.seat + 1}. {p.name}
                  {!p.alive && <Skull />}
                </button>
              );
            })}
          </div>
        )}
        {step.kind === "character" && step.playerIds.length === 0 && <p className="muted small">Nadie en juego.</p>}

        <p style={{ margin: "8px 0" }}>{step.instruction}</p>

        {step.character && step.character.reminders.length > 0 && (
          <div className="step-reminders">
            <span className="small muted">Poner recordatorio:</span>
            <div className="chips">
              {[...new Set(step.character.reminders)].map((label) => (
                <button key={label} className="chip chip--reminder" onClick={() => onPickReminder(step.character!.id, label)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step.dead && (
          <div className="alert alert--warning small">Está muerto: sáltalo, salvo que su habilidad diga que actúa al morir.</div>
        )}
        {!!step.deceivedPlayerIds?.length && (
          <div className="alert alert--warning small">
            <VenetianMask /> {step.deceivedPlayerIds.map((id) => player(id).name).join(", ")} solo cree ser {step.title}: no tiene esta habilidad.
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
          <div className="stack" style={{ gap: 6 }}>
            <span className="small muted">¿Quién ha muerto esta noche? Toca para marcarlo:</span>
            <div className="chips">
              {game.players.map((p) => {
                // Sugerencia: quien tenga un recordatorio de muerte puesto esta noche.
                const marked = p.reminders.some((r) => /muert/i.test(r.label));
                return (
                  <button
                    key={p.id}
                    className={`chip ${marked && p.alive ? "chip--suggest" : ""}`}
                    aria-pressed={!p.alive}
                    onClick={() => onChange((g) => (p.alive ? rules.killPlayer(g, p.id) : rules.revivePlayer(g, p.id)))}
                  >
                    {!p.alive && <Skull />} {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ol className="night-list" aria-label="Orden de la noche">
        {steps.map((s, i) => (
          <li key={s.key}>
            <button
              className={`night-item ${i === index ? "night-item--current" : ""} ${i < index ? "night-item--done" : ""} ${s.dead ? "night-item--skip" : ""}`}
              onClick={() => onChange((g) => rules.setNightStep(g, i))}
            >
              <StepIcon step={s} size={30} />
              <span style={{ flex: 1 }}>{s.title}</span>
              <span className="muted small">{s.playerIds.map((id) => player(id).name).join(", ")}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="action-bar">
        <button className="btn btn--ghost" style={{ flex: "0 0 auto" }} disabled={index === 0} onClick={() => onChange((g) => rules.setNightStep(g, index - 1))}>
          <ChevronLeft />
        </button>
        {last ? (
          <button className="btn btn--gold" onClick={() => onChange(rules.startDay)}>
            <Sun /> Empezar el día
          </button>
        ) : (
          <button className="btn btn--primary" onClick={() => onChange((g) => rules.setNightStep(g, index + 1))}>
            Siguiente <ChevronRight />
          </button>
        )}
      </div>
    </div>
  );
}
