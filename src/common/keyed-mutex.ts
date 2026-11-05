/**
 * Exclusión mutua por clave dentro del proceso (H-08: un débito a la vez por
 * monedero). No ocupa conexiones del pool. Entre instancias, la consistencia la
 * dan el descuento atómico (Saldo >= monto) y los cierres condicionados
 * (WHERE ControlTransaccion = ABIERTA).
 */
export class KeyedMutex {
  private readonly colas = new Map<string, Promise<void>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previa = this.colas.get(key) ?? Promise.resolve();
    let liberar!: () => void;
    const turno = new Promise<void>((r) => (liberar = r));
    const cola = previa.then(() => turno);
    this.colas.set(key, cola);
    await previa;
    try {
      return await fn();
    } finally {
      liberar();
      if (this.colas.get(key) === cola) this.colas.delete(key);
    }
  }
}
