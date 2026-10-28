import { useState } from "react";
import { editionLogo } from "../wikiAssets";

/** Cabecera de un guion: el logo oficial de su edición o, si es personalizado, su nombre. */
export function EditionBanner({ scriptId, name }: { scriptId: string; name: string }) {
  const logo = editionLogo(scriptId);
  const [broken, setBroken] = useState(false);
  const showLogo = !!logo && !broken;
  return (
    <div className={`edition-banner ${showLogo ? "edition-banner--logo" : ""}`}>
      {showLogo && <img className="edition-banner__logo" src={logo} alt="" loading="lazy" onError={() => setBroken(true)} />}
      <h3 className={showLogo ? "sr-only" : undefined}>{name}</h3>
    </div>
  );
}
