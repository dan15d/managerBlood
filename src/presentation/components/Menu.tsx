import { Ellipsis } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  icon?: ReactNode;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Acción que se queda activa (cambiar sitios): se marca mientras lo está. */
  pressed?: boolean;
  /** Lo peligroso (terminar la partida) va al final y en otro color. */
  danger?: boolean;
}

interface Props {
  label: string;
  items: MenuItem[];
}

/** Menú «…» con las acciones que no caben en la barra: se cierra al elegir, al tocar fuera o con Escape. */
export function Menu({ label, items }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button
        type="button"
        className="btn btn--ghost icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Ellipsis />
      </button>
      {open && (
        <div className="menu__list" role="menu" id={id}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`menu__item ${item.danger ? "menu__item--danger" : ""}`}
              aria-pressed={item.pressed}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
