import type { Character } from "@domain/entities/Character";
import { INFO_TOKENS, infoToken, type InfoTokenId } from "@domain/services/InfoTokens";
import { Check, Eye, Plus, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useState } from "react";
import { CharacterPicker } from "./CharacterPicker";
import { Sheet } from "./Sheet";
import { ShowCard, type Alignment } from "./ShowCard";
import { Token } from "./Token";

export interface InfoTokenDraft {
  token?: InfoTokenId;
  characters?: Character[];
  alignment?: Alignment;
  /** Aviso de lo que falta (el personaje del que debe estar loco…): abre ya la lista de personajes. */
  note?: string;
}

interface Props {
  scriptCharacters: Character[];
  /** Personajes que se pueden añadir de un toque (el del paso de la noche). */
  suggested?: Character[];
  /** Faroles del Demonio: se ponen solos al elegir «Estos personajes no están en juego». */
  bluffs?: Character[];
  initial?: InfoTokenDraft;
  onClose: () => void;
}

type Choice = InfoTokenId | "custom" | null;

/**
 * Enseñar al jugador una ficha de información («ESTE PERSONAJE TE HA ELEGIDO»…), con los
 * personajes que la acompañan y, para «TÚ ERES», el pulgar del bando. Al cerrar la tarjeta se
 * vuelve aquí con todo puesto, para enseñar la siguiente parte sin empezar de cero.
 */
