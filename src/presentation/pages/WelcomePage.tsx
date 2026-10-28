import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../app/AppContext";
import { ClockMark } from "../components/ClockMark";

/** Portada para quien no es Narrador: unirse a una partida o entrar como Narrador. */
export function WelcomePage() {
  const { app } = useApp();
  const [current, setCurrent] = useState<{ gameId: string; seatId: string } | null>(null);

  useEffect(() => {
    app.player?.current().then(setCurrent, () => setCurrent(null));
  }, [app]);

  return (
    <main className="page page--flow" style={{ maxWidth: 560 }}>
      <section className="hero">
        <ClockMark />
        <h1>El Grimorio</h1>
        <p>Blood on the Clocktower en Ravenswood Bluff. Únete a la partida con el código que te dé el Narrador.</p>
        <div className="stack" style={{ maxWidth: 360, margin: "0 auto" }}>
          {current && (
            <Link to={`/jugar/${current.gameId}/${current.seatId}`} className="btn btn--gold btn--big">
              Volver a mi partida
            </Link>
          )}
          <Link to="/unirse" className="btn btn--primary btn--big">
            Unirme a una partida
          </Link>
          <Link to="/narrador" className="btn btn--ghost">
            Soy el Narrador
          </Link>
        </div>
      </section>
    </main>
  );
}
