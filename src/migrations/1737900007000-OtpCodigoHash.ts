import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M-001: el OTP se guarda como HMAC-SHA256 en hex (64 chars). La columna era
 * varchar(6) y el hash bcrypt de 60 chars hacía fallar registro y recuperación.
 * Los códigos vigentes se invalidan: su formato anterior ya no se acepta.
 */
export class OtpCodigoHash1737900007000 implements MigrationInterface {
  name = 'OtpCodigoHash1737900007000';

  private async columnType(q: QueryRunner, column: string): Promise<string | null> {
    const rows: Array<{ t: string }> = await q.query(
      `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CodigoAutenticacion' AND COLUMN_NAME = ?`,
      [column],
    );
    return rows[0]?.t ?? null;
  }

  private async hasIndex(q: QueryRunner, name: string): Promise<boolean> {
    const rows: Array<{ cnt: number | string }> = await q.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CodigoAutenticacion' AND INDEX_NAME = ?`,
      [name],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE CodigoAutenticacion SET Usado = 0, Estatus = 0 WHERE Usado = 1`,
    );
    if ((await this.columnType(q, 'Codigo')) !== 'char(64)') {
      await q.query(
        'ALTER TABLE CodigoAutenticacion MODIFY COLUMN Codigo CHAR(64) NOT NULL',
      );
    }
    if (!(await this.columnType(q, 'Intentos'))) {
      await q.query(
        'ALTER TABLE CodigoAutenticacion ADD COLUMN Intentos INT NOT NULL DEFAULT 0',
      );
    }
    if (!(await this.hasIndex(q, 'IDX_CodigoAutenticacion_Vigente'))) {
      await q.query(
        'CREATE INDEX IDX_CodigoAutenticacion_Vigente ON CodigoAutenticacion (IdUsuario, Tipo, Usado, FechaExpiracion)',
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await this.hasIndex(q, 'IDX_CodigoAutenticacion_Vigente')) {
      await q.query(
        'DROP INDEX IDX_CodigoAutenticacion_Vigente ON CodigoAutenticacion',
      );
    }
    await q.query(
      `UPDATE CodigoAutenticacion SET Usado = 0, Estatus = 0, Codigo = '000000'`,
    );
    await q.query(
      'ALTER TABLE CodigoAutenticacion MODIFY COLUMN Codigo VARCHAR(6) NOT NULL',
    );
  }
}
