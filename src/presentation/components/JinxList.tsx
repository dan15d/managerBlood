import type { Character, Jinx } from "@domain/entities/Character";

/** Incompatibilidades (jinxes) con los dos personajes que las provocan. */
export function JinxList({ jinxes, characters }: { jinxes: Jinx[]; characters: Map<string, Character> }) {
  if (!jinxes.length) return null;
  const name = (id: string) => characters.get(id)?.name ?? id;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {jinxes.map((j) => (
        <p key={j.characterIds.join("+")} className="jinx" style={{ margin: 0 }}>
          <span className="jinx__pair">
            {name(j.characterIds[0])} + {name(j.characterIds[1])}
          </span>
          {j.text}
        </p>
      ))}
    </div>
  );
}
