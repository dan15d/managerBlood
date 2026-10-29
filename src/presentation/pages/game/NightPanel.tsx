import type { Character } from "@domain/entities/Character";
import { isStorytellerTeam, TEAM_LABEL } from "@domain/entities/Character";
import type { Game } from "@domain/entities/Game";
import * as rules from "@domain/services/GameRules";
import type { NightStep } from "@domain/services/NightOrder";
import { useState } from "react";
import { gameCharacterIds } from "@domain/services/SpecialRules";
import { CharacterGuide, SpecialCases } from "../../components/CharacterGuide";
import { CharacterPicker } from "../../components/CharacterPicker";
import { Sheet } from "../../components/Sheet";
import { INFO_HEADINGS, ShowCard } from "../../components/ShowCard";
import { Token } from "../../components/Token";
import { NIGHT_ICONS } from "../../wikiAssets";
import { ChevronLeft, ChevronRight, Eye, Lightbulb, Pointer, Skull, Sun, TriangleAlert, VenetianMask } from "lucide-react";
import { choiceReminder, CHOICE_WITHOUT_REMINDER, infoHints } from "@domain/services/NightInfo";

interface Props {
  game: Game;
  steps: NightStep[];
  characters: Map<string, Character>;
  onChange: (mutate: (g: Game) => Game) => void;
  onOpenPlayer: (id: string) => void;
  onEditBluffs: () => void;
  /** Elegir un recordatorio y después tocar al jugador en el Grimorio. */
  onPickReminder: (sourceCharacterId: string, label: string) => void;
  /** Personajes del guion, para enseñar cualquiera en una tarjeta. */
  scriptCharacters: Character[];
}

interface Card {
  heading?: string;
  characters: Character[];
}

/** Recordatorios que dejan sin habilidad: hay que avisar al Narrador para que dé información falsa. */
const DISABLING = /envenen|borrach|sin habilidad|loc[oa]|enloquec/i;

/** Icono del paso: la ficha del personaje o el de la hoja de noche (crepúsculo, Esbirros…). */
function StepIcon({ step, size }: { step: NightStep; size: number }) {
  if (step.character) return <Token character={step.character} size={size} />;
  const src = step.kind === "character" ? undefined : NIGHT_ICONS[step.kind];
  return src ? <img className="step-icon" src={src} alt="" width={size} height={size} /> : null;
}

