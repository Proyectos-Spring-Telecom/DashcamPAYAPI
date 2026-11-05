import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * H-58 / V2-08: credencial de dispositivo + anti-replay en la ingesta.
 *
 * Cambios ADITIVOS y compatibles (no rompen los flujos actuales):
 *   1. Columna `DeviceTokenHash VARCHAR(64) NULL` en `Validadores` y
 *      `Contadores`. Guarda el hash SHA-256 (hex) del token del dispositivo.
 *      NULL = sin credencial provisionada (sigue operando por JWT de operador).
 *   2. Índice UNIQUE `UQ_Posiciones_Serie_FechaHora (NumeroSerieValidador,
 *      FechaHora)` para descartar reenvíos (anti-replay). Convive con el índice
 *      no único `IX_Posiciones_NumeroSerieValidador_FechaHora` ya existente.
 *
 * ConteoPasajeros: NO se añade índice único (serie, fechaHora). Su ingesta
 * (POST/PATCH /conteopasajeros) crea varias filas por contador con la misma
 * marca de tiempo de servidor (acumulación de subidas/bajadas), por lo que un
 * único sobre (serie, fechaHora) rompería el modelo actual. No aplica aquí.
 *
 * Idempotente: comprueba information_schema antes de cada cambio (mismo patrón
 * que 1737900002000 y 1737900001000). No borra datos.
 *
 * ATENCIÓN (deduplicar antes): si `Posiciones` ya contiene filas duplicadas en
 * (NumeroSerieValidador, FechaHora), CREATE UNIQUE INDEX fallará. Esta migración
 * NO borra datos: hay que deduplicar manualmente esas filas antes de ejecutarla.
 */
export class DeviceToken1737900013000 implements MigrationInterface {
  name = 'DeviceToken1737900013000';

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
    if (
      !(await this.columnaExiste(queryRunner, 'Validadores', 'DeviceTokenHash'))
    ) {
      await queryRunner.query(
        'ALTER TABLE Validadores ADD COLUMN DeviceTokenHash VARCHAR(64) NULL',
      );
    }
    if (
      !(await this.columnaExiste(queryRunner, 'Contadores', 'DeviceTokenHash'))
    ) {
      await queryRunner.query(
        'ALTER TABLE Contadores ADD COLUMN DeviceTokenHash VARCHAR(64) NULL',
      );
    }

    // Anti-replay. Si existen duplicados (ver nota de cabecera) esta sentencia
    // fallará: deduplicar manualmente antes, sin borrado automático de datos.
    if (
      !(await this.indexExiste(
        queryRunner,
        'Posiciones',
        'UQ_Posiciones_Serie_FechaHora',
      ))
    ) {
      await queryRunner.query(
        'CREATE UNIQUE INDEX UQ_Posiciones_Serie_FechaHora ON Posiciones (NumeroSerieValidador, FechaHora)',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await this.indexExiste(
        queryRunner,
        'Posiciones',
        'UQ_Posiciones_Serie_FechaHora',
      )
    ) {
      await queryRunner.query(
        'DROP INDEX UQ_Posiciones_Serie_FechaHora ON Posiciones',
      );
    }
    if (
      await this.columnaExiste(queryRunner, 'Contadores', 'DeviceTokenHash')
    ) {
      await queryRunner.query(
        'ALTER TABLE Contadores DROP COLUMN DeviceTokenHash',
      );
    }
    if (
      await this.columnaExiste(queryRunner, 'Validadores', 'DeviceTokenHash')
    ) {
      await queryRunner.query(
        'ALTER TABLE Validadores DROP COLUMN DeviceTokenHash',
      );
    }
  }
}
