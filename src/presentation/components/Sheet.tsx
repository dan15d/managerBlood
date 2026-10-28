import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Las hojas guardan una entrada en el historial para que el botón «atrás» del móvil las cierre
// en vez de sacar de la pantalla. Si una hoja se cierra con la ✕, se quita esa entrada sin
// que el resto de hojas lo tomen como un «atrás».
let ignoredPops = 0;
let lastPopIgnored = false;
// Escuchador único, registrado antes que el de cualquier hoja: así el «atrás» que provoca una hoja
// al cerrarse se descuenta aunque ya no quede ninguna hoja abierta para verlo.
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastPopIgnored = ignoredPops > 0;
    if (lastPopIgnored) ignoredPops--;
  });
}

interface SheetProps {
  onClose: () => void;
  children: ReactNode;
  /** Título de la cabecera (y nombre accesible del diálogo). */
  title: ReactNode;
  label: string;
}

/** Hoja que sube desde abajo en el móvil (y sale por la derecha en pantallas grandes). */
export function Sheet({ onClose, children, title, label }: SheetProps) {
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    // Un instante después: si React monta y desmonta la hoja seguido (modo estricto), no se toca el historial.
    const timer = setTimeout(() => history.pushState({ ...history.state, grimorioSheet: id }, ""), 0);
    const onPop = () => {
      if (lastPopIgnored) return;
      if (history.state?.grimorioSheet !== id) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("popstate", onPop);
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      // Cerrada sin pasar por «atrás» (✕, fuera, deslizar): se quita su entrada del historial.
      if (history.state?.grimorioSheet === id) {
        ignoredPops++;
        history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const close = () => closeRef.current();

  // Deslizar hacia abajo desde la cabecera para cerrar.
  const onTouchStart = (e: React.TouchEvent) => (start.current = e.touches[0].clientY);
  const onTouchMove = (e: React.TouchEvent) => {
    if (start.current !== null) setDrag(Math.max(0, e.touches[0].clientY - start.current));
  };
  const onTouchEnd = () => {
    if (drag > 90) close();
    start.current = null;
    setDrag(0);
  };

  return createPortal(
    <div className="overlay" onClick={close}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
      >
        <header className="sheet__head" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="sheet__grip" aria-hidden />
          <div className="sheet__title">{title}</div>
          <button type="button" className="sheet__close" aria-label="Cerrar" onClick={close}>
            ✕
          </button>
        </header>
        <div className="sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Confirmación sencilla para acciones que no se pueden deshacer. */
export function Confirm({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div className="overlay overlay--center" onClick={onCancel}>
      <div className="dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="muted">{message}</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn btn--primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
