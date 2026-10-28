import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { AppProvider } from "./presentation/app/AppContext";
import { Layout } from "./presentation/components/Layout";
import { GamePage } from "./presentation/pages/game/GamePage";
import { HomePage } from "./presentation/pages/HomePage";
import { NewGamePage } from "./presentation/pages/NewGamePage";
import { RevealPage } from "./presentation/pages/RevealPage";
import { ScriptEditorPage } from "./presentation/pages/ScriptEditorPage";
import { ScriptsPage } from "./presentation/pages/ScriptsPage";
import { SettingsPage } from "./presentation/pages/SettingsPage";
import "./presentation/styles/app.css";

// Rutas con # para que funcionen en GitHub Pages sin configurar el servidor.
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/nueva", element: <NewGamePage /> },
      { path: "/partida/:id", element: <GamePage /> },
      { path: "/partida/:id/revelar", element: <RevealPage /> },
      { path: "/guiones", element: <ScriptsPage /> },
      { path: "/guiones/nuevo", element: <ScriptEditorPage /> },
      { path: "/guiones/:id", element: <ScriptEditorPage /> },
      { path: "/ajustes", element: <SettingsPage /> },
      { path: "*", element: <HomePage /> },
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
