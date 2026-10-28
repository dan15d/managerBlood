/** Error de reglas del juego: el mensaje se enseña tal cual al Narrador. */
export class RuleViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleViolation";
  }
}
