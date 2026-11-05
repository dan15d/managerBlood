import type { Character } from "@domain/entities/Character";
import type { Game } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { choiceReminder, CHOICE_WITHOUT_REMINDER, infoHints } from "@domain/services/NightInfo";
import type { NightStep } from "@domain/services/NightOrder";
import { Check, ChevronRight, Pointer, Sun } from "lucide-react";
import { StepIcon } from "./NightPanel";

interface Props {
  game: Game;
  steps: NightStep[];
  characters: Map<string, Character>;
  onChange: (mutate: (g: Game) => Game) => void;
  /** Acción principal del paso: elegir un recordatorio y tocar al jugador en el Grimorio. */
  onPickReminder: (sourceCharacterId: string, label: string) => void;
}

/**
 * Resumen del paso de la noche justo bajo el círculo, solo en el móvil: a quién despertar y el
 * botón que toca (elegir, dar la información o pasar), para no bajar al panel y volver a subir.
 */
export function NightStrip({ game, steps, characters, onChange, onPickReminder }: Props) {
  const index = Math.min(game.nightStep, steps.length - 1);
  const step = steps[index];
  if (!step) return null;
  const last = index === steps.length - 1;
  const player = (id: string) => game.players.find((p) => p.id === id);
  const names = step.playerIds.map((id) => player(id)?.name).filter(Boolean).join(", ");
  const chooser = step.character && step.playerIds.length > 0 ? choiceReminder(step.character.id, game.phase.number === 1) : undefined;
  const hints = step.character ? infoHints(game, step.character, characters) : [];
  const next = () => onChange((g) => (last ? rules.startDay(g) : rules.setNightStep(g, index + 1)));
  const scrollToPanel = () => document.querySelector(".panel")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="night-strip" aria-label="Paso actual de la noche">
      <button type="button" className="night-strip__info" onClick={scrollToPanel} aria-label={`Ver el paso ${step.title}`}>
        <StepIcon step={step} size={40} />
        <span className="night-strip__text">
          <strong className={step.character ? `team-${step.character.team}` : undefined}>{step.title}</strong>
          <span className="small muted">{names || (step.kind === "character" ? "Nadie en juego" : `Paso ${index + 1} de ${steps.length}`)}</span>
        </span>
      </button>
      {chooser ? (
        <button
          className="btn btn--small btn--primary"
          title={CHOICE_WITHOUT_REMINDER.has(step.character!.id) ? undefined : `Pone el recordatorio «${chooser}»`}
          onClick={() => onPickReminder(step.character!.id, chooser)}
        >
          <Pointer /> Toca a quién elige
        </button>
      ) : hints.length > 0 ? (
        <button
          className="btn btn--small btn--primary"
          onClick={() =>
            onChange((g) => {
              const noted = rules.noteInfoGiven(
                g,
                hints.map((h) => `${step.character!.name} (${player(h.playerId)?.name ?? "?"}): ${h.text}`),
              );
              return last ? noted : rules.setNightStep(noted, index + 1);
            })
          }
        >
          <Check /> Dado{last ? "" : " · Siguiente"}
        </button>
      ) : last ? (
        <button className="btn btn--small btn--gold" onClick={next}>
          <Sun /> Empezar el día
        </button>
      ) : (
        <button className="btn btn--small" onClick={next}>
          Siguiente <ChevronRight />
        </button>
      )}
    </div>
  );
}
