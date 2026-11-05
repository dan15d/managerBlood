// Descarga los iconos de los personajes de la wiki de Villacuervos y los deja en public/roles como
// WebP de 256 px (unos 10 kB cada uno), para que la app no dependa de la wiki ni de la cobertura.
// Después apunta characters.json a los archivos locales. Es idempotente: los que ya están, no se bajan.
//
//   npm install --no-save sharp
//   node scripts/icons.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const DATA = new URL("../src/infrastructure/catalog/data/characters.json", import.meta.url);
const OUT = new URL("../public/roles/", import.meta.url);
const IMG = new URL("../public/img/", import.meta.url);
const SIZE = 256;
const PARALLEL = 6;

// Logos de las ediciones e iconos de la hoja de noche (los usa src/presentation/wikiAssets.ts).
const EXTRAS = {
  "logo-trouble-brewing.webp": ["https://villacuervos.es/media/editions/logo_trouble_brewing.png", 640],
  "logo-bad-moon-rising.webp": ["https://villacuervos.es/media/editions/logo_badmoonrising.png", 640],
  "logo-sects-and-violets.webp": ["https://villacuervos.es/media/editions/logo_sectsviolets.png", 640],
  "dusk.webp": ["https://villacuervos.es/img/dusk.webp", SIZE],
  "dawn.webp": ["https://villacuervos.es/img/dawn.webp", SIZE],
  "minion.webp": ["https://villacuervos.es/img/minion.webp", SIZE],
  "demon.webp": ["https://villacuervos.es/img/demon.webp", SIZE],
};

mkdirSync(OUT, { recursive: true });
mkdirSync(IMG, { recursive: true });
const characters = JSON.parse(readFileSync(DATA, "utf8"));

/** Un icono por descargar: de dónde, a qué archivo y qué campo del personaje cambia. */
const jobs = [];
for (const c of characters) {
  for (const field of ["image", "imageAlt"]) {
    const url = c[field];
    if (!url || !url.startsWith("http")) continue;
    const file = field === "image" ? `${c.id}.webp` : `${c.id}-alt.webp`;
    jobs.push({ c, field, url, file });
  }
}

let done = 0;
let failed = 0;
async function run(job) {
  const target = new URL(job.file, OUT);
  if (!existsSync(target)) {
    const res = await fetch(job.url);
    if (!res.ok) {
      failed++;
      console.error(`✗ ${job.url} (${res.status})`);
      return;
    }
    const png = Buffer.from(await res.arrayBuffer());
    const webp = await sharp(png).resize(SIZE, SIZE, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    writeFileSync(target, webp);
  }
  job.c[job.field] = `roles/${job.file}`;
  done++;
  if (done % 50 === 0) console.log(`${done}/${jobs.length}`);
}

const queue = [...jobs];
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  while (queue.length) await run(queue.shift());
}));

writeFileSync(DATA, JSON.stringify(characters));
console.log(`${done} iconos en public/roles; ${failed} fallos.`);

for (const [file, [url, width]] of Object.entries(EXTRAS)) {
  const target = new URL(file, IMG);
  if (existsSync(target)) continue;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`✗ ${url} (${res.status})`);
    continue;
  }
  const source = Buffer.from(await res.arrayBuffer());
  writeFileSync(target, await sharp(source).resize(width, width, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer());
  console.log(`✓ public/img/${file}`);
}
