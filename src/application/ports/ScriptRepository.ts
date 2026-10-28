import type { Script } from "@domain/entities/Script";

/** Guiones oficiales: solo lectura. */
export interface OfficialScriptSource {
  list(): Script[];
}

/** Guiones creados por el Narrador. */
export interface CustomScriptRepository {
  list(): Promise<Script[]>;
  save(script: Script): Promise<void>;
  delete(id: string): Promise<void>;
}
