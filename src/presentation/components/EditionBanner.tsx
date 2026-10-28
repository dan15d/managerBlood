import { useState } from "react";
import { editionLogo } from "../wikiAssets";

/** Cabecera de un guion: el logo oficial de su edición, la imagen que le hayan puesto o, si no, su nombre. */
export function EditionBanner({ scriptId, name, image }: { scriptId: string; name: string; image?: string }) {
  const logo = editionLogo(scriptId);
  const [broken, setBroken] = useState<string | null>(null);
  if (image && broken !== image) {
    return (
      <div className="edition-banner edition-banner--image">
        <img className="edition-banner__logo" src={image} alt="" loading="lazy" onError={() => setBroken(image)} />
        <h3>{name}</h3>
      </div>
    );
  }
  const showLogo = !!logo && broken !== logo;
  return (
    <div className={`edition-banner ${showLogo ? "edition-banner--logo" : ""}`}>
      {showLogo && <img className="edition-banner__logo" src={logo} alt="" loading="lazy" onError={() => setBroken(logo)} />}
      <h3 className={showLogo ? "sr-only" : undefined}>{name}</h3>
    </div>
  );
}
