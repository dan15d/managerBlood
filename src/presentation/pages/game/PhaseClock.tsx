import type { Game } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { Hourglass, Timer } from "lucide-react";
import { clock, useAlarm, useNow } from "../../hooks/useClock";

interface Props {
  game: Game;
  onChange: (mutate: (g: Game) => Game) => void;
}

/** Duraciones de la cuenta atrás, en segundos (nominaciones cortas, debate largo). */
const PRESETS = [60, 180, 300];

/**
 * Cuánto lleva la fase (la noche o el día) y una cuenta atrás para el debate o las nominaciones,
 * que también ven los jugadores en su móvil. Al acabar vibra y pita.
 */
export function PhaseClock({ game, onChange }: Props) {
  const now = useNow(game.status === "in_progress");
  const elapsed = now - Date.parse(rules.phaseStart(game));
  const left = game.timer ? Date.parse(game.timer.endsAt) - now : undefined;
  const over = left !== undefined && left <= 0;
  useAlarm(game.timer?.endsAt, now);
  const night = game.phase.kind === "night";

  return (
    <div className={`clock ${over ? "clock--over" : ""}`} role="timer">
      <span className="clock__elapsed" title={`Tiempo que lleva ${night ? "la noche" : "el día"}`}>
        <Timer /> {clock(elapsed)} <span className="muted small">{night ? "de noche" : "de día"}</span>
      </span>
      {left !== undefined ? (
        <span className="clock__timer">
          <Hourglass /> {over ? "¡Tiempo!" : clock(left)}
          <button className="btn btn--small btn--ghost" onClick={() => onChange(rules.clearTimer)}>
            {over ? "Quitar" : "Parar"}
          </button>
        </span>
      ) : (
        <span className="clock__presets">
          {PRESETS.map((seconds) => (
            <button key={seconds} className="btn btn--small btn--ghost" onClick={() => onChange((g) => rules.setTimer(g, seconds))}>
              {seconds / 60} min
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
