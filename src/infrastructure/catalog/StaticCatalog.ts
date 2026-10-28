import type { CharacterCatalog } from "@application/ports/CharacterCatalog";
import type { OfficialScriptSource } from "@application/ports/ScriptRepository";
import type { Character } from "@domain/entities/Character";
import type { Script } from "@domain/entities/Script";
import characters from "./data/characters.json";
import scripts from "./data/scripts.json";

// Datos en español de la wiki de Villacuervos (villacuervos.es/wiki) con el orden de noche oficial
// de The Pandemonium Institute. Se generan con un script aparte; no editar a mano.

export class StaticCharacterCatalog implements CharacterCatalog {
  private readonly byId: Map<string, Character>;

  constructor(private readonly list: Character[] = characters as Character[]) {
    this.byId = new Map(list.map((c) => [c.id, c]));
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
