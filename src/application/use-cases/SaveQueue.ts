/**
 * Cola de guardado: guarda en orden y, si falla (sin cobertura…), se puede reintentar con la
 * versión más reciente. Cada guardado lleva el estado entero, así que basta con guardar el último.
 */
export class SaveQueue<T> {
  private chain: Promise<void> = Promise.resolve();
  private pending: T | null = null;
  private failing = false;

  constructor(
    private readonly saveFn: (item: T) => Promise<void>,
    private readonly events: {
      /** El primer fallo (los siguientes, mientras siga fallando, no se avisan). */
      onError: (error: unknown) => void;
      /** Se ha vuelto a guardar después de fallar. */
      onRecovered: () => void;
    },
  ) {}

  /** Hay algo sin guardar porque el último intento falló. */
  get failed() {
    return this.failing;
  }

  save(item: T): Promise<void> {
    this.pending = item;
    this.chain = this.chain
      .then(() => this.saveFn(item))
      .then(() => {
        // Si entretanto llegó algo más nuevo, ese ya se guardará.
        if (this.pending !== item) return;
        this.pending = null;
        if (this.failing) {
          this.failing = false;
          this.events.onRecovered();
        }
      })
      .catch((error) => {
        if (!this.failing) this.events.onError(error);
        this.failing = true;
      });
    return this.chain;
  }

  /** Vuelve a intentar lo último que falló. Si no falta nada, no hace nada. */
  retry(): Promise<void> {
    return this.failing && this.pending !== null ? this.save(this.pending) : this.chain;
  }
}
