import type { Alignment, Character } from "@domain/entities/Character";
import { defaultAlignment } from "@domain/entities/Character";
import { useState, type CSSProperties } from "react";

/** Iniciales para el centro de la ficha si el icono no carga. */
const monogram = (name: string) => {
  const words = name.split(/\s+/).filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w));
  const letters = (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [name[0]]).join("");
  return letters.toUpperCase();
};

/** Icono de la wiki de Villacuervos; con el del bando contrario si el jugador ha cambiado de bando. */
const iconFor = (character: Character, alignment?: Alignment) =>
  alignment && alignment !== defaultAlignment(character.team) && character.imageAlt ? character.imageAlt : character.image;

interface TokenProps {
  character?: Character;
  /** Bando del jugador, para enseñar el icono en rojo o azul como las fichas físicas. */
  alignment?: Alignment;
  size?: number;
  dead?: boolean;
  dim?: boolean;
  selected?: boolean;
  hidden?: boolean;
  glow?: boolean;
  onClick?: () => void;
  label?: string;
}

export function Token({ character, alignment, size = 92, dead, dim, selected, hidden, glow, onClick, label }: TokenProps) {
  const [broken, setBroken] = useState<string | null>(null);
  const style = { "--size": `${size}px`, "--team": `var(--${character?.team ?? "line-strong"})` } as CSSProperties;
  const icon = character && !hidden ? iconFor(character, alignment) : undefined;
  const showIcon = !!icon && broken !== icon;
  const showName = size >= 56;
  const className = [
    "token",
    dead && "token--dead",
    dim && "token--dim",
    selected && "token--selected",
    (hidden || !character) && "token--hidden",
    showIcon && "token--icon",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {hidden || !character ? (
        <span className="token__mark" style={{ color: "var(--muted)", filter: "none" }}>
          ?
        </span>
      ) : (
        <>
          {showIcon ? (
            <img
              className={`token__img ${showName ? "" : "token__img--full"}`}
              src={icon}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => setBroken(icon)}
            />
          ) : (
            <span className="token__mark" aria-hidden>
              {monogram(character.name)}
            </span>
          )}
          {showName && <span className="token__name">{character.name}</span>}
        </>
      )}
      {dead && <span className="token__shroud" aria-hidden />}
      {glow && <span className="token__glow" aria-hidden />}
    </>
  );
  const aria = label ?? (hidden ? "Personaje oculto" : character?.name);
  return onClick ? (
    <button type="button" className={className} style={style} onClick={onClick} aria-label={aria}>
      {content}
    </button>
  ) : (
    <div className={className} style={style} aria-label={aria} role="img">
      {content}
    </div>
  );
}
