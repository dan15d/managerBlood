import type { Character } from "@domain/entities/Character";
import { TEAM_LABEL } from "@domain/entities/Character";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { useState } from "react";
import { CharacterPicker } from "../../components/CharacterPicker";
import { Sheet } from "../../components/Sheet";
import { Token } from "../../components/Token";

const GENERIC_REMINDERS = ["Envenenado", "Borracho", "Protegido", "Muerto esta noche", "Sin habilidad", "Usado"];

interface Props {
  game: Game;
  player: Player;
  characters: Map<string, Character>;
  scriptCharacters: Character[];
  newId: () => string;
  onChange: (mutate: (g: Game) => Game) => void;
  onClose: () => void;
}

export function PlayerSheet({ game, player, characters, scriptCharacters, newId, onChange, onClose }: Props) {
  const [changing, setChanging] = useState(false);
  const [custom, setCustom] = useState("");
  const character = characters.get(player.characterId);
  const shown = player.shownCharacterId ? characters.get(player.shownCharacterId) : undefined;

  // Recordatorios de los personajes en juego: primero los del Mal (Envenenado, Muerto…), que son los que más se ponen.
  const teamOrder = ["demon", "minion", "townsfolk", "outsider", "traveller", "fabled", "loric"];
  const inPlay = [...new Set(game.players.flatMap((p) => [p.characterId, p.shownCharacterId].filter(Boolean) as string[]))]
    .map((id) => characters.get(id))
    .filter((c): c is Character => !!c && c.reminders.length > 0)
    .sort((a, b) => teamOrder.indexOf(a.team) - teamOrder.indexOf(b.team));

  const add = (sourceCharacterId: string, label: string) =>
    onChange((g) => rules.addReminder(g, player.id, { id: newId(), sourceCharacterId, label }));

  if (changing) {
    return (
      <Sheet onClose={() => setChanging(false)} label="Cambiar personaje">
        <h2>Nuevo personaje de {player.name}</h2>
        <p className="muted small">Para el Filósofo, el Granuja que pasa su Demonio, la Mujer Escarlata, el Cambiapieles…</p>
        <CharacterPicker
          characters={scriptCharacters}
          selected={[player.characterId]}
          searchable
          onToggle={(id) => {
            const c = characters.get(id);
            if (c) onChange((g) => rules.setCharacter(g, player.id, c));
            setChanging(false);
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose} label={`Jugador ${player.name}`}>
      <div className="sheet__head">
        <Token character={character} size={84} dead={!player.alive} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <input
            className="input"
            aria-label="Nombre del jugador"
            defaultValue={player.name}
            onBlur={(e) => e.target.value !== player.name && onChange((g) => rules.renamePlayer(g, player.id, e.target.value))}
            style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
          />
          <div className="row small" style={{ marginTop: 6 }}>
            <span className="muted">Asiento {player.seat + 1}</span>
            {character && <span className={`badge team-${character.team}`}>{TEAM_LABEL[character.team].singular}</span>}
          </div>
        </div>
      </div>

      {character && (
        <>
          <h2 style={{ marginBottom: 2 }}>{character.name}</h2>
          <p className="ability">{character.ability}</p>
        </>
      )}
      {shown && (
        <div className="alert alert--warning small">
          🎭 Cree ser <strong>{shown.name}</strong>. Despiértalo como tal y dale información falsa si te conviene.
        </div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button
          className={`btn ${player.alive ? "btn--primary" : "btn--gold"}`}
          style={{ flex: 1 }}
          onClick={() => onChange((g) => (player.alive ? rules.killPlayer(g, player.id) : rules.revivePlayer(g, player.id)))}
        >
          {player.alive ? "☠ Matar" : "✚ Revivir"}
        </button>
        <button
          className="btn"
          style={{ flex: 1 }}
          onClick={() => onChange((g) => rules.setAlignment(g, player.id, player.alignment === "good" ? "evil" : "good"))}
        >
          {player.alignment === "good" ? "😇 Bueno" : "😈 Malvado"}
        </button>
      </div>
      {!player.alive && (
        <button
          className="btn btn--block btn--ghost"
          style={{ marginTop: 8 }}
          onClick={() => onChange((g) => rules.setGhostVoteUsed(g, player.id, !player.ghostVoteUsed))}
        >
          {player.ghostVoteUsed ? "Voto fantasma gastado · devolver" : "Le queda el voto fantasma · gastar"}
        </button>
      )}

      <div className="section-title">Recordatorios</div>
      {player.reminders.length ? (
        <div className="chips">
          {player.reminders.map((r) => (
            <span key={r.id} className="chip chip--static">
              {r.label}
              <button aria-label={`Quitar ${r.label}`} onClick={() => onChange((g) => rules.removeReminder(g, player.id, r.id))}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="muted small">Ninguno.</p>
      )}

      <div className="section-title">Añadir recordatorio</div>
      <div className="stack" style={{ gap: 10 }}>
        {inPlay.map((c) => (
          <div key={c.id}>
            <div className={`small team-${c.team}`} style={{ marginBottom: 4 }}>
              {c.name}
            </div>
            <div className="chips">
              {[...new Set(c.reminders)].map((label) => (
                <button key={label} className="chip" onClick={() => add(c.id, label)}>
                  + {label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="chips">
          {GENERIC_REMINDERS.map((label) => (
            <button key={label} className="chip" onClick={() => add("custom", label)}>
              + {label}
            </button>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) add("custom", custom.trim());
            setCustom("");
          }}
        >
          <input className="input" style={{ flex: 1 }} placeholder="Otro…" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button className="btn" disabled={!custom.trim()}>
            Añadir
          </button>
        </form>
      </div>

      <div className="section-title">Notas</div>
      <textarea
        className="input"
        defaultValue={player.notes ?? ""}
        placeholder="Qué dice ser, a quién ha señalado…"
        onBlur={(e) => e.target.value !== (player.notes ?? "") && onChange((g) => rules.setNotes(g, player.id, e.target.value))}
      />

      <div className="section-title">Más</div>
      <div className="stack" style={{ gap: 8 }}>
        <button className="btn btn--block" onClick={() => setChanging(true)}>
          Cambiar personaje
        </button>
        <label className="field">
          <span>Cambiar de sitio con</span>
          <select
            className="input"
            value=""
            onChange={(e) => e.target.value && onChange((g) => rules.swapSeats(g, player.id, e.target.value))}
          >
            <option value="">— Elige jugador —</option>
            {game.players
              .filter((p) => p.id !== player.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.seat + 1}. {p.name}
                </option>
              ))}
          </select>
        </label>
      </div>
    </Sheet>
  );
}
