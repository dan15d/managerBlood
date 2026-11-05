import { describe, expect, it } from "vitest";
import { GameConflictError } from "@application/ports/GameRepository";
import { SaveQueue } from "@application/use-cases/SaveQueue";
import type { Game } from "@domain/entities/Game";
import { LocalStorageGameRepository } from "@infrastructure/persistence/LocalStorageRepositories";

// El Grimorio en dos dispositivos: nadie pisa lo que guardó el otro sin enterarse.

const game = (updatedAt: string): Game =>
  ({ id: "g1", name: "Prueba", players: [], log: [], phase: { kind: "night", number: 1 }, status: "in_progress", updatedAt }) as unknown as Game;

describe("Guardar con la versión esperada", () => {
  it("guarda si la versión guardada es la que vio este dispositivo", async () => {
    const repo = new LocalStorageGameRepository();
    await repo.save(game("t1"));
    await repo.save(game("t2"), "t1");
    expect((await repo.get("g1"))?.updatedAt).toBe("t2");
  });

  it("si otro guardó entretanto, no la pisa y lanza el conflicto", async () => {
    const repo = new LocalStorageGameRepository();
    await repo.save(game("t1"));
    await repo.save(game("t2"), "t1"); // el otro dispositivo
    await expect(repo.save(game("t3"), "t1")).rejects.toBeInstanceOf(GameConflictError);
    expect((await repo.get("g1"))?.updatedAt).toBe("t2");
  });

  it("una partida nueva se guarda sin versión esperada", async () => {
    const repo = new LocalStorageGameRepository();
    await repo.save(game("t1"), undefined);
    expect((await repo.get("g1"))?.updatedAt).toBe("t1");
  });
});

describe("Descartar lo pendiente de la cola", () => {
  it("lo encolado antes de descartar ya no se guarda, y lo de después sí", async () => {
    const saved: number[] = [];
    let block: () => void = () => undefined;
    const first = new Promise<void>((resolve) => (block = resolve));
    const queue = new SaveQueue<number>(
      async (n) => {
        if (n === 1) await first;
        saved.push(n);
      },
      { onError: () => undefined, onRecovered: () => undefined },
    );
    void queue.save(1);
    await new Promise((r) => setTimeout(r)); // el 1 ya está guardándose
    void queue.save(2);
    queue.discard();
    block();
    await queue.save(3);
    expect(saved).toEqual([1, 3]);
    expect(queue.failed).toBe(false);
  });

  it("descartar quita el fallo pendiente: reintentar no vuelve a guardar lo viejo", async () => {
    const saved: number[] = [];
    const queue = new SaveQueue<number>(
      async (n) => {
        if (n === 1) throw new Error("sin conexión");
        saved.push(n);
      },
      { onError: () => undefined, onRecovered: () => undefined },
    );
    await queue.save(1);
    expect(queue.failed).toBe(true);
    queue.discard();
    expect(queue.failed).toBe(false);
    await queue.retry();
    expect(saved).toEqual([]);
  });
});