/** La hoja de noche: solo los personajes en juego, en orden, con lo que hay que hacer en cada paso. */
export function NightPanel({ game, steps, characters, onChange, onOpenPlayer, onEditBluffs, onPickReminder, scriptCharacters }: Props) {
  const [card, setCard] = useState<Card | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [heading, setHeading] = useState<string | undefined>(undefined);
  const index = Math.min(game.nightStep, steps.length - 1);
  const step = steps[index];
  const player = (id: string) => game.players.find((p) => p.id === id)!;
  const last = index === steps.length - 1;
  // Jugadores de este paso con un recordatorio que les quita la habilidad (envenenado, borracho…).
  const disabled = step.playerIds.map(player).filter((p) => p.reminders.some((r) => DISABLING.test(r.label)));
  const hints = step.character ? infoHints(game, step.character, characters) : [];
  // El Exorcista o la Princesa impiden que el Demonio mate esta noche.
  const demonBlock = step.character?.team === "demon" ? rules.demonBlocked(game, step.character.id) : null;
  // Recordatorio de quien elige jugador cada noche (Envenenador, Monje, Demonio…).
  const chooser = step.character && step.playerIds.length > 0 ? choiceReminder(step.character.id, game.phase.number === 1) : undefined;
  const otherReminders = [...new Set(step.character?.reminders ?? [])].filter((label) => label !== chooser);

  return (
    <div>
      <div className="night-card" aria-live="polite">
        <div className="night-card__head">
          {step.character ? (
            <button type="button" className="reveal__toggle" aria-label={`Enseñar ${step.title}`} onClick={() => setCard({ characters: [step.character!] })}>
              <StepIcon step={step} size={64} />
            </button>
          ) : (
            <StepIcon step={step} size={64} />
          )}
          <div style={{ minWidth: 0 }}>
            <div className="small muted">
              Paso {index + 1} de {steps.length}
            </div>
            <h2 className={step.character ? `team-${step.character.team}` : undefined} style={{ margin: 0 }}>
              {step.title}
            </h2>
          </div>
        </div>

        {step.playerIds.length > 0 && (
          <div className="wake-rows">
            {step.playerIds.map((id) => {
              const p = player(id);
              return (
                <button key={id} className="wake-row" onClick={() => onOpenPlayer(id)}>
                  <span className="wake-row__name">
                    {step.deceivedPlayerIds?.includes(id) && <VenetianMask />}
                    {p.seat + 1}. {p.name}
                    {!p.alive && <Skull />}
                  </span>
                  {(p.reminders.length > 0 || p.shownCharacterId) && (
                    <span className="chips">
                      {p.shownCharacterId && <span className="chip chip--static chip--reminder chip--tiny">Cree ser {characters.get(p.shownCharacterId)?.name}</span>}
                      {p.reminders.map((r) => (
                        <span key={r.id} className={`chip chip--static chip--reminder chip--tiny ${DISABLING.test(r.label) ? "chip--danger" : ""}`}>
                          {r.label}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {disabled.length > 0 && (
          <div className="alert alert--warning small">
            <TriangleAlert /> {disabled.map((p) => `${p.name} (${p.reminders.filter((r) => DISABLING.test(r.label)).map((r) => r.label.toLowerCase()).join(", ")})`).join("; ")}
            : sin habilidad esta noche. Despiértalo igual y dale información falsa si te conviene.
          </div>
        )}
        {step.kind === "character" && step.playerIds.length === 0 && (
          <p className="muted small">
            {step.character && isStorytellerTeam(step.character.team)
              ? `${TEAM_LABEL[step.character.team].singular} en juego: no es un jugador, lo resuelves tú.`
              : "Nadie en juego."}
          </p>
        )}

        <p style={{ margin: "8px 0" }}>{step.instruction}</p>
        {/* La habilidad tal como está en la ficha, por si hay dudas (si no hay texto de noche, ya es la instrucción). */}
        {step.character && step.character.ability !== step.instruction && (
          <p className="ability night-card__ability">
            <span className="small muted">Habilidad · </span>
            {step.character.ability}
          </p>
        )}

        {demonBlock && (
          <div className="alert alert--warning small">
            <TriangleAlert /> {demonBlock}
          </div>
        )}

        {hints.length > 0 && (
          <div className="info-hint" role="note">
            <span className="info-hint__title">
              <Lightbulb /> Según el Grimorio
            </span>
            {hints.map((h) => (
              <p key={h.playerId} style={{ margin: 0 }}>
                {hints.length > 1 && <strong>{player(h.playerId).name}: </strong>}
                {h.text}
              </p>
            ))}
            {hints[0].caveats.map((c) => (
              <p key={c} className="small muted" style={{ margin: 0 }}>
                {c}
              </p>
            ))}
          </div>
        )}

        {/* Quien elige a alguien (Envenenador, Monje, Demonio…): un toque y se pone su recordatorio. */}
        {chooser && (
          <button className="btn btn--primary btn--block" style={{ marginTop: 8 }} onClick={() => onPickReminder(step.character!.id, chooser)}>
            <Pointer /> Toca a quién elige{CHOICE_WITHOUT_REMINDER.has(step.character!.id) ? "" : ` · «${chooser}»`}
          </button>
        )}

        {step.character && otherReminders.length > 0 && (
          <div className="step-reminders">
            <span className="small muted">{chooser ? "Otros recordatorios:" : "Poner recordatorio:"}</span>
            <div className="chips">
              {otherReminders.map((label) => (
                <button key={label} className="chip chip--reminder" onClick={() => onPickReminder(step.character!.id, label)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step.character && <SpecialCases key={step.key} characterId={step.character.id} inPlayIds={gameCharacterIds(game)} />}
        {step.character && (
          <details className="guide__section" key={`guide:${step.key}`} style={{ marginTop: 6 }}>
            <summary>Guía de {step.character.name}</summary>
            <div className="guide__body">
              <CharacterGuide characterId={step.character.id} audience="storyteller" />
            </div>
          </details>
        )}

        {step.deathNote ? (
          <div className={`alert ${step.deathNote.wake ? "alert--info" : "alert--warning"} small`}>{step.deathNote.text}</div>
        ) : (
          step.dead && <div className="alert alert--warning small">Está muerto: sáltalo, salvo que su habilidad diga que actúa al morir.</div>
        )}
        {!!step.deceivedPlayerIds?.length && (
          <div className="alert alert--warning small">
            <VenetianMask /> {step.deceivedPlayerIds.map((id) => player(id).name).join(", ")} solo cree ser {step.title}: no tiene esta habilidad.
            Dale información falsa (o verdadera, si confunde más).
          </div>
        )}

        {step.kind === "minion_info" && (
          <button className="btn btn--block" onClick={() => setCard({ heading: "Este es el Demonio", characters: [] })}>
            <Eye /> Enseñar «Este es el Demonio»
          </button>
        )}
        {step.kind === "minion_info" && (
          <p className="small">
            Demonio:{" "}
            <strong>
              {game.players
                .filter((p) => characters.get(p.characterId)?.team === "demon")
                .map((p) => `${p.seat + 1}. ${p.name}`)
                .join(", ") || "—"}
            </strong>
          </p>
        )}
        {step.kind === "demon_info" && (
          <>
            <p className="small">
              Esbirros:{" "}
              <strong>
                {game.players
                  .filter((p) => characters.get(p.characterId)?.team === "minion")
                  .map((p) => `${p.seat + 1}. ${p.name}`)
                  .join(", ") || "—"}
              </strong>
            </p>
            <div className="row" style={{ gap: 12 }}>
              {game.demonBluffs.map((id) => (
                <Token key={id} character={characters.get(id)} size={70} />
              ))}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btn--primary" onClick={() => setCard({ heading: "Estos son tus Esbirros", characters: [] })}>
                <Eye /> «Tus Esbirros»
              </button>
              <button
                className="btn btn--primary"
                disabled={!game.demonBluffs.length}
                onClick={() =>
                  setCard({
                    heading: "Estos personajes no están en juego",
                    characters: game.demonBluffs.map((id) => characters.get(id)).filter((c): c is Character => !!c),
                  })
                }
              >
                <Eye /> Enseñar faroles
              </button>
              <button className="btn btn--small btn--ghost" onClick={onEditBluffs}>
                Cambiar faroles
              </button>
            </div>
          </>
        )}
        {step.kind === "character" && (
          <button className="btn btn--block btn--ghost" style={{ marginTop: 6 }} onClick={() => setChoosing(true)}>
            <Eye /> Enseñar un personaje…
          </button>
        )}

        {step.kind === "dawn" && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="small muted">
              ¿Quién ha muerto esta noche? Los que ha matado el Demonio ya están marcados; toca para cambiarlo. Los móviles de los
              jugadores lo verán al empezar el día.
            </span>
            <div className="chips">
              {game.players.map((p) => {
                // Sugerencia: quien tenga un recordatorio de muerte puesto esta noche.
                const marked = p.reminders.some((r) => /muert/i.test(r.label));
                return (
                  <button
                    key={p.id}
                    className={`chip ${marked && p.alive ? "chip--suggest" : ""}`}
                    aria-pressed={!p.alive}
                    onClick={() => onChange((g) => (p.alive ? rules.killPlayer(g, p.id) : rules.revivePlayer(g, p.id)))}
                  >
                    {!p.alive && <Skull />} {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ol className="night-list" aria-label="Orden de la noche">
        {steps.map((s, i) => (
          <li key={s.key}>
            <button
              className={`night-item ${i === index ? "night-item--current" : ""} ${i < index ? "night-item--done" : ""} ${s.dead ? "night-item--skip" : ""}`}
              onClick={() => onChange((g) => rules.setNightStep(g, i))}
            >
              <StepIcon step={s} size={30} />
              <span style={{ flex: 1 }}>{s.title}</span>
              <span className="muted small">{s.playerIds.map((id) => player(id).name).join(", ")}</span>
            </button>
          </li>
        ))}
      </ol>

      {choosing && (
        <Sheet onClose={() => setChoosing(false)} title="Enseñar un personaje" label="Enseñar un personaje">
          <p className="muted small" style={{ marginTop: 0 }}>
            Elige el encabezado (opcional) y toca el personaje para enseñarlo a pantalla completa.
          </p>
          <div className="heading-chips">
            {INFO_HEADINGS.filter((h) => h !== "Estos son tus Esbirros").map((h) => (
              <button key={h} className="chip" aria-pressed={heading === h} onClick={() => setHeading(heading === h ? undefined : h)}>
                {h}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <CharacterPicker
              characters={scriptCharacters}
              selected={[]}
              searchable
              onToggle={(id) => {
                const c = characters.get(id);
                if (!c) return;
                setChoosing(false);
                setCard({ heading, characters: [c] });
              }}
            />
          </div>
        </Sheet>
      )}

      {card && <ShowCard heading={card.heading} characters={card.characters} onClose={() => setCard(null)} />}

      <div className="action-bar">
        <button className="btn btn--ghost" style={{ flex: "0 0 auto" }} disabled={index === 0} onClick={() => onChange((g) => rules.setNightStep(g, index - 1))}>
          <ChevronLeft />
        </button>
        {last ? (
          <button className="btn btn--gold" onClick={() => onChange(rules.startDay)}>
            <Sun /> Empezar el día
          </button>
        ) : (
          <button className="btn btn--primary" onClick={() => onChange((g) => rules.setNightStep(g, index + 1))}>
            Siguiente <ChevronRight />
          </button>
        )}
      </div>
    </div>
  );
}
