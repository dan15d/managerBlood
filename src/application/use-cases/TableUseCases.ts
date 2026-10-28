import type { Script } from "@domain/entities/Script";
import type { Lobby, PlayerView, Seat } from "@domain/entities/Table";
import type { IdGenerator } from "../ports/IdGenerator";
import type { AdminAuth, LobbyGateway, PlayerGateway, Unsubscribe } from "../ports/TableGateway";

// Casos de uso de la mesa compartida: el acceso de Narrador, la sala donde se unen los
// jugadores y lo que ve cada jugador en su móvil.

export class AdminSession {
  constructor(private readonly auth: AdminAuth) {}

  get required() {
    return this.auth.required;
  }

  check() {
    return this.auth.isAdmin();
  }

  async login(password: string) {
    if (!password.trim()) throw new Error("Escribe la contraseña.");
    const ok = await this.auth.login(password);
    if (!ok) throw new Error("Contraseña incorrecta.");
  }

  logout() {
    return this.auth.logout();
  }
}

/** La sala del Narrador: se abre al elegir guion y se cierra al repartir (o al cancelar). */
export class ManageLobby {
  constructor(
    private readonly gateway: LobbyGateway,
    private readonly ids: IdGenerator,
  ) {}

  open(script: Script): Promise<Lobby> {
    return this.gateway.open({
      gameId: this.ids.uuid(),
      joinCode: this.ids.joinCode(),
      scriptId: script.id,
      scriptName: script.name,
      characterIds: script.characterIds,
    });
  }

  get(gameId: string) {
    return this.gateway.get(gameId);
  }

  listOpen() {
    return this.gateway.listOpen();
  }

  changeScript(gameId: string, script: Script) {
    return this.gateway.changeScript(gameId, { id: script.id, name: script.name, characterIds: script.characterIds });
  }

  seats(gameId: string) {
    return this.gateway.seats(gameId);
  }

  watch(gameId: string, onChange: (seats: Seat[]) => void): Unsubscribe {
    return this.gateway.watchSeats(gameId, onChange);
  }

  addSeat(gameId: string, name: string) {
    if (!name.trim()) throw new Error("Escribe el nombre.");
    return this.gateway.addSeat(gameId, name.trim());
  }

  removeSeat(seatId: string) {
    return this.gateway.removeSeat(seatId);
  }

  /** Mueve un asiento una posición (para ordenarlos como estén sentados). */
  move(gameId: string, seats: Seat[], seatId: string, delta: -1 | 1) {
    const order = seats.map((s) => s.id);
    const from = order.indexOf(seatId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return Promise.resolve();
    [order[from], order[to]] = [order[to], order[from]];
    return this.gateway.reorder(gameId, order);
  }

  close(gameId: string) {
    return this.gateway.close(gameId);
  }
}

/** El jugador: unirse con el código y seguir su partida en tiempo real. */
export class PlayerTable {
  constructor(private readonly gateway: PlayerGateway) {}

  join(code: string, name: string) {
    const clean = code.replace(/\s/g, "").toUpperCase();
    if (clean.length < 4) throw new Error("El código tiene 5 letras.");
    if (!name.trim()) throw new Error("Escribe tu nombre.");
    return this.gateway.join(clean, name.trim());
  }

  async current(): Promise<{ gameId: string; seatId: string } | null> {
    return (await this.gateway.mySeats())[0] ?? null;
  }

  view(gameId: string, seatId: string) {
    return this.gateway.view(gameId, seatId);
  }

  watch(gameId: string, seatId: string, onChange: (view: PlayerView | null) => void): Unsubscribe {
    return this.gateway.watch(gameId, seatId, onChange);
  }

  leave(seatId: string) {
    return this.gateway.leave(seatId);
  }
}
