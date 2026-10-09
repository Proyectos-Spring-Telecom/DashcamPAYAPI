import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * H-66: identificadores opacos (ULID) para recursos sensibles.
 *
 * Cambios ADITIVOS y compatibles (no rompen los flujos actuales):
 *   - Columna `PublicId CHAR(26) NULL` + índice UNIQUE en `Pasajeros`,
 *     `Monederos` y `TransaccionesDebito`.
 *
 * La PK numérica (`Id`) NO se toca: los endpoints siguen aceptando el id
 * numérico y, de forma aditiva, el PublicId durante la transición. Los NULL no
 * chocan entre sí en un UNIQUE de MySQL, por lo que las filas sin PublicId
 * (históricas o creadas por rutas aún no migradas) siguen permitidas.
 *
 * BACKFILL DE HISTÓRICOS (PENDIENTE, correr aparte): un ULID por fila no puede
 * generarse en SQL puro de forma portable, así que esta migración deja el
 * PublicId en NULL para las filas existentes. El backfill (p. ej. un script que
 * recorra las filas con PublicId IS NULL y les asigne `ulid()`) debe ejecutarse
 * por separado y de forma coordinada. Las filas nuevas ya nacen con PublicId
 * desde el servicio (pasajeros y monederos; transacciones débito queda como
 * pendiente por estar en la ruta de dinero).
 *
 * Idempotente: comprueba information_schema antes de cada DDL (mismo patrón que
 * 1737900011000 y 1737900013000). No borra datos ni cambia la PK.
 */
export class OpaqueIds1737900014000 implements MigrationInterface {
  name = 'OpaqueIds1737900014000';

  private async columnaExiste(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows: Array<{ cnt: number | string }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
      [table, column],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  private async indexExiste(
    queryRunner: QueryRunner,
    table: string,
    name: string,
  ): Promise<boolean> {
    const rows: Array<{ cnt: number | string }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
    `,
      [table, name],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Pasajeros ---
    if (!(await this.columnaExiste(queryRunner, 'Pasajeros', 'PublicId'))) {
      await queryRunner.query(
        'ALTER TABLE Pasajeros ADD COLUMN PublicId CHAR(26) NULL',
      );
    }
    if (
      !(await this.indexExiste(
        queryRunner,
        'Pasajeros',
        'UQ_Pasajeros_PublicId',
      ))
    ) {
      await queryRunner.query(
        'CREATE UNIQUE INDEX UQ_Pasajeros_PublicId ON Pasajeros (PublicId)',
      );
    }

    // --- Monederos ---
    if (!(await this.columnaExiste(queryRunner, 'Monederos', 'PublicId'))) {
      await queryRunner.query(
        'ALTER TABLE Monederos ADD COLUMN PublicId CHAR(26) NULL',
      );
    }
    if (
      !(await this.indexExiste(
        queryRunner,
        'Monederos',
        'UQ_Monederos_PublicId',
      ))
    ) {
      await queryRunner.query(
        'CREATE UNIQUE INDEX UQ_Monederos_PublicId ON Monederos (PublicId)',
      );
    }

    // --- TransaccionesDebito ---
    if (
      !(await this.columnaExiste(
        queryRunner,
        'TransaccionesDebito',
        'PublicId',
      ))
    ) {
      await queryRunner.query(
        'ALTER TABLE TransaccionesDebito ADD COLUMN PublicId CHAR(26) NULL',
      );
    }
    if (
      !(await this.indexExiste(
        queryRunner,
        'TransaccionesDebito',
        'UQ_TransaccionesDebito_PublicId',
      ))
    ) {
      await queryRunner.query(
        'CREATE UNIQUE INDEX UQ_TransaccionesDebito_PublicId ON TransaccionesDebito (PublicId)',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // --- TransaccionesDebito ---
    if (
      await this.indexExiste(
        queryRunner,
        'TransaccionesDebito',
        'UQ_TransaccionesDebito_PublicId',
      )
    ) {
      await queryRunner.query(
        'DROP INDEX UQ_TransaccionesDebito_PublicId ON TransaccionesDebito',
      );
    }
    if (
      await this.columnaExiste(queryRunner, 'TransaccionesDebito', 'PublicId')
    ) {
      await queryRunner.query(
        'ALTER TABLE TransaccionesDebito DROP COLUMN PublicId',
      );
    }

    // --- Monederos ---
    if (
      await this.indexExiste(queryRunner, 'Monederos', 'UQ_Monederos_PublicId')
    ) {
      await queryRunner.query('DROP INDEX UQ_Monederos_PublicId ON Monederos');
    }
    if (await this.columnaExiste(queryRunner, 'Monederos', 'PublicId')) {
      await queryRunner.query('ALTER TABLE Monederos DROP COLUMN PublicId');
    }

    // --- Pasajeros ---
    if (
      await this.indexExiste(queryRunner, 'Pasajeros', 'UQ_Pasajeros_PublicId')
    ) {
      await queryRunner.query('DROP INDEX UQ_Pasajeros_PublicId ON Pasajeros');
    }
    if (await this.columnaExiste(queryRunner, 'Pasajeros', 'PublicId')) {
      await queryRunner.query('ALTER TABLE Pasajeros DROP COLUMN PublicId');
    }
  }
}
