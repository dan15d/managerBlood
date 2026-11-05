import type { CharacterCatalog } from "@application/ports/CharacterCatalog";
import type { OfficialScriptSource } from "@application/ports/ScriptRepository";
import type { Character, Jinx } from "@domain/entities/Character";
import type { Script } from "@domain/entities/Script";
import characters from "./data/characters.json";
import jinxes from "./data/jinxes.json";
import scripts from "./data/scripts.json";

// Datos en español de la wiki de Villacuervos (villacuervos.es/wiki) con el orden de noche oficial
// de The Pandemonium Institute, y las incompatibilidades (jinxes) oficiales de la misma wiki.
// Se generan con un script aparte; no editar a mano. Los iconos están en public/roles (scripts/icons.mjs).

// La app puede servirse desde una subcarpeta (en GitHub Pages, /<repositorio>/): las rutas locales llevan esa base.
const localUrl = (path?: string) => (path && !path.startsWith("http") ? `${import.meta.env.BASE_URL}${path}` : path);
const withLocalIcons = (c: Character): Character => ({ ...c, image: localUrl(c.image), imageAlt: localUrl(c.imageAlt) });

export class StaticCharacterCatalog implements CharacterCatalog {
  private readonly byId: Map<string, Character>;

  constructor(
    private readonly list: Character[] = (characters as Character[]).map(withLocalIcons),
    private readonly jinxList: Jinx[] = jinxes as Jinx[],
  ) {
    this.byId = new Map(list.map((c) => [c.id, c]));
  }

  jinxes() {
    return this.jinxList;
  }

  all() {
    return this.list;
  }

  get(id: string) {
    return this.byId.get(id);
  }

  map() {
    return this.byId;
  }
}

export class StaticOfficialScripts implements OfficialScriptSource {
  list(): Script[] {
    return scripts as Script[];
  }
}
