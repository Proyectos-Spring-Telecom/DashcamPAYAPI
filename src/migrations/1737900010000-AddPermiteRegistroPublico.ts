import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * H-64: cada cliente decide si aparece en /clientes/public y si acepta el
 * registro de pasajeros sin sesión. DEFAULT 1 conserva el comportamiento
 * actual; para cerrar el registro de un cliente se pone en 0.
 */
export class AddPermiteRegistroPublico1737900010000 implements MigrationInterface {
  name = 'AddPermiteRegistroPublico1737900010000';

  private async existe(q: QueryRunner): Promise<boolean> {
    const rows: Array<{ cnt: number | string }> = await q.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Clientes'
          AND COLUMN_NAME = 'PermiteRegistroPublico'`,
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    if (await this.existe(q)) return;
    await q.query(
      'ALTER TABLE Clientes ADD COLUMN PermiteRegistroPublico TINYINT NOT NULL DEFAULT 1',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    if (!(await this.existe(q))) return;
    await q.query('ALTER TABLE Clientes DROP COLUMN PermiteRegistroPublico');
  }
}
