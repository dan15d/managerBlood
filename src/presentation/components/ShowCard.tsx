import type { Character } from "@domain/entities/Character";
import { TEAM_LABEL } from "@domain/entities/Character";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { createPortal } from "react-dom";
import { useModal } from "./Sheet";
import { Token } from "./Token";

export type Alignment = "good" | "evil";

interface Props {
  /** Texto grande arriba, como las fichas de información («Este es el Demonio»…). */
  heading?: string;
  characters: Character[];
  /** Enseñar también la habilidad (útil para que un jugador lea un personaje). */
  showAbility?: boolean;
  /** Pulgar arriba (bueno) o abajo (malo), como al enseñar «TÚ ERES» a quien cambia de bando. */
  alignment?: Alignment;
  onClose: () => void;
}

/**
 * Tarjeta a pantalla completa para enseñar el móvil a un jugador por la noche:
 * los faroles al Demonio, el personaje que ve la Lavandera… Se cierra tocando en cualquier sitio.
 */
export function ShowCard({ heading, characters, showAbility, alignment, onClose }: Props) {
  const close = useModal(onClose);
  const size = characters.length > 1 ? 120 : heading ? 200 : 220;

  return createPortal(
    <div className="show-card" role="dialog" aria-modal="true" aria-label={heading ?? "Personaje"} onClick={close}>
      {heading && <h1 className={`show-card__heading ${characters.length || alignment ? "" : "show-card__heading--alone"}`}>{heading}</h1>}
      {characters.length > 0 && (
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
      )}
      {alignment && (
        <div className={`show-card__thumb show-card__thumb--${alignment}`} aria-label={alignment === "good" ? "Bueno" : "Malo"}>
          {alignment === "good" ? <ThumbsUp /> : <ThumbsDown />}
        </div>
      )}
      <p className="show-card__hint">Toca para cerrar</p>
    </div>,
    document.body,
  );
}
