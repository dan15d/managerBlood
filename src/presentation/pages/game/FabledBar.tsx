import type { Character, Jinx } from "@domain/entities/Character";
import { isStorytellerTeam, TEAM_LABEL } from "@domain/entities/Character";
import type { Game } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import { DJINN, gameCharacterIds, jinxesAmong } from "@domain/services/SpecialRules";
import { useState } from "react";
import { CharacterGuide, SpecialCases } from "../../components/CharacterGuide";
import { CharacterPicker } from "../../components/CharacterPicker";
import { JinxList } from "../../components/JinxList";
import { Sheet } from "../../components/Sheet";
import { ShowCard } from "../../components/ShowCard";
import { Token } from "../../components/Token";
import { Eye, Plus, Trash2 } from "lucide-react";

interface Props {
  game: Game;
  characters: Map<string, Character>;
  jinxes: Jinx[];
  onChange: (mutate: (g: Game) => Game) => void;
  /** Elegir un recordatorio y después tocar al jugador en el Grimorio. */
  onPickReminder: (sourceCharacterId: string, label: string) => void;
}

/** Fábulas y Lóricos en juego, fuera del círculo como en el Grimorio físico. */
export function FabledBar({ game, characters, jinxes, onChange, onPickReminder }: Props) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Character | null>(null);
  const [showing, setShowing] = useState(false);
  const inPlay = (game.fabledIds ?? []).map((id) => characters.get(id)).filter((c): c is Character => !!c);
  const all = [...characters.values()].filter((c) => isStorytellerTeam(c.team));
  const gameJinxes = jinxesAmong(gameCharacterIds(game), jinxes);

  return (
    <>
      <div className="fabled-row" aria-label={`${TEAM_LABEL.fabled.plural} y ${TEAM_LABEL.loric.plural}`}>
        {inPlay.map((c) => (
          <button key={c.id} type="button" className="fabled-row__item" onClick={() => setOpen(c)}>
            <Token character={c} size={52} />
            <span className={`team-${c.team}`}>{c.name}</span>
          </button>
        ))}
        <button type="button" className="btn btn--small btn--ghost" onClick={() => setAdding(true)}>
          <Plus /> {inPlay.length ? "Fábulas" : "Fábulas y Lóricos"}
        </button>
        {gameJinxes.length > 0 && !inPlay.some((c) => c.id === DJINN) && (
          <button type="button" className="btn btn--small btn--ghost team-fabled" onClick={() => setOpen(characters.get(DJINN) ?? null)}>
            {gameJinxes.length} {gameJinxes.length === 1 ? "incompatibilidad" : "incompatibilidades"}
          </button>
        )}
      </div>

      {adding && (
        <Sheet onClose={() => setAdding(false)} title="Fábulas y Lóricos" label="Fábulas y Lóricos">
          <p className="muted small" style={{ marginTop: 0 }}>
            Anúncialos a la mesa al ponerlos o quitarlos. Los jugadores los ven en su móvil.
          </p>
          <CharacterPicker
            characters={all}
            teams={["fabled", "loric"]}
            selected={game.fabledIds ?? []}
            onToggle={(id) => {
              const c = characters.get(id);
              if (c) onChange((g) => rules.toggleFabled(g, c));
            }}
          />
        </Sheet>
      )}

      {open && (
        <Sheet onClose={() => setOpen(null)} title={open.name} label={open.name}>
          <div className="player-head">
            <Token character={open} size={76} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <span className={`badge team-${open.team}`}>{TEAM_LABEL[open.team].singular}</span>
              <p className="ability" style={{ marginBottom: 0 }}>
                {open.ability}
              </p>
            </div>
          </div>
          {open.reminders.length > 0 && (
            <div className="step-reminders">
              <span className="small muted">Poner recordatorio:</span>
              <div className="chips">
                {[...new Set(open.reminders)].map((label) => (
                  <button
                    key={label}
                    className="chip chip--reminder"
                    onClick={() => {
                      onPickReminder(open.id, label);
                      setOpen(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {open.id === DJINN && (
            <div className="stack" style={{ marginTop: 12 }}>
              <h3 style={{ margin: 0 }}>Incompatibilidades en juego</h3>
              {gameJinxes.length ? (
                <JinxList jinxes={gameJinxes} characters={characters} />
              ) : (
                <p className="muted small">Ninguna entre los personajes en juego.</p>
              )}
            </div>
          )}
          <SpecialCases characterId={open.id} inPlayIds={gameCharacterIds(game)} />
          <CharacterGuide characterId={open.id} audience="storyteller" />
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => setShowing(true)}>
              <Eye /> Enseñar
            </button>
            {(game.fabledIds ?? []).includes(open.id) ? (
              <button
                className="btn btn--ghost"
                onClick={() => {
                  onChange((g) => rules.toggleFabled(g, open));
                  setOpen(null);
                }}
              >
                <Trash2 /> Quitar de la partida
              </button>
            ) : (
              <button
                className="btn btn--ghost"
                onClick={() => {
                  onChange((g) => rules.toggleFabled(g, open));
                  setOpen(null);
                }}
              >
                <Plus /> Poner en juego
              </button>
            )}
          </div>
        </Sheet>
      )}

      {showing && open && <ShowCard characters={[open]} showAbility onClose={() => setShowing(false)} />}
    </>
  );
}
