import type { Character } from "@domain/entities/Character";
import type { Game, Player } from "@domain/entities/Game";
import { alivePlayers, phaseLabel, voteThreshold } from "@domain/services/GameRules";
import { useState, type CSSProperties } from "react";
import { SeatCircle } from "../../components/SeatCircle";
import { Token } from "../../components/Token";
import { Moon, Sun, Trash2, VenetianMask, X } from "lucide-react";

interface Props {
  game: Game;
  characters: Map<string, Character>;
  highlighted: string[];
  hidden: boolean;
  /** Modo «toca una ficha»: se apagan las que no se pueden elegir. */
  picking?: boolean;
  /** Línea bajo la fase (el paso de la noche en el que se va). */
  centerNote?: string;
  onSelect: (playerId: string) => void;
  onRemoveReminder?: (playerId: string, reminderId: string) => void;
}

/** Un recordatorio dibujado junto a la ficha: el de un personaje, uno propio o lo que cree ser el Borracho. */
interface Bubble {
  key: string;
  label: string;
  /** Personaje que pone el recordatorio (su icono va en la burbuja). */
  source?: Character;
  reminderId?: string;
  shown?: boolean;
}

function bubblesOf(p: Player, characters: Map<string, Character>): Bubble[] {
  const shown = p.shownCharacterId ? characters.get(p.shownCharacterId) : undefined;
  return [
    ...(shown ? [{ key: "shown", label: `Cree ser ${shown.name}`, source: shown, shown: true }] : []),
    ...p.reminders.map((r) => ({ key: r.id, label: r.label, source: characters.get(r.sourceCharacterId), reminderId: r.id })),
  ];
}

/**
 * Ángulos de las burbujas alrededor de la ficha: empiezan mirando al centro de la mesa (como los
 * recordatorios físicos) y se reparten a los lados. Debajo va el nombre, así que ahí no se ponen.
 */
function bubbleAngles(seatAngle: number, count: number, step: number): number[] {
  const toCenter = seatAngle + Math.PI;
  const angles: number[] = [];
  for (let k = 0; angles.length < count && k < 80; k++) {
    const angle = toCenter + Math.ceil(k / 2) * step * (k % 2 ? 1 : -1);
    if (Math.sin(angle) > 0.8) continue;
    angles.push(angle);
  }
  return angles;
}

const initials = (label: string) => label.trim().charAt(0).toUpperCase();

/** Icono del personaje que pone el recordatorio; si no hay o no carga, la inicial del recordatorio. */
function BubbleIcon({ src, label }: { src?: string; label: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <>{initials(label)}</>;
  return <img src={src} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />;
}

/** Los jugadores en círculo, como en la mesa, empezando arriba y en el sentido de las agujas del reloj. */
export function Grimoire({ game, characters, highlighted, hidden, picking, centerNote, onSelect, onRemoveReminder }: Props) {
  const alive = alivePlayers(game).length;
  // Burbuja abierta: su texto se lee en el centro de la mesa, donde siempre cabe.
  const [open, setOpen] = useState<{ playerId: string; key: string } | null>(null);
  const openPlayer = open ? game.players.find((p) => p.id === open.playerId) : undefined;
  const openBubble = openPlayer && !hidden ? bubblesOf(openPlayer, characters).find((b) => b.key === open!.key) : undefined;

  return (
    <SeatCircle
      items={game.players}
      itemKey={(p) => p.id}
      center={
        openPlayer && openBubble ? (
          <div className="reminder-card" role="status">
            {openBubble.source ? <Token character={openBubble.source} size={52} /> : <span className="reminder-bubble reminder-bubble--static">{initials(openBubble.label)}</span>}
            <strong className="reminder-card__label">{openBubble.label}</strong>
            <span className="small muted">
              {openBubble.shown ? "" : openBubble.source ? `de ${openBubble.source.name} · ` : ""}en {openPlayer.name}
            </span>
            <div className="row" style={{ justifyContent: "center", gap: 6 }}>
              {openBubble.reminderId && onRemoveReminder && (
                <button
                  className="btn btn--small btn--ghost"
                  onClick={() => {
                    onRemoveReminder(openPlayer.id, openBubble.reminderId!);
                    setOpen(null);
                  }}
                >
                  <Trash2 /> Quitar
                </button>
              )}
              <button className="btn btn--small" aria-label="Cerrar" onClick={() => setOpen(null)}>
                <X />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={`phase-pill phase-pill--${game.phase.kind}`}>
              {game.phase.kind === "night" ? <Moon /> : <Sun />} {phaseLabel(game.phase)}
            </div>
            {centerNote && <div className="circle__note">{centerNote}</div>}
            <div className="stat-row">
              <div className="stat">
                <span className="big-number">{alive}</span>
                <span>vivos</span>
              </div>
              <div className="stat">
                <span className="big-number">{voteThreshold(game)}</span>
                <span title="Votos necesarios para ejecutar">votos</span>
              </div>
            </div>
          </>
        )
      }
      renderSeat={(p, size, seatAngle) => {
        const character = characters.get(p.characterId);
        const bubbles = hidden ? [] : bubblesOf(p, characters);
        const b = Math.round(Math.min(32, Math.max(18, size * 0.36)));
        const radius = size / 2 + b * 0.2;
        const angles = bubbleAngles(seatAngle, bubbles.length, (b * 1.05) / radius);
        return (
          <>
            <Token
              character={character}
              alignment={p.alignment}
              size={size}
              dead={!p.alive}
              dim={picking && !highlighted.includes(p.id)}
              hidden={hidden}
              glow={highlighted.includes(p.id)}
              onClick={() => onSelect(p.id)}
              label={`${p.name}${hidden ? "" : `, ${character?.name}`}${p.alive ? "" : ", muerto"}`}
            />
            <span className={`seat__name ${!hidden && p.alignment === "evil" ? "seat__name--evil" : ""}`}>
              {!p.alive && !p.ghostVoteUsed && <span title="Le queda el voto">● </span>}
              {p.name}
            </span>
            {bubbles.map((bubble, i) => {
              const isOpen = open?.playerId === p.id && open.key === bubble.key;
              const style = {
                "--b": `${b}px`,
                left: `calc(50% + ${Math.cos(angles[i]) * radius}px)`,
                top: `${size / 2 + Math.sin(angles[i]) * radius}px`,
                "--team": `var(--${bubble.source?.team ?? "line-strong"})`,
              } as CSSProperties;
              return (
                <button
                  key={bubble.key}
                  type="button"
                  className={`reminder-bubble ${bubble.shown ? "reminder-bubble--shown" : ""}`}
                  style={style}
                  aria-pressed={isOpen}
                  aria-label={`${bubble.label} en ${p.name}`}
                  title={bubble.label}
                  onClick={() => setOpen(isOpen ? null : { playerId: p.id, key: bubble.key })}
                >
                  {bubble.shown ? <VenetianMask /> : <BubbleIcon src={bubble.source?.image} label={bubble.label} />}
                </button>
              );
            })}
          </>
        );
      }}
    />
  );
}
