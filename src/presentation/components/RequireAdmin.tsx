import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useApp } from "../app/AppContext";

/** Las pantallas del Narrador: sin la contraseña, a la portada de jugadores. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { role } = useApp();
  if (role === "loading") return <main className="page page--flow muted">Cargando…</main>;
  if (role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}
