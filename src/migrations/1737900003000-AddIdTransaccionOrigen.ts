import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdTransaccionOrigen1737900003000 implements MigrationInterface {
  name = 'AddIdTransaccionOrigen1737900003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'HistoricoTransaccionesDebito',
      'HistoricoTransaccionesRecarga',
    ]) {
      const rows: Array<{ cnt: number | string }> = await queryRunner.query(
        `
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = 'IdTransaccionOrigen'
      `,
        [table],
      );
      if (Number(rows[0]?.cnt ?? 0) === 0) {
        await queryRunner.query(
          `ALTER TABLE ${table} ADD COLUMN IdTransaccionOrigen BIGINT NULL`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'HistoricoTransaccionesDebito',
      'HistoricoTransaccionesRecarga',
    ]) {
      const rows: Array<{ cnt: number | string }> = await queryRunner.query(
        `
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = 'IdTransaccionOrigen'
      `,
        [table],
      );
      if (Number(rows[0]?.cnt ?? 0) > 0) {
        await queryRunner.query(
          `ALTER TABLE ${table} DROP COLUMN IdTransaccionOrigen`,
        );
      }
    }
  }
}
