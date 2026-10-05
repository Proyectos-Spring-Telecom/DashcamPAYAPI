import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClaveIdempotenciaRecarga1737900004000
  implements MigrationInterface
{
  name = 'AddClaveIdempotenciaRecarga1737900004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'TransaccionesRecarga',
      'HistoricoTransaccionesRecarga',
    ]) {
      const rows: Array<{ cnt: number | string }> = await queryRunner.query(
        `
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = 'ClaveIdempotencia'
      `,
        [table],
      );
      if (Number(rows[0]?.cnt ?? 0) === 0) {
        await queryRunner.query(
          `ALTER TABLE ${table} ADD COLUMN ClaveIdempotencia VARCHAR(100) NULL`,
        );
      }
    }

    const idx: Array<{ cnt: number | string }> = await queryRunner.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'TransaccionesRecarga'
        AND INDEX_NAME = 'UQ_TransaccionesRecarga_ClaveIdempotencia'
    `);
    if (Number(idx[0]?.cnt ?? 0) === 0) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX UQ_TransaccionesRecarga_ClaveIdempotencia ON TransaccionesRecarga (ClaveIdempotencia)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const idx: Array<{ cnt: number | string }> = await queryRunner.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'TransaccionesRecarga'
        AND INDEX_NAME = 'UQ_TransaccionesRecarga_ClaveIdempotencia'
    `);
    if (Number(idx[0]?.cnt ?? 0) > 0) {
      await queryRunner.query(
        `DROP INDEX UQ_TransaccionesRecarga_ClaveIdempotencia ON TransaccionesRecarga`,
      );
    }
    for (const table of [
      'TransaccionesRecarga',
      'HistoricoTransaccionesRecarga',
    ]) {
      const rows: Array<{ cnt: number | string }> = await queryRunner.query(
        `
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = 'ClaveIdempotencia'
      `,
        [table],
      );
      if (Number(rows[0]?.cnt ?? 0) > 0) {
        await queryRunner.query(
          `ALTER TABLE ${table} DROP COLUMN ClaveIdempotencia`,
        );
      }
    }
  }
}
