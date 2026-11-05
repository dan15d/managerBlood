import { useEffect, useRef, useState } from "react";

// Reloj compartido por el cronómetro de fase (Grimorio) y la cuenta atrás (Grimorio y móvil del jugador).

/** La hora actual, que avanza cada segundo mientras `active`. */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/** m:ss, o h:mm:ss a partir de una hora. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** Avisa de que se ha acabado el tiempo: vibración y, si se pide, tres pitidos cortos. */
export function ring(sound: boolean) {
  try {
    navigator.vibrate?.([200, 100, 200, 100, 400]);
  } catch {
    /* sin vibración */
  }
  if (!sound) return;
  try {
    const ctx = new window.AudioContext();
    for (const at of [0, 0.25, 0.5]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.18);
    }
    window.setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* sin sonido */
  }
}

/**
 * Cuando la cuenta atrás termina, avisa una sola vez, y solo si acaba de pasar: al abrir una
 * partida con una cuenta atrás vieja no suena nada.
 */
export function useAlarm(endsAt: string | undefined, now: number, sound = true) {
  const rang = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!endsAt) {
      rang.current = undefined;
      return;
    }
    const end = Date.parse(endsAt);
    if (now < end || rang.current === endsAt) return;
    rang.current = endsAt;
    if (now - end < 5000) ring(sound);
  }, [endsAt, now, sound]);
}
