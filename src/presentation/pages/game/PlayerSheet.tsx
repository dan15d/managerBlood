import type { Character, Jinx } from "@domain/entities/Character";
import { TEAM_LABEL } from "@domain/entities/Character";
import { gameCharacterIds, jinxesOf } from "@domain/services/SpecialRules";
import { JinxList } from "../../components/JinxList";
import type { Game, Player } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { DECOYS } from "@domain/services/SetupRules";
import { seatSecret } from "@domain/services/TableView";
import { useState } from "react";
import { CharacterPicker } from "../../components/CharacterPicker";
import { Sheet } from "../../components/Sheet";
import { ShowCard } from "../../components/ShowCard";
import { Token } from "../../components/Token";
import { ArrowLeft, Eye, HeartPulse, Skull, Smartphone, VenetianMask } from "lucide-react";

const GENERIC_REMINDERS = ["Envenenado", "Borracho", "Protegido", "Muerto esta noche", "Sin habilidad", "Usado"];
// Primero los recordatorios del Mal (Envenenado, Muerto…), que son los que más se ponen.
const TEAM_ORDER = ["demon", "minion", "townsfolk", "outsider", "traveller", "fabled", "loric"];

interface Props {
  game: Game;
  player: Player;
  characters: Map<string, Character>;
  scriptCharacters: Character[];
  /** Incompatibilidades oficiales: se avisan las de su personaje con los demás en juego. */
  jinxes: Jinx[];
  newId: () => string;
  onChange: (mutate: (g: Game) => Game) => void;
  onClose: () => void;
}

