import type { Character } from "@domain/entities/Character";
import type { Game } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { buildNightOrder } from "@domain/services/NightOrder";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage, useApp } from "../../app/AppContext";
import { CharacterPicker } from "../../components/CharacterPicker";
import { Sheet } from "../../components/Sheet";
import { AiPanel } from "./AiPanel";
import { DayPanel } from "./DayPanel";
import { Grimoire } from "./Grimoire";
import { NightPanel } from "./NightPanel";
import { PlayerSheet } from "./PlayerSheet";

type Tab = "phase" | "ai" | "log";

export function GamePage() {
  const { id } = useParams();
  const { app, toast } = useApp();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [scriptCharacters, setScriptCharacters] = useState<Character[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("phase");
  const [hidden, setHidden] = useState(false);
  const [editingBluffs, setEditingBluffs] = useState(false);
  const [dismissedHint, setDismissedHint] = useState("");
  const characters = app.catalog.map();
  const saving = useRef(Promise.resolve());
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    if (!id) return;
    app.loadGame
      .execute(id)
      .then(async (g) => {
        gameRef.current = g;
        setGame(g);
        const script = (await app.listScripts.execute()).find((s) => s.id === g.scriptId);
        const ids = script?.characterIds ?? app.catalog.all().map((c) => c.id);
        const travellers = app.catalog.all().filter((c) => c.team === "traveller").map((c) => c.id);
        setScriptCharacters([...new Set([...ids, ...travellers])].map((x) => app.catalog.get(x)!).filter(Boolean));
      })
      .catch((e) => {
        toast(errorMessage(e), "error");
        navigate("/");
      });
  }, [app, id, navigate, toast]);

  /** Aplica una regla del dominio y guarda (en cola, para no pisar guardados anteriores). */
  const change = useCallback(
    (mutate: (g: Game) => Game) => {
      const current = gameRef.current;
      if (!current) return;
      let next: Game;
      try {
        next = mutate(current);
      } catch (e) {
        toast(errorMessage(e), "error");
        return;
      }
      if (next === current) return;
      gameRef.current = next;
      setGame(next);
      saving.current = saving.current.then(() => app.saveGame.execute(next)).catch((e) => toast(errorMessage(e), "error"));
    },
    [app, toast],
  );

  const steps = useMemo(() => (game ? buildNightOrder(game, characters) : []), [game, characters]);

  if (!game) {
    return (
      <main className="page page--flow">
        <p className="muted">Abriendo el Grimorio…</p>
      </main>
    );
  }

  const night = game.phase.kind === "night";
  const step = night ? steps[Math.min(game.nightStep, steps.length - 1)] : undefined;
  const player = selected ? game.players.find((p) => p.id === selected) : undefined;
  const hint = rules.victoryHint(game, characters);
  const hintKey = hint ? `${hint.winner}:${game.players.map((p) => +p.alive).join("")}` : "";

  return (
    <main className="page page--wide page--flow">
      <div className="game-bar">
        <Link to="/" className="btn btn--ghost icon-btn" aria-label="Volver a partidas">
          ←
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {game.name}
          </div>
          <div className="muted small">
            {game.scriptName} · {game.players.length} jugadores
          </div>
        </div>
        <button
          className="btn btn--small"
          aria-pressed={hidden}
          aria-label={hidden ? "Mostrar personajes" : "Ocultar personajes"}
          onClick={() => setHidden(!hidden)}
          title="Oculta los personajes por si alguien mira la pantalla"
        >
          {hidden ? "👁" : "🙈"}
          <span className="label-wide">{hidden ? " Mostrar" : " Ocultar"}</span>
        </button>
        <Link to={`/partida/${game.id}/revelar`} className="btn btn--small" aria-label="Repartir personajes">
          🎭<span className="label-wide"> Repartir</span>
        </Link>
      </div>

      {game.status === "finished" ? (
        <div className={`banner banner--${game.winner}`}>
          <h2 style={{ flex: 1 }}>{game.winner === "good" ? "😇 Ha ganado el Bien" : "😈 Ha ganado el Mal"}</h2>
          <button className="btn btn--small" onClick={() => change(rules.reopen)}>
            Reabrir
          </button>
        </div>
      ) : (
        hint &&
        dismissedHint !== hintKey && (
          <div className={`banner banner--${hint.winner}`}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h2>{hint.winner === "good" ? "¿Gana el Bien?" : "¿Gana el Mal?"}</h2>
              <div className="small muted">{hint.reason} Recuerda la Mujer Escarlata, el Alcalde, el Santo…</div>
            </div>
            <button className="btn btn--small btn--gold" onClick={() => change((g) => rules.declareWinner(g, hint.winner))}>
              Declarar victoria
            </button>
            <button className="btn btn--small btn--ghost" onClick={() => setDismissedHint(hintKey)}>
              La partida sigue
            </button>
          </div>
        )
      )}

      <div className="game-layout">
        <Grimoire
          game={game}
          characters={characters}
          hidden={hidden}
          highlighted={step?.playerIds ?? []}
          onSelect={(pid) => setSelected(pid)}
        />

        <section className="card panel">
          <div className="tabs" role="tablist">
            <button className="tab" role="tab" aria-selected={tab === "phase"} onClick={() => setTab("phase")}>
              {night ? "☾ Noche" : "☀ Día"}
            </button>
            <button className="tab" role="tab" aria-selected={tab === "ai"} onClick={() => setTab("ai")}>
              🔮 IA
            </button>
            <button className="tab" role="tab" aria-selected={tab === "log"} onClick={() => setTab("log")}>
              📜 Registro
            </button>
          </div>
          <div className="panel__body">
            {tab === "phase" &&
              (night ? (
                <NightPanel
                  game={game}
                  steps={steps}
                  characters={characters}
                  onChange={change}
                  onOpenPlayer={setSelected}
                  onEditBluffs={() => setEditingBluffs(true)}
                />
              ) : (
                <DayPanel game={game} newId={app.newId} onChange={change} />
              ))}
            {tab === "ai" && <AiPanel game={game} />}
            {tab === "log" && (
              <ul className="log">
                {[...game.log].reverse().map((l, i) => (
                  <li key={i}>
                    <span className="muted small">{l.phase} · </span>
                    {l.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {player && (
        <PlayerSheet
          key={player.id}
          game={game}
          player={player}
          characters={characters}
          scriptCharacters={scriptCharacters}
          newId={app.newId}
          onChange={change}
          onClose={() => setSelected(null)}
        />
      )}

      {editingBluffs && (
        <Sheet onClose={() => setEditingBluffs(false)} label="Faroles del Demonio">
          <h2>Faroles del Demonio</h2>
          <p className="muted small">Elige 3 personajes buenos que no estén en juego ({game.demonBluffs.length}/3).</p>
          <CharacterPicker
            characters={scriptCharacters.filter(
              (c) =>
                (c.team === "townsfolk" || c.team === "outsider") &&
                !game.players.some((p) => p.characterId === c.id || p.shownCharacterId === c.id),
            )}
            selected={game.demonBluffs}
            onToggle={(cid) =>
              change((g) =>
                rules.setBluffs(
                  g,
                  g.demonBluffs.includes(cid) ? g.demonBluffs.filter((x) => x !== cid) : [...g.demonBluffs, cid].slice(-3),
                ),
              )
            }
          />
        </Sheet>
      )}
    </main>
  );
}
