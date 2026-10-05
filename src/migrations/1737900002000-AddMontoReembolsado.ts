import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMontoReembolsado1737900002000 implements MigrationInterface {
  name = 'AddMontoReembolsado1737900002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ cnt: number | string }> = await queryRunner.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'TransaccionesRecarga'
        AND COLUMN_NAME = 'MontoReembolsado'
    `);
    if (Number(rows[0]?.cnt ?? 0) === 0) {
      await queryRunner.query(
        'ALTER TABLE TransaccionesRecarga ADD COLUMN MontoReembolsado DECIMAL(10,2) NOT NULL DEFAULT 0.00',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ cnt: number | string }> = await queryRunner.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'TransaccionesRecarga'
        AND COLUMN_NAME = 'MontoReembolsado'
    `);
    if (Number(rows[0]?.cnt ?? 0) > 0) {
      await queryRunner.query(
        'ALTER TABLE TransaccionesRecarga DROP COLUMN MontoReembolsado',
      );
    }
  }
}
