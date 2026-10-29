import { useCallback, useState } from "react";

/** Lo que un jugador apunta de otro: qué dice ser, qué cree que es y notas libres. */
export interface SeatNote {
  /** Personaje que dice ser. */
  claim?: string;
  guess?: "good" | "evil";
  text?: string;
}

const key = (gameId: string) => `grimorio.notas.${gameId}`;

function load(gameId: string): Record<string, SeatNote> {
  try {
    return JSON.parse(localStorage.getItem(key(gameId)) ?? "{}");
  } catch {
    return {};
  }
}

/**
 * Notas privadas del jugador sobre los demás, por nombre (los asientos pueden cambiar si el
 * Narrador los intercambia). Solo se guardan en este móvil: no llegan al Narrador ni a nadie.
 */
export function usePlayerNotes(gameId: string) {
  const [notes, setNotes] = useState(() => load(gameId));

  const update = useCallback(
    (name: string, note: SeatNote) => {
      setNotes((current) => {
        const next = { ...current, [name]: note };
        if (!note.claim && !note.guess && !note.text?.trim()) delete next[name];
        try {
          localStorage.setItem(key(gameId), JSON.stringify(next));
        } catch {
          /* sin almacenamiento: las notas duran mientras la página esté abierta */
        }
        return next;
      });
    },
    [gameId],
  );

  return { notes, update };
}
