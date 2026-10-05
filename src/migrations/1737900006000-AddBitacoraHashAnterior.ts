import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBitacoraHashAnterior1737900006000 implements MigrationInterface {
  name = 'AddBitacoraHashAnterior1737900006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ cnt: number | string }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Bitacora'
        AND COLUMN_NAME = 'HashAnterior'
    `,
    );
    if (Number(rows[0]?.cnt ?? 0) === 0) {
      await queryRunner.query(
        'ALTER TABLE Bitacora ADD COLUMN HashAnterior CHAR(64) NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ cnt: number | string }> = await queryRunner.query(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Bitacora'
        AND COLUMN_NAME = 'HashAnterior'
    `,
    );
    if (Number(rows[0]?.cnt ?? 0) > 0) {
      await queryRunner.query('ALTER TABLE Bitacora DROP COLUMN HashAnterior');
    }
  }
}
