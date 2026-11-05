import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * V2-16: cada transacción viva se historiza una sola vez. El rechazo guardaba
 * la misma entidad (con el Id de TransaccionesDebito) y pisaba otro histórico.
 * Falla si ya hay orígenes duplicados: hay que depurarlos antes, a mano.
 */
export class UniqueHistoricoOrigen1737900009000 implements MigrationInterface {
  name = 'UniqueHistoricoOrigen1737900009000';

  private async existe(q: QueryRunner): Promise<boolean> {
    const rows: Array<{ cnt: number | string }> = await q.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'HistoricoTransaccionesDebito'
          AND INDEX_NAME = 'UQ_HistoricoTransaccionesDebito_IdTransaccionOrigen'`,
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    if (await this.existe(q)) return;
    await q.query(
      'CREATE UNIQUE INDEX UQ_HistoricoTransaccionesDebito_IdTransaccionOrigen ON HistoricoTransaccionesDebito (IdTransaccionOrigen)',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    if (!(await this.existe(q))) return;
    await q.query(
      'DROP INDEX UQ_HistoricoTransaccionesDebito_IdTransaccionOrigen ON HistoricoTransaccionesDebito',
    );
  }
}
