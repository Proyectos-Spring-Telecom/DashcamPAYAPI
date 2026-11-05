import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * V2-18: anti doble cobro en débitos. Agrega la columna
 * TransaccionesDebito.ClaveIdempotencia (VARCHAR(100) NULL) si no existe y el
 * índice UNIQUE UQ_TransaccionesDebito_ClaveIdempotencia sobre ella.
 *
 * Los NULL no chocan entre sí en un UNIQUE de MySQL, por lo que los débitos
 * sin clave de idempotencia siguen permitidos. Idempotente: comprueba
 * information_schema antes de cada DDL (mismo patrón que la migración
 * 1737900004000 de recarga). Equivale al script de referencia
 * scripts/sql/UQ_TransaccionesDebito_ClaveIdempotencia.sql.
 */
export class UniqueDebitoClaveIdempotencia1737900011000
  implements MigrationInterface
{
  name = 'UniqueDebitoClaveIdempotencia1737900011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols: Array<{ cnt: number | string }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'TransaccionesDebito'
        AND COLUMN_NAME = 'ClaveIdempotencia'
    `,
    );
    if (Number(cols[0]?.cnt ?? 0) === 0) {
      await queryRunner.query(
        `ALTER TABLE TransaccionesDebito ADD COLUMN ClaveIdempotencia VARCHAR(100) NULL`,
      );
    }

    const idx: Array<{ cnt: number | string }> = await queryRunner.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'TransaccionesDebito'
        AND INDEX_NAME = 'UQ_TransaccionesDebito_ClaveIdempotencia'
    `);
    if (Number(idx[0]?.cnt ?? 0) === 0) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX UQ_TransaccionesDebito_ClaveIdempotencia ON TransaccionesDebito (ClaveIdempotencia)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const idx: Array<{ cnt: number | string }> = await queryRunner.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'TransaccionesDebito'
        AND INDEX_NAME = 'UQ_TransaccionesDebito_ClaveIdempotencia'
    `);
    if (Number(idx[0]?.cnt ?? 0) > 0) {
      await queryRunner.query(
        `DROP INDEX UQ_TransaccionesDebito_ClaveIdempotencia ON TransaccionesDebito`,
      );
    }

    const cols: Array<{ cnt: number | string }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'TransaccionesDebito'
        AND COLUMN_NAME = 'ClaveIdempotencia'
    `,
    );
    if (Number(cols[0]?.cnt ?? 0) > 0) {
      await queryRunner.query(
        `ALTER TABLE TransaccionesDebito DROP COLUMN ClaveIdempotencia`,
      );
    }
  }
}
