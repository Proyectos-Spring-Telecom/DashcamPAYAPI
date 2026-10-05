import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsurePosicionesIndex1737900001000 implements MigrationInterface {
  name = 'EnsurePosicionesIndex1737900001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ cnt: number | string }> = await queryRunner.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Posiciones'
        AND INDEX_NAME = 'IX_Posiciones_NumeroSerieValidador_FechaHora'
    `);
    if (Number(rows[0]?.cnt ?? 0) === 0) {
      await queryRunner.query(`
        CREATE INDEX IX_Posiciones_NumeroSerieValidador_FechaHora
        ON Posiciones (NumeroSerieValidador, FechaHora)
      `);
    }
  }

  public async down(): Promise<void> {
    // El índice puede existir de antes; no se revierte para no degradar consultas GPS.
  }
}
