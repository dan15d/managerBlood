// Imágenes de la wiki de Villacuervos copiadas a public/img (las baja scripts/icons.mjs), para que
// la app no dependa de la wiki ni de la cobertura. Si alguna falta, se ve el diseño de reserva.
const IMG = `${import.meta.env.BASE_URL}img/`;

const EDITION_LOGOS: Record<string, string> = {
  "trouble-brewing": `${IMG}logo-trouble-brewing.webp`,
  "bad-moon-rising": `${IMG}logo-bad-moon-rising.webp`,
  "sects-and-violets": `${IMG}logo-sects-and-violets.webp`,
};

/** Logo oficial de la edición de un guion (nada si es un guion personalizado). */
export const editionLogo = (scriptId: string): string | undefined => EDITION_LOGOS[scriptId];

/** Iconos de la hoja de noche para los pasos que no son personajes. */
export const NIGHT_ICONS = {
  dusk: `${IMG}dusk.webp`,
  dawn: `${IMG}dawn.webp`,
  minion_info: `${IMG}minion.webp`,
  demon_info: `${IMG}demon.webp`,
} as const;
