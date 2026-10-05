import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokenVersion1737900000000 implements MigrationInterface {
  name = 'AddTokenVersion1737900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ cnt: number | string }> = await queryRunner.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Usuarios'
        AND COLUMN_NAME = 'TokenVersion'
    `);
    if (Number(rows[0]?.cnt ?? 0) === 0) {
      await queryRunner.query(
        'ALTER TABLE Usuarios ADD COLUMN TokenVersion INT NOT NULL DEFAULT 0',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ cnt: number | string }> = await queryRunner.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Usuarios'
        AND COLUMN_NAME = 'TokenVersion'
    `);
    if (Number(rows[0]?.cnt ?? 0) > 0) {
      await queryRunner.query('ALTER TABLE Usuarios DROP COLUMN TokenVersion');
    }
  }
}
