import type { Character } from "@domain/entities/Character";
import type { CSSProperties } from "react";

/** Iniciales para el centro de la ficha (no usamos las ilustraciones oficiales). */
const monogram = (name: string) => {
  const words = name.split(/\s+/).filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w));
  const letters = (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [name[0]]).join("");
  return letters.toUpperCase();
};

interface TokenProps {
  character?: Character;
  size?: number;
  dead?: boolean;
  dim?: boolean;
  selected?: boolean;
  hidden?: boolean;
  glow?: boolean;
  onClick?: () => void;
  label?: string;
}

export function Token({ character, size = 92, dead, dim, selected, hidden, glow, onClick, label }: TokenProps) {
  const style = { "--size": `${size}px`, "--team": `var(--${character?.team ?? "line-strong"})` } as CSSProperties;
  const className = [
    "token",
    dead && "token--dead",
    dim && "token--dim",
    selected && "token--selected",
    (hidden || !character) && "token--hidden",
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
          <span className="token__mark" aria-hidden>
            {monogram(character.name)}
          </span>
          {size >= 56 && <span className="token__name">{character.name}</span>}
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
