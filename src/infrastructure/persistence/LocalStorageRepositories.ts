import { GameConflictError, type GameRepository } from "@application/ports/GameRepository";
import type { CustomScriptRepository } from "@application/ports/ScriptRepository";
import type { AdminAuth, TablePublisher } from "@application/ports/TableGateway";
import { summarize } from "@application/use-cases/GameUseCases";
import type { Game, StoredGame } from "@domain/entities/Game";
import { upgradeGame } from "@domain/services/GameSchema";
import type { Script } from "@domain/entities/Script";

// Guardado en el navegador: la app funciona sin cuenta ni conexión. Si el navegador no deja
// guardar (modo privado…), se trabaja en memoria y se pierde al cerrar.

class JsonStore<T extends { id: string }> {
  private memory: Record<string, T> = {};

  constructor(readonly key: string) {}

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
  private readonly store = new JsonStore<StoredGame>("grimorio.games");

  async list() {
    return Object.values(this.store.read()).map(summarize);
  }

  async get(id: string): Promise<Game | null> {
    const stored = this.store.read()[id];
    return stored ? upgradeGame(stored) : null;
  }

  async save(game: Game, expectUpdatedAt?: string) {
    const all = this.store.read();
    if (expectUpdatedAt !== undefined && all[game.id] && all[game.id].updatedAt !== expectUpdatedAt) throw new GameConflictError();
    this.store.write({ ...all, [game.id]: game });
  }

  async delete(id: string) {
    const { [id]: _removed, ...rest } = this.store.read();
    this.store.write(rest);
  }

  /** Otra pestaña del mismo navegador: el navegador avisa cuando cambia lo guardado. */
  watch(id: string, onChange: (game: Game | null) => void) {
    if (typeof window === "undefined") return () => undefined;
    const listener = (e: StorageEvent) => {
      if (e.key !== this.store.key) return;
      // Si no se puede leer (guardada por una versión más nueva de la app), se ignora: al guardar saldrá el aviso.
      this.get(id).then(onChange, () => undefined);
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
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

// Sin nube no hay jugadores conectados: quien abre la app es el Narrador y no se publica nada.
export class LocalAdminAuth implements AdminAuth {
  readonly required = false;
  async isAdmin() {
    return true;
  }
  async login() {
    return true;
  }
  async logout() {}
}

export class NoTablePublisher implements TablePublisher {
  async publish() {}
  async remove() {}
}
