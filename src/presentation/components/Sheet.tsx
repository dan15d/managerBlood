import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Las hojas guardan una entrada en el historial para que el botón «atrás» del móvil las cierre
// en vez de sacar de la pantalla. Si una hoja se cierra con la ✕, se quita esa entrada sin
// que el resto de hojas lo tomen como un «atrás».
let ignoredPops = 0;
let lastPopIgnored = false;
// Si una hoja se cierra y otra se abre a la vez (elegir en una lista y enseñar la tarjeta), la nueva
// espera a que termine ese «atrás» antes de añadir su entrada; si no, se descuadra el historial.
let pendingBack: Promise<void> = Promise.resolve();
let finishPendingBack: (() => void) | null = null;
// Escuchador único, registrado antes que el de cualquier hoja: así el «atrás» que provoca una hoja
// al cerrarse se descuenta aunque ya no quede ninguna hoja abierta para verlo.
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastPopIgnored = ignoredPops > 0;
    if (lastPopIgnored) {
      ignoredPops--;
      if (ignoredPops === 0) {
        finishPendingBack?.();
        finishPendingBack = null;
      }
    }
  });
}

interface SheetProps {
  onClose: () => void;
  children: ReactNode;
  /** Título de la cabecera (y nombre accesible del diálogo). */
  title: ReactNode;
  label: string;
}

/**
 * Comportamiento común de hojas y tarjetas: el botón «atrás» y Escape las cierran, y la página
 * de debajo no hace scroll mientras están abiertas. Devuelve la función para cerrar.
 */
const MARK = "grimorioSheet";

export function useModal(onClose: () => void) {
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    // Un instante después: si React monta y desmonta seguido (modo estricto), no se toca el historial.
    let cancelled = false;
    const timer = setTimeout(
      () =>
        void pendingBack.then(() => {
          if (!cancelled) history.pushState({ ...history.state, [MARK]: id }, "");
        }),
      0,
    );
    const onPop = () => {
      if (lastPopIgnored) return;
      if (history.state?.[MARK] !== id) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("popstate", onPop);
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      // Cerrada sin pasar por «atrás» (✕, fuera, deslizar): se quita su entrada del historial.
      if (history.state?.[MARK] === id) {
        if (ignoredPops === 0) pendingBack = new Promise((done) => (finishPendingBack = done));
        ignoredPops++;
        history.back();
      }
    };
  }, [id]);

  return () => closeRef.current();
}

/** Hoja que sube desde abajo en el móvil (y sale por la derecha en pantallas grandes). */
export function Sheet({ onClose, children, title, label }: SheetProps) {
  const close = useModal(onClose);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

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