/** Todo lo de un jugador en una hoja: lo que más se usa arriba, lo raro al final. */
export function PlayerSheet({ game, player, characters, scriptCharacters, jinxes, newId, onChange, onClose }: Props) {
  const [changing, setChanging] = useState(false);
  const [custom, setCustom] = useState("");
  const [card, setCard] = useState<{ heading: string; characters: Character[] } | null>(null);
  // Lo que cree ser (el Borracho ve su personaje falso), para enseñárselo.
  const secret = seatSecret(player, characters);
  const believed = secret.characterId ? characters.get(secret.characterId) : undefined;
  const bluffs = game.demonBluffs.map((id) => characters.get(id)).filter((c): c is Character => !!c);
  const character = characters.get(player.characterId);
  const shown = player.shownCharacterId ? characters.get(player.shownCharacterId) : undefined;
  // Borracho, Lunático y Marioneta: qué tipo de personaje creen ser.
  const decoyTeam = DECOYS[player.characterId];

  const inPlay = [...new Set([...game.players.flatMap((p) => [p.characterId, p.shownCharacterId].filter(Boolean) as string[]), ...(game.fabledIds ?? [])])]
    .map((id) => characters.get(id))
    .filter((c): c is Character => !!c && c.reminders.length > 0)
    .sort((a, b) => TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team));

  const add = (sourceCharacterId: string, label: string) =>
    onChange((g) => rules.addReminder(g, player.id, { id: newId(), sourceCharacterId, label }));

  const title = (
    <>
      <span className="muted">{player.seat + 1} ·</span> {player.name}
    </>
  );

  return (
    <Sheet onClose={changing ? () => setChanging(false) : onClose} title={title} label={`Jugador ${player.name}`}>
      {changing ? (
        <>
          <p className="muted small">Para el Filósofo, el Diablillo que pasa su Demonio, la Mujer Escarlata…</p>
          <button className="btn btn--ghost btn--small" onClick={() => setChanging(false)}>
            <ArrowLeft /> Volver
          </button>
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
        </>
      ) : (
        <>
          <div className="player-head">
            <Token character={character} alignment={player.alignment} size={76} dead={!player.alive} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ margin: 0 }} className={character ? `team-${character.team}` : undefined}>
                {character?.name}
              </h2>
              <div className="row small" style={{ gap: 6 }}>
                {character && <span className={`badge team-${character.team}`}>{TEAM_LABEL[character.team].singular}</span>}
                <span className={`badge ${player.alignment === "evil" ? "team-demon" : "team-townsfolk"}`}>
                  {player.alignment === "evil" ? "Malvado" : "Bueno"}
                </span>
                {player.userId && <span className="badge team-loric"><Smartphone /> conectado</span>}
              </div>
            </div>
          </div>
          {character && <p className="ability">{character.ability}</p>}
          <JinxList jinxes={jinxesOf(player.characterId, gameCharacterIds(game), jinxes)} characters={characters} />
          {shown && (
            <div className="alert alert--warning small">
              <VenetianMask /> Cree ser <strong>{shown.name}</strong>. Despiértalo como tal y dale información falsa si te conviene.
            </div>
          )}
          {decoyTeam && (
            <label className="field" style={{ marginTop: 10 }}>
              <span>Cree ser (es lo que ve en su móvil)</span>
              <select
                className="input"
                value={player.shownCharacterId ?? ""}
                onChange={(e) => onChange((g) => rules.setShownCharacter(g, player.id, characters.get(e.target.value)))}
              >
                <option value="">— Sin asignar: no verá ningún personaje —</option>
                {scriptCharacters
                  .filter((c) => c.team === decoyTeam)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {game.players.some((p) => p.characterId === c.id) ? " (en juego)" : ""}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <button
              className={`btn ${player.alive ? "btn--danger" : "btn--gold"}`}
              style={{ flex: 1 }}
              onClick={() => onChange((g) => (player.alive ? rules.killPlayer(g, player.id) : rules.revivePlayer(g, player.id)))}
            >
              {player.alive ? <Skull /> : <HeartPulse />} {player.alive ? "Matar" : "Revivir"}
            </button>
            <button
              className="btn"
              style={{ flex: 1 }}
              onClick={() => onChange((g) => rules.setAlignment(g, player.id, player.alignment === "good" ? "evil" : "good"))}
            >
              Pasar a {player.alignment === "good" ? "Malvado" : "Bueno"}
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

          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn btn--ghost"
              style={{ flex: 1 }}
              disabled={!believed}
              onClick={() => believed && setCard({ heading: "Eres", characters: [believed] })}
            >
              <Eye /> Enseñarle su personaje
            </button>
            {character?.team === "demon" && (
              <button
                className="btn btn--ghost"
                style={{ flex: 1 }}
                disabled={!bluffs.length}
                onClick={() => setCard({ heading: "Estos personajes no están en juego", characters: bluffs })}
              >
                <Eye /> Faroles
              </button>
            )}
          </div>

          <div className="section-title">Recordatorios</div>
          {player.reminders.length ? (
            <div className="chips">
              {player.reminders.map((r) => (
                <span key={r.id} className="chip chip--static chip--reminder">
                  {r.label}
                  <button aria-label={`Quitar ${r.label}`} onClick={() => onChange((g) => rules.removeReminder(g, player.id, r.id))}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="muted small">Ninguno. Añade uno tocándolo abajo.</p>
          )}

          <div className="stack" style={{ gap: 10, marginTop: 12 }}>
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
              <input className="input" style={{ flex: 1 }} placeholder="Otro recordatorio…" value={custom} onChange={(e) => setCustom(e.target.value)} />
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

          <details className="more">
            <summary>Más opciones</summary>
            <div className="stack" style={{ gap: 10, marginTop: 10 }}>
              <button className="btn btn--block" onClick={() => setChanging(true)}>
                Cambiar personaje
              </button>
              <label className="field">
                <span>Nombre</span>
                <input
                  className="input"
                  defaultValue={player.name}
                  onBlur={(e) => e.target.value !== player.name && onChange((g) => rules.renamePlayer(g, player.id, e.target.value))}
                />
              </label>
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
          </details>

          <div className="action-bar action-bar--sheet">
            <button className="btn btn--gold" onClick={onClose}>
              Listo
            </button>
          </div>
        </>
      )}
      {card && <ShowCard heading={card.heading} characters={card.characters} onClose={() => setCard(null)} />}
    </Sheet>
  );
}
