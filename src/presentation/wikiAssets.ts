// Imágenes de la wiki de Villacuervos (se cargan desde allí, no se copian al repositorio).
// Si la wiki cambia sus archivos, se ve el diseño de reserva (degradado o ficha sin icono).
const WIKI = "https://villacuervos.es";

const EDITION_LOGOS: Record<string, string> = {
  "trouble-brewing": `${WIKI}/media/editions/logo_trouble_brewing.png`,
  "bad-moon-rising": `${WIKI}/media/editions/logo_badmoonrising.png`,
  "sects-and-violets": `${WIKI}/media/editions/logo_sectsviolets.png`,
};

/** Logo oficial de la edición de un guion (nada si es un guion personalizado). */
export const editionLogo = (scriptId: string): string | undefined => EDITION_LOGOS[scriptId];

/** Iconos de la hoja de noche para los pasos que no son personajes. */
export const NIGHT_ICONS = {
  dusk: `${WIKI}/img/dusk.webp`,
  dawn: `${WIKI}/img/dawn.webp`,
  minion_info: `${WIKI}/img/minion.webp`,
  demon_info: `${WIKI}/img/demon.webp`,
} as const;
