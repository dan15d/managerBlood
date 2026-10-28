import type { Script } from "@domain/entities/Script";
import type { CharacterCatalog } from "../ports/CharacterCatalog";
import type { IdGenerator } from "../ports/IdGenerator";
import type { CustomScriptRepository, OfficialScriptSource } from "../ports/ScriptRepository";

export class ListScripts {
  constructor(
    private readonly official: OfficialScriptSource,
    private readonly custom: CustomScriptRepository,
  ) {}

  async execute(): Promise<Script[]> {
    const mine = await this.custom.list();
    return [...this.official.list(), ...mine.sort((a, b) => a.name.localeCompare(b.name, "es"))];
  }
}

export class SaveCustomScript {
  constructor(
    private readonly repo: CustomScriptRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: Omit<Script, "id" | "official"> & { id?: string }): Promise<Script> {
    const name = input.name.trim();
    if (!name) throw new Error("Ponle un nombre al guion.");
    if (input.characterIds.length < 5) throw new Error("Un guion necesita al menos 5 personajes.");
    const script: Script = { ...input, id: input.id ?? this.ids.uuid(), name, author: input.author.trim(), official: false };
    await this.repo.save(script);
    return script;
  }
}

export class DeleteCustomScript {
  constructor(private readonly repo: CustomScriptRepository) {}
  execute(id: string) {
    return this.repo.delete(id);
  }
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "");

/**
 * Lee el JSON de la herramienta oficial de guiones (script.bloodontheclocktower.com):
 * una lista de ids o de objetos { id }, con un objeto opcional { id: "_meta", name, author }.
 */
export class ParseScriptJson {
  constructor(private readonly catalog: CharacterCatalog) {}

  execute(text: string): { name: string; author: string; logo?: string; characterIds: string[]; unknown: string[] } {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("No es un JSON válido.");
    }
    if (!Array.isArray(data)) throw new Error("El JSON de un guion debe ser una lista.");
    const index = new Map<string, string>();
    for (const c of this.catalog.all()) {
      index.set(normalize(c.name), c.id);
      if (c.nameEn) index.set(normalize(c.nameEn), c.id);
      index.set(normalize(c.id), c.id);
    }
    let name = "";
    let author = "";
    let logo: string | undefined;
    const characterIds: string[] = [];
    const unknown: string[] = [];
    for (const item of data) {
      const raw = typeof item === "string" ? item : (item as { id?: string } | null)?.id;
      if (!raw) continue;
      if (raw === "_meta") {
        name = String((item as { name?: string }).name ?? "");
        author = String((item as { author?: string }).author ?? "");
        const url = (item as { logo?: unknown }).logo;
        if (typeof url === "string" && url.startsWith("https://")) logo = url;
        continue;
      }
      const id = index.get(normalize(raw));
      if (!id) unknown.push(raw);
      else if (!characterIds.includes(id)) characterIds.push(id);
    }
    return { name, author, logo, characterIds, unknown };
  }
}

/** Exporta un guion en el formato de la herramienta oficial. */
export const scriptToJson = (script: Script) =>
  JSON.stringify(
    [
      // El logo solo viaja si es una URL: una imagen subida no cabe en el JSON de la herramienta oficial.
      { id: "_meta", name: script.name, author: script.author, ...(script.image?.startsWith("https://") ? { logo: script.image } : {}) },
      ...script.characterIds,
    ],
    null,
    2,
  );
