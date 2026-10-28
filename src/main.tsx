import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { AppProvider, useApp } from "./presentation/app/AppContext";
import { Layout } from "./presentation/components/Layout";
import { RequireAdmin } from "./presentation/components/RequireAdmin";
import { AdminLoginPage } from "./presentation/pages/AdminLoginPage";
import { GamePage } from "./presentation/pages/game/GamePage";
import { HomePage } from "./presentation/pages/HomePage";
import { JoinPage } from "./presentation/pages/JoinPage";
import { NewGamePage } from "./presentation/pages/NewGamePage";
import { PlayerPage } from "./presentation/pages/PlayerPage";
import { RevealPage } from "./presentation/pages/RevealPage";
import { ScriptEditorPage } from "./presentation/pages/ScriptEditorPage";
import { ScriptsPage } from "./presentation/pages/ScriptsPage";
import { SettingsPage } from "./presentation/pages/SettingsPage";
import { WelcomePage } from "./presentation/pages/WelcomePage";
import "./presentation/styles/app.css";
import { registerServiceWorker } from "./registerServiceWorker";

/** La portada: el Narrador ve sus partidas; el resto, unirse a una. */
function Start() {
  const { role } = useApp();
  if (role === "loading") return <main className="page page--flow muted">Cargando…</main>;
  return role === "admin" ? <HomePage /> : <WelcomePage />;
}

const admin = (element: ReactNode) => <RequireAdmin>{element}</RequireAdmin>;

// Rutas con # para que funcionen en GitHub Pages sin configurar el servidor.
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Start /> },
      { path: "/narrador", element: <AdminLoginPage /> },
      { path: "/unirse", element: <JoinPage /> },
      { path: "/unirse/:code", element: <JoinPage /> },
      { path: "/jugar/:gameId/:seatId", element: <PlayerPage /> },
      { path: "/nueva", element: admin(<NewGamePage />) },
      { path: "/partida/:id", element: admin(<GamePage />) },
      { path: "/partida/:id/revelar", element: admin(<RevealPage />) },
      { path: "/guiones", element: admin(<ScriptsPage />) },
      { path: "/guiones/nuevo", element: admin(<ScriptEditorPage />) },
      { path: "/guiones/:id", element: admin(<ScriptEditorPage />) },
      { path: "/ajustes", element: admin(<SettingsPage />) },
      { path: "*", element: <Start /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  </StrictMode>,
);

registerServiceWorker();
