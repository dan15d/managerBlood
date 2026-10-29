import type { Character, CharacterPair } from "@domain/entities/Character";

/** Incompatibilidades (jinxes) o interacciones, con los dos personajes que las provocan. */
export function JinxList<T extends CharacterPair>({
  jinxes,
  characters,
  label,
}: {
  jinxes: T[];
  characters: Map<string, Character>;
  /** Etiqueta opcional junto a la pareja (p. ej. «Oficial»). */
  label?: (pair: T) => string | undefined;
}) {
  if (!jinxes.length) return null;
  const name = (id: string) => characters.get(id)?.name ?? id;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {jinxes.map((j) => (
        <p key={j.characterIds.join("+") + j.text.slice(0, 20)} className="jinx" style={{ margin: 0 }}>
          <span className="jinx__pair">
            {name(j.characterIds[0])} + {name(j.characterIds[1])}
            {label?.(j) && <span className="badge" style={{ marginLeft: 6 }}>{label(j)}</span>}
          </span>
          {j.text}
        </p>
      ))}
    </div>
  );
}
