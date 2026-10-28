import type { GameRepository } from "@application/ports/GameRepository";
import type { CustomScriptRepository } from "@application/ports/ScriptRepository";
import { summarize } from "@application/use-cases/GameUseCases";
import type { Game } from "@domain/entities/Game";
import type { Script } from "@domain/entities/Script";

// Guardado en el navegador: la app funciona sin cuenta ni conexión. Si el navegador no deja
// guardar (modo privado…), se trabaja en memoria y se pierde al cerrar.

class JsonStore<T extends { id: string }> {
  private memory: Record<string, T> = {};

  constructor(private readonly key: string) {}

  read(): Record<string, T> {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? (JSON.parse(raw) as Record<string, T>) : this.memory;
    } catch {
      return this.memory;
    }
  }

  write(data: Record<string, T>) {
    this.memory = data;
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch {
      /* sin almacenamiento: queda en memoria */
    }
  }
}

export class LocalStorageGameRepository implements GameRepository {
  private readonly store = new JsonStore<Game>("grimorio.games");

  async list() {
    return Object.values(this.store.read()).map(summarize);
  }

  async get(id: string) {
    return this.store.read()[id] ?? null;
  }

  async save(game: Game) {
    this.store.write({ ...this.store.read(), [game.id]: game });
  }

  async delete(id: string) {
    const { [id]: _removed, ...rest } = this.store.read();
    this.store.write(rest);
  }
}

export class LocalStorageScriptRepository implements CustomScriptRepository {
  private readonly store = new JsonStore<Script>("grimorio.scripts");

  async list() {
    return Object.values(this.store.read());
  }

  async save(script: Script) {
    this.store.write({ ...this.store.read(), [script.id]: script });
  }

  async delete(id: string) {
    const { [id]: _removed, ...rest } = this.store.read();
    this.store.write(rest);
  }
}
