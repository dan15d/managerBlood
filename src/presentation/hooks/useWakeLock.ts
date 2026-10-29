import { useEffect } from "react";

/**
 * Mantiene la pantalla encendida mientras el componente está montado (el Grimorio durante la
 * partida). El navegador suelta el bloqueo al cambiar de app, así que se pide otra vez al volver.
 * Si el navegador no lo admite, no pasa nada.
 */
export function useWakeLock() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const request = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        lock = await navigator.wakeLock.request("screen");
        if (!active) void lock.release();
      } catch {
        /* sin batería, sin permiso o en segundo plano: la pantalla se apaga como siempre */
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", request);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}
