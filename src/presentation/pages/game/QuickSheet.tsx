import type { Character } from "@domain/entities/Character";
import { TEAM_LABEL } from "@domain/entities/Character";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { ChevronRight, HeartPulse, Skull } from "lucide-react";
import { Sheet } from "../../components/Sheet";
import { Token } from "../../components/Token";

/** Los recordatorios genéricos que más se ponen a mano. */
const QUICK_GENERIC = ["Envenenado", "Borracho"];

interface Props {
  player: Player;
  characters: Map<string, Character>;
  newId: () => string;
  onChange: (mutate: (g: Game) => Game) => void;
  /** Abrir la ficha entera (notas, cambiar personaje, guía…). */
  onOpenSheet: () => void;
  onClose: () => void;
}

/**
 * Mini-hoja al tocar una ficha del círculo: lo que se hace cada dos por tres (matar, poner o quitar
 * un recordatorio) en un toque, y la ficha entera solo si hace falta. Cada acción cierra la hoja.
 */
export function QuickSheet({ player, characters, newId, onChange, onOpenSheet, onClose }: Props) {
  const character = characters.get(player.characterId);
  const shown = player.shownCharacterId ? characters.get(player.shownCharacterId) : undefined;
  // Los recordatorios de su personaje (y del que cree ser), sin repetir, y después los genéricos.
  const own = [...new Set([character, shown].filter((c): c is Character => !!c).flatMap((c) => c.reminders.map((label) => ({ c, label }))))];
  const seen = new Set<string>();
  const options = [...own, ...QUICK_GENERIC.map((label) => ({ c: undefined, label }))].filter(({ label }) => !seen.has(label) && seen.add(label));

  const act = (mutate: (g: Game) => Game) => {
    onChange(mutate);
    onClose();
  };

  const title = (
    <>
      <span className="muted">{player.seat + 1} ·</span> {player.name}
    </>
  );

  return (
    <Sheet onClose={onClose} title={title} label={`Acciones de ${player.name}`}>
      <div className="quick">
        <button type="button" className="quick__head" onClick={onOpenSheet} aria-label={`Ver la ficha de ${player.name}`}>
          <Token character={character} alignment={player.alignment} size={56} dead={!player.alive} />
          <span className="quick__who">
            <strong className={character ? `team-${character.team}` : undefined}>{character?.name ?? "Sin personaje"}</strong>
            <span className="small muted">
              {character ? TEAM_LABEL[character.team].singular : ""}
              {player.alignment === "evil" ? " · malvado" : ""}
              {!player.alive ? " · muerto" : ""}
              {shown ? ` · cree ser ${shown.name}` : ""}
            </span>
          </span>
          <ChevronRight />
        </button>

        {player.reminders.length > 0 && (
          <div className="chips">
            {player.reminders.map((r) => (
              <span key={r.id} className="chip chip--static chip--reminder">
                {r.label}
                <button aria-label={`Quitar ${r.label}`} onClick={() => act((g) => rules.removeReminder(g, player.id, r.id))}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="chips">
          {options.map(({ c, label }) => (
            <button
              key={label}
              className={`chip ${c ? "chip--reminder" : ""}`}
              onClick={() => act((g) => rules.addReminder(g, player.id, { id: newId(), sourceCharacterId: c?.id ?? "custom", label }))}
            >
              + {label}
            </button>
          ))}
        </div>

        <div className="row">
          <button
            className={`btn ${player.alive ? "btn--danger" : "btn--gold"}`}
            style={{ flex: 1 }}
            onClick={() => act((g) => (player.alive ? rules.killPlayer(g, player.id) : rules.revivePlayer(g, player.id)))}
          >
            {player.alive ? <Skull /> : <HeartPulse />} {player.alive ? "Matar" : "Revivir"}
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={onOpenSheet}>
            Ver ficha
          </button>
        </div>
      </div>
    </Sheet>
  );
}
