import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from "react";
import { useApp } from "./AppContext";

// Las pantallas del Narrador van en trozos aparte: quien solo entra a jugar no las descarga.
// En cuanto se sabe que es el Narrador se bajan todas de fondo, así quedan en memoria y en la
// caché del service worker, y la partida sigue funcionando sin cobertura igual que antes.

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Un corte de cobertura no debe dejar la pantalla sin cargar: se reintenta un par de veces. */
async function withRetry<T>(load: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await load();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await wait(600 * attempt);
    }
  }
}

const loaders: Array<() => Promise<unknown>> = [];

function page<T>(load: () => Promise<T>, pick: (module: T) => ComponentType) {
  const loadPage = () => withRetry(load);
  loaders.push(loadPage);
  return lazy(() => loadPage().then((module) => ({ default: pick(module) })));
}

export const HomePage = page(() => import("../pages/HomePage"), (m) => m.HomePage);
export const NewGamePage = page(() => import("../pages/NewGamePage"), (m) => m.NewGamePage);
export const GamePage = page(() => import("../pages/game/GamePage"), (m) => m.GamePage);
export const RevealPage = page(() => import("../pages/RevealPage"), (m) => m.RevealPage);
export const ScriptsPage = page(() => import("../pages/ScriptsPage"), (m) => m.ScriptsPage);
export const ScriptEditorPage = page(() => import("../pages/ScriptEditorPage"), (m) => m.ScriptEditorPage);
export const ScriptViewPage = page(() => import("../pages/ScriptViewPage"), (m) => m.ScriptViewPage);
export const SettingsPage = page(() => import("../pages/SettingsPage"), (m) => m.SettingsPage);

/** Mientras llega el trozo de una pantalla (solo la primera vez, y casi nunca se ve). */
export function PageSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="page page--flow muted">Cargando…</main>}>{children}</Suspense>;
}

/** Descarga de fondo todas las pantallas del Narrador en cuanto se sabe que lo es. */
export function PreloadAdminPages() {
  const { role } = useApp();
  useEffect(() => {
    if (role !== "admin") return;
    for (const load of loaders) void load().catch(() => {});
  }, [role]);
  return null;
}
