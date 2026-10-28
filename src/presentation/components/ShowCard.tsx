import type { Character } from "@domain/entities/Character";
import { TEAM_LABEL } from "@domain/entities/Character";
import { createPortal } from "react-dom";
import { useModal } from "./Sheet";
import { Token } from "./Token";

/** Encabezados de las fichas de información del juego, para enseñarlos por la noche. */
export const INFO_HEADINGS = [
  "Este es el Demonio",
  "Estos son tus Esbirros",
  "Estos personajes no están en juego",
  "Eres",
  "Este jugador es",
  "Este personaje te ha elegido",
] as const;

interface Props {
  /** Texto grande arriba, como las fichas de información («Este es el Demonio»…). */
  heading?: string;
  characters: Character[];
  /** Enseñar también la habilidad (útil para que un jugador lea un personaje). */
  showAbility?: boolean;
  onClose: () => void;
}

/**
 * Tarjeta a pantalla completa para enseñar el móvil a un jugador por la noche:
 * los faroles al Demonio, el personaje que ve la Lavandera… Se cierra tocando en cualquier sitio.
 */
export function ShowCard({ heading, characters, showAbility, onClose }: Props) {
  const close = useModal(onClose);
  const size = characters.length > 1 ? 120 : 220;

  return createPortal(
    <div className="show-card" role="dialog" aria-modal="true" aria-label={heading ?? "Personaje"} onClick={close}>
      {heading && <h1 className="show-card__heading">{heading}</h1>}
      <div className={`show-card__tokens ${characters.length > 1 ? "show-card__tokens--many" : ""}`}>
        {characters.map((c) => (
          <div key={c.id} className="show-card__item">
            <Token character={c} size={size} />
            <div className={`show-card__name team-${c.team}`}>{c.name}</div>
            {characters.length === 1 && <span className={`badge team-${c.team}`}>{TEAM_LABEL[c.team].singular}</span>}
            {showAbility && <p className="show-card__ability">{c.ability}</p>}
          </div>
        ))}
      </div>
      <p className="show-card__hint">Toca para cerrar</p>
    </div>,
    document.body,
  );
}
