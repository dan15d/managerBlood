import type { Game, Player } from "@domain/entities/Game";
import { TEAM_LABEL } from "@domain/entities/Character";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { errorMessage, useApp } from "../app/AppContext";
import { Token } from "../components/Token";
import { Check } from "lucide-react";

/**
 * Pasar el móvil: cada jugador ve en secreto el personaje que cree ser (el Borracho ve su
 * Aldeano falso). Cuando haya app de jugadores, esto lo verá cada uno en su teléfono.
 */
export function RevealPage() {
  const { id } = useParams();
  const { app, toast } = useApp();
  const [game, setGame] = useState<Game | null>(null);
  const [current, setCurrent] = useState<Player | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);

  useEffect(() => {
    if (id) app.loadGame.execute(id).then(setGame, (e) => toast(errorMessage(e), "error"));
  }, [app, id, toast]);

  if (!game) return <main className="page page--flow muted">Cargando…</main>;

  if (current) {
    const character = app.catalog.get(current.shownCharacterId ?? current.characterId);
    const done = () => {
      setSeen((s) => [...new Set([...s, current.id])]);
      setCurrent(null);
      setRevealed(false);
    };
    return (
      <main className="page page--flow">
        <div className="reveal">
          {!revealed ? (
            <>
              <p className="muted">Pasa el móvil a</p>
              <h1>{current.name}</h1>
              <p className="muted">Que nadie más mire la pantalla.</p>
              <button className="btn btn--primary" style={{ minHeight: 64, padding: "0 36px" }} onClick={() => setRevealed(true)}>
                Soy {current.name}: ver mi personaje
              </button>
              <button className="btn btn--ghost" onClick={() => setCurrent(null)}>
                No soy yo
              </button>
            </>
          ) : (
            <>
              <p className="muted">{current.name}, eres…</p>
              <Token character={character} size={200} />
              <h1 className={character ? `team-${character.team}` : undefined} style={{ margin: 0 }}>
                {character?.name}
              </h1>
              {character && (
                <span className={`badge team-${character.team}`}>
                  {character.team === "traveller"
                    ? `Viajero · ${current.alignment === "good" ? "Bueno" : "Malvado"}`
                    : TEAM_LABEL[character.team].singular}
                </span>
              )}
              <p className="ability" style={{ maxWidth: 480, textAlign: "left" }}>
                {character?.ability}
              </p>
              <button className="btn btn--gold" style={{ minHeight: 56, padding: "0 36px" }} onClick={done}>
                Ocultar y devolver el móvil
              </button>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="page page--flow" style={{ maxWidth: 640 }}>
      <div className="page-header">
        <h1>Repartir personajes</h1>
      </div>
      <p className="muted">Toca el nombre de cada jugador y pásale el móvil. Al terminar, vuelve al Grimorio.</p>
      <div className="stack">
        {game.players.map((p) => (
          <button key={p.id} className="card card--interactive game-row" onClick={() => setCurrent(p)}>
            <span className="muted">{p.seat + 1}</span>
            <span className="game-row__title" style={{ flex: 1 }}>
              {p.name}
            </span>
            {seen.includes(p.id) ? <span className="team-loric"><Check /> Visto</span> : <span className="muted small">Pendiente</span>}
          </button>
        ))}
      </div>
      <div className="wizard-footer">
        <Link to={`/partida/${game.id}`} className="btn btn--primary">
          {seen.length === game.players.length ? "Ir al Grimorio" : `Volver al Grimorio (${seen.length}/${game.players.length})`}
        </Link>
      </div>
    </main>
  );
}