export function InfoTokenSheet({ scriptCharacters, suggested = [], bluffs = [], initial, onClose }: Props) {
  const [choice, setChoice] = useState<Choice>(initial?.token ?? null);
  const [custom, setCustom] = useState("");
  const [chars, setChars] = useState<Character[]>(initial?.characters ?? []);
  const [alignment, setAlignment] = useState<Alignment | undefined>(initial?.alignment);
  const [picking, setPicking] = useState(!!initial?.note);
  // Con un mensaje elegido, la lista se pliega a ese: lo siguiente (personajes, bando) queda a la vista.
  const [listOpen, setListOpen] = useState(!initial?.token);
  const [showing, setShowing] = useState(false);

  const heading = choice === "custom" ? custom.trim() || undefined : choice ? infoToken(choice).text : undefined;
  const thumb = choice === "you_are" ? alignment : undefined;
  const empty = !heading && !chars.length && !thumb;
  const has = (c: Character) => chars.some((x) => x.id === c.id);
  const add = (c: Character) => setChars((list) => (list.some((x) => x.id === c.id) ? list : [...list, c]));
  const remove = (id: string) => setChars((list) => list.filter((x) => x.id !== id));
  const missingBluffs = bluffs.filter((c) => !has(c));

  const choose = (next: Choice) => {
    if (!listOpen) return setListOpen(true);
    if (next === choice) return setChoice(null);
    setChoice(next);
    setListOpen(false);
    // Los faroles son lo que casi siempre acompaña a este mensaje: se ponen solos (se pueden quitar).
    if (next === "not_in_play" && !chars.length) setChars(bluffs);
  };

  return (
    <>
      <Sheet onClose={onClose} title="Enseñar al jugador" label="Enseñar al jugador">
        {/* Así lo verá el jugador; tocarla también la enseña. */}
        <button type="button" className="info-preview" disabled={empty} onClick={() => setShowing(true)} aria-label="Vista previa: enseñar">
          {empty ? (
            <span className="info-preview__empty">Elige un mensaje, un personaje o los dos</span>
          ) : (
            <>
              {heading && <span className="info-preview__heading">{heading}</span>}
              {chars.length > 0 && (
                <span className="info-preview__tokens">
                  {chars.map((c) => (
                    <Token key={c.id} character={c} size={chars.length > 3 ? 34 : 44} />
                  ))}
                </span>
              )}
              {thumb && <span className={`info-preview__thumb team-${thumb === "good" ? "townsfolk" : "demon"}`}>{thumb === "good" ? <ThumbsUp /> : <ThumbsDown />}</span>}
            </>
          )}
        </button>

        {initial?.note && <p className="small muted info-note">{initial.note}</p>}

        <div className="section-title info-section">
          <span>Mensaje</span>
          {!listOpen && (
            <button type="button" className="btn btn--small btn--ghost" onClick={() => setListOpen(true)}>
              Cambiar
            </button>
          )}
        </div>
        <div className="info-tokens">
          {INFO_TOKENS.filter((t) => listOpen || t.id === choice).map((t) => (
            <button key={t.id} type="button" className="info-token" aria-pressed={choice === t.id} onClick={() => choose(t.id)}>
              <span className="info-token__text">{t.text}</span>
              <span className="info-token__use">{t.use}</span>
              {choice === t.id && <Check className="info-token__check" />}
            </button>
          ))}
          {(listOpen || choice === "custom") && (
            <button type="button" className="info-token" aria-pressed={choice === "custom"} onClick={() => choose("custom")}>
              <span className="info-token__text">Otro mensaje…</span>
              <span className="info-token__use">Escribe tú lo que quieras enseñar</span>
              {choice === "custom" && <Check className="info-token__check" />}
            </button>
          )}
          {choice === "custom" && (
            <input
              className="input"
              autoFocus
              maxLength={80}
              placeholder="Por ejemplo: ¿Usas tu habilidad?"
              aria-label="Mensaje que enseñar"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          )}
        </div>

        {choice === "you_are" && (
          <>
            <div className="section-title">Bando</div>
            <div className="chips" role="group" aria-label="Pulgar del bando">
              <button type="button" className="chip" aria-pressed={!alignment} onClick={() => setAlignment(undefined)}>
                Sin pulgar
              </button>
              <button type="button" className="chip" aria-pressed={alignment === "good"} onClick={() => setAlignment("good")}>
                <ThumbsUp /> Bueno
              </button>
              <button type="button" className="chip" aria-pressed={alignment === "evil"} onClick={() => setAlignment("evil")}>
                <ThumbsDown /> Malo
              </button>
            </div>
          </>
        )}

        <div className="section-title">Personajes</div>
        <div className="chips">
          {chars.map((c) => (
            <span key={c.id} className="chip chip--static info-char">
              <Token character={c} size={26} />
              {c.name}
              <button type="button" aria-label={`Quitar ${c.name}`} onClick={() => remove(c.id)}>
                <X />
              </button>
            </span>
          ))}
          {suggested
            .filter((c) => !has(c))
            .map((c) => (
              <button key={c.id} type="button" className="chip chip--suggest" onClick={() => add(c)}>
                <Plus /> {c.name}
              </button>
            ))}
          {missingBluffs.length > 0 && choice === "not_in_play" && (
            <button type="button" className="chip chip--suggest" onClick={() => missingBluffs.forEach(add)}>
              <Plus /> Faroles del Demonio
            </button>
          )}
          <button type="button" className="chip" aria-expanded={picking} onClick={() => setPicking(!picking)}>
            {picking ? <Check /> : <Plus />} {picking ? "Listo" : "Otro personaje…"}
          </button>
        </div>
        {picking && (
          <div className="info-picker">
            <CharacterPicker
              characters={scriptCharacters}
              selected={chars.map((c) => c.id)}
              searchable
              onToggle={(id) => {
                const c = scriptCharacters.find((x) => x.id === id);
                if (c) (has(c) ? remove(id) : add(c));
              }}
            />
          </div>
        )}

        <div className="action-bar action-bar--sheet">
          <button className="btn btn--primary" disabled={empty} onClick={() => setShowing(true)}>
            <Eye /> Enseñar
          </button>
        </div>
      </Sheet>
      {showing && <ShowCard heading={heading} characters={chars} alignment={thumb} onClose={() => setShowing(false)} />}
    </>
  );
}
