import type { GameLogEntry } from "@domain/entities/Game";

/** Registro de la partida, lo último arriba, agrupado por fase para no repetir «Noche 2 ·» en cada línea. */
export function LogList({ log }: { log: GameLogEntry[] }) {
  const groups: { phase: string; entries: GameLogEntry[] }[] = [];
  for (const entry of [...log].reverse()) {
    const last = groups[groups.length - 1];
    if (last && last.phase === entry.phase) last.entries.push(entry);
    else groups.push({ phase: entry.phase, entries: [entry] });
  }
  if (!groups.length) return <p className="muted small">Todavía no ha pasado nada.</p>;
  return (
    <div className="log-groups">
      {groups.map((group, i) => (
        <section key={`${group.phase}-${i}`} className="log-group">
          <h3 className="log-group__title">{group.phase}</h3>
          <ul className="log">
            {group.entries.map((l, j) => (
              <li key={j}>{l.text}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
