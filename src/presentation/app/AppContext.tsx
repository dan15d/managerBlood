import type { AppSettings } from "@application/ports/SettingsStore";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildContainer, settingsStore, type Container } from "./container";

/** Narrador (puede crear y llevar partidas) o invitado (solo puede unirse como jugador). */
export type Role = "loading" | "admin" | "guest";

interface AppContextValue {
  app: Container;
  role: Role;
  refreshRole(): Promise<void>;
  settings: AppSettings;
  updateSettings(settings: AppSettings): void;
  toast(message: string, kind?: "info" | "error", options?: ToastOptions): void;
}

export interface ToastOptions {
  /** Botón dentro del aviso («Deshacer»): al tocarlo se cierra el aviso. */
  action?: { label: string; onClick: () => void };
  /** Los avisos con la misma clave se sustituyen en vez de apilarse. */
  key?: string;
}

const Ctx = createContext<AppContextValue | null>(null);

interface Toast extends ToastOptions {
  id: number;
  message: string;
  kind: "info" | "error";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(() => settingsStore.load());
  const app = useMemo(() => buildContainer(settings), [settings]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [role, setRole] = useState<Role>("loading");

  const refreshRole = useCallback(async () => {
    try {
      setRole((await app.admin.check()) ? "admin" : "guest");
    } catch {
      setRole("guest");
    }
  }, [app]);

  useEffect(() => {
    void refreshRole();
  }, [refreshRole]);

  const updateSettings = useCallback((next: AppSettings) => {
    settingsStore.save(next);
    setSettings(next);
  }, []);

  const toast = useCallback((message: string, kind: "info" | "error" = "info", options: ToastOptions = {}) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.filter((x) => !options.key || x.key !== options.key), { id, message, kind, ...options }]);
    // Con botón dura un poco más, para que dé tiempo a tocarlo.
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : options.action ? 5000 : 3000);
  }, []);

  const value = useMemo(
    () => ({ app, role, refreshRole, settings, updateSettings, toast }),
    [app, role, refreshRole, settings, updateSettings, toast],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind} ${t.action ? "toast--action" : ""}`}>
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  setToasts((list) => list.filter((x) => x.id !== t.id));
                  t.action!.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useApp() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApp fuera de AppProvider");
  return value;
}

/** Mensaje legible de cualquier error para enseñarlo en un aviso. */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
