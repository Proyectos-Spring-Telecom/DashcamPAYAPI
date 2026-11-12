import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recarga cobrada con tarjeta en terminal (TPV NetPay Smart SDK).
 * - Catálogo método de pago 5
 * - Columnas de reserva (folio, origen, validador, método)
 * - Columnas de evidencia del cobro presencial en TransaccionesRecarga
 */
export class RecargaTarjetaTerminal1737900015000 implements MigrationInterface {
  name = 'RecargaTarjetaTerminal1737900015000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO CatMetodoPago (Id, Nombre)
      SELECT 5, 'Tarjeta presencial (TPV)'
      WHERE NOT EXISTS (SELECT 1 FROM CatMetodoPago WHERE Id = 5)
    `);

    await this.addColumnIfMissing(
      q,
      'ReservasRecarga',
      'Folio',
      `ALTER TABLE ReservasRecarga ADD COLUMN Folio VARCHAR(20) NULL`,
    );
    await this.addColumnIfMissing(
      q,
      'ReservasRecarga',
      'IdMetodoPago',
      `ALTER TABLE ReservasRecarga ADD COLUMN IdMetodoPago BIGINT NULL`,
    );
    await this.addColumnIfMissing(
      q,
      'ReservasRecarga',
      'NumeroSerieValidador',
      `ALTER TABLE ReservasRecarga ADD COLUMN NumeroSerieValidador VARCHAR(100) NULL`,
    );
    await this.addColumnIfMissing(
      q,
      'ReservasRecarga',
      'Origen',
      `ALTER TABLE ReservasRecarga ADD COLUMN Origen VARCHAR(20) NOT NULL DEFAULT 'ECOMMERCE'`,
    );

    const folioIdx: Array<{ cnt: number | string }> = await q.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ReservasRecarga'
        AND INDEX_NAME = 'UQ_ReservasRecarga_Folio'
    `);
    if (Number(folioIdx[0]?.cnt ?? 0) === 0) {
      await q.query(`
        CREATE UNIQUE INDEX UQ_ReservasRecarga_Folio
          ON ReservasRecarga (Folio)
      `);
    }

    const recargaCols: Array<{ name: string; sql: string }> = [
      {
        name: 'OrderIdNetPay',
        sql: `ALTER TABLE TransaccionesRecarga ADD COLUMN OrderIdNetPay VARCHAR(100) NULL`,
      },
      {
        name: 'TransactionIdNetPay',
        sql: `ALTER TABLE TransaccionesRecarga ADD COLUMN TransactionIdNetPay VARCHAR(100) NULL`,
      },
      {
        name: 'AuthCodeNetPay',
        sql: `ALTER TABLE TransaccionesRecarga ADD COLUMN AuthCodeNetPay VARCHAR(50) NULL`,
      },
      {
        name: 'RrnNetPay',
        sql: `ALTER TABLE TransaccionesRecarga ADD COLUMN RrnNetPay VARCHAR(50) NULL`,
      },
      {
        name: 'NaturalezaTarjeta',
        sql: `ALTER TABLE TransaccionesRecarga ADD COLUMN NaturalezaTarjeta VARCHAR(20) NULL`,
      },
      {
        name: 'Bin',
        sql: `ALTER TABLE TransaccionesRecarga ADD COLUMN Bin VARCHAR(8) NULL`,
      },
      {
        name: 'Ultimos4',
        sql: `ALTER TABLE TransaccionesRecarga ADD COLUMN Ultimos4 VARCHAR(4) NULL`,
      },
      {
        name: 'FolioNetPay',
        sql: `ALTER TABLE TransaccionesRecarga ADD COLUMN FolioNetPay VARCHAR(20) NULL`,
      },
      {
        name: 'MarcaTarjeta',
        sql: `ALTER TABLE TransaccionesRecarga ADD COLUMN MarcaTarjeta VARCHAR(50) NULL`,
      },
      {
        name: 'StoreIdNetPay',
        sql: `ALTER TABLE TransaccionesRecarga ADD COLUMN StoreIdNetPay VARCHAR(50) NULL`,
      },
      {
        name: 'AfiliacionNetPay',
        sql: `ALTER TABLE TransaccionesRecarga ADD COLUMN AfiliacionNetPay VARCHAR(50) NULL`,
      },
      {
        name: 'TerminalNetPay',
        sql: `ALTER TABLE TransaccionesRecarga ADD COLUMN TerminalNetPay VARCHAR(50) NULL`,
      },
    ];
    for (const col of recargaCols) {
      await this.addColumnIfMissing(q, 'TransaccionesRecarga', col.name, col.sql);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    const dropRecarga = [
      'TerminalNetPay',
      'AfiliacionNetPay',
      'StoreIdNetPay',
      'MarcaTarjeta',
      'FolioNetPay',
      'Ultimos4',
      'Bin',
      'NaturalezaTarjeta',
      'RrnNetPay',
      'AuthCodeNetPay',
      'TransactionIdNetPay',
      'OrderIdNetPay',
    ];
    for (const col of dropRecarga) {
      await this.dropColumnIfExists(q, 'TransaccionesRecarga', col);
    }

    const folioIdx: Array<{ cnt: number | string }> = await q.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ReservasRecarga'
        AND INDEX_NAME = 'UQ_ReservasRecarga_Folio'
    `);
    if (Number(folioIdx[0]?.cnt ?? 0) > 0) {
      await q.query(`DROP INDEX UQ_ReservasRecarga_Folio ON ReservasRecarga`);
    }

    for (const col of ['Origen', 'NumeroSerieValidador', 'IdMetodoPago', 'Folio']) {
      await this.dropColumnIfExists(q, 'ReservasRecarga', col);
    }

    await q.query(`DELETE FROM CatMetodoPago WHERE Id = 5`);
  }

  private async addColumnIfMissing(
    q: QueryRunner,
    table: string,
    column: string,
    alterSql: string,
  ): Promise<void> {
    const rows: Array<{ cnt: number | string }> = await q.query(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
      [table, column],
    );
    if (Number(rows[0]?.cnt ?? 0) === 0) {
      await q.query(alterSql);
    }
  }

  private async dropColumnIfExists(
    q: QueryRunner,
    table: string,
    column: string,
  ): Promise<void> {
    const rows: Array<{ cnt: number | string }> = await q.query(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
      [table, column],
    );
    if (Number(rows[0]?.cnt ?? 0) > 0) {
      await q.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
    }
  }
}
