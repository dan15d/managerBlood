import { describe, expect, it } from "vitest";
import { SaveQueue } from "@application/use-cases/SaveQueue";

// La cola de guardado del Narrador: si se pierde la conexión, no se pierde nada.

function setup() {
  const saved: number[] = [];
  const events: string[] = [];
  let online = true;
  const queue = new SaveQueue<number>(
    async (n) => {
      if (!online) throw new Error("Sin conexión");
      saved.push(n);
    },
    { onError: () => events.push("error"), onRecovered: () => events.push("recuperado") },
  );
  return { queue, saved, events, setOnline: (v: boolean) => (online = v) };
}

describe("Cola de guardado", () => {
  it("guarda en orden", async () => {
    const { queue, saved, events } = setup();
    void queue.save(1);
    await queue.save(2);
    expect(saved).toEqual([1, 2]);
    expect(events).toEqual([]);
    expect(queue.failed).toBe(false);
  });

  it("si falla, avisa una vez y al reintentar guarda lo último", async () => {
    const { queue, saved, events, setOnline } = setup();
    setOnline(false);
    void queue.save(1);
    await queue.save(2);
    expect(queue.failed).toBe(true);
    expect(events).toEqual(["error"]);
    // Sigue sin conexión: reintentar no vuelve a avisar.
    await queue.retry();
    expect(events).toEqual(["error"]);
    setOnline(true);
    await queue.retry();
    expect(saved).toEqual([2]);
    expect(events).toEqual(["error", "recuperado"]);
    expect(queue.failed).toBe(false);
    // Ya no falta nada: reintentar no guarda otra vez.
    await queue.retry();
    expect(saved).toEqual([2]);
  });

  it("un cambio nuevo que sí entra también arregla el fallo anterior", async () => {
    const { queue, saved, events, setOnline } = setup();
    setOnline(false);
    await queue.save(1);
    setOnline(true);
    await queue.save(2);
    expect(saved).toEqual([2]);
    expect(events).toEqual(["error", "recuperado"]);
    expect(queue.failed).toBe(false);
  });
});
