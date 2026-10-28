import { useEffect, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useApp } from "../app/AppContext";

export function Layout() {
  const { pathname } = useLocation();
  const { role } = useApp();
  // El asistente, la partida y el editor de guiones son pantallas de flujo: sin barra inferior,
  // con sus propios botones abajo. Los jugadores nunca ven la barra del Narrador.
  const flow = ["/nueva", "/partida", "/guiones/"].some((prefix) => pathname.startsWith(prefix));
  const showNav = role === "admin" && !flow && !["/unirse", "/jugar", "/narrador"].some((p) => pathname.startsWith(p));
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Inicio">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          <span>GRIMORIO</span>
        </NavLink>
      </header>
      {/* Fuera de la cabecera: su desenfoque haría que la barra fija se quedase arriba en el móvil. */}
      {showNav && (
        <nav className="nav" aria-label="Principal">
          <NavItem to="/" icon="🕯️" end>
            Partidas
          </NavItem>
          <NavItem to="/nueva" icon="🩸">
            Nueva
          </NavItem>
          <NavItem to="/guiones" icon="📜">
            Guiones
          </NavItem>
          <NavItem to="/ajustes" icon="⚙️">
            Ajustes
          </NavItem>
        </nav>
      )}
      <Outlet />
    </>
  );
}

function NavItem({ to, icon, end, children }: { to: string; icon: string; end?: boolean; children: ReactNode }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? "active" : undefined)}>
      <span className="nav__icon" aria-hidden>
        {icon}
      </span>
      {children}
    </NavLink>
  );
}
