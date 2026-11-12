import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cobro de pasaje con tarjeta presencial (TPV).
 * - Tabla ReservasDebitoTarjeta (reserva → SaleRequest → registro)
 * - TransaccionesDebito: monedero nullable, IdMetodoPago y evidencia TPV
 */
export class DebitoTarjetaTerminal1737900016000 implements MigrationInterface {
  name = 'DebitoTarjetaTerminal1737900016000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS ReservasDebitoTarjeta (
        ClaveIdempotencia VARCHAR(100) NOT NULL,
        IdViaje BIGINT NOT NULL,
        NumeroSerieValidador VARCHAR(100) NOT NULL,
        CantidadPasajes INT NOT NULL DEFAULT 1,
        Monto DECIMAL(10,2) NOT NULL,
        IdUsuario BIGINT NULL,
        IdMetodoPago BIGINT NULL DEFAULT 5,
        Folio VARCHAR(20) NULL,
        Estado VARCHAR(30) NOT NULL DEFAULT 'EN_PROCESO',
        IdTransaccionDebito BIGINT NULL,
        FechaCreacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FechaActualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (ClaveIdempotencia),
        UNIQUE KEY UQ_ReservasDebitoTarjeta_Folio (Folio),
        KEY IDX_ReservasDebitoTarjeta_Estado (Estado, FechaCreacion),
        KEY IDX_ReservasDebitoTarjeta_Viaje (IdViaje)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    // Monedero opcional: cobro TPV no tiene monedero.
    const nullable: Array<{ isNullable: string }> = await q.query(`
      SELECT IS_NULLABLE AS isNullable
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'TransaccionesDebito'
        AND COLUMN_NAME = 'NumeroSerieMonedero'
    `);
    if (nullable[0]?.isNullable === 'NO') {
      await q.query(`
        ALTER TABLE TransaccionesDebito
          MODIFY COLUMN NumeroSerieMonedero VARCHAR(100) NULL
      `);
    }

    const cols: Array<{ name: string; sql: string }> = [
      {
        name: 'IdMetodoPago',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN IdMetodoPago BIGINT NULL`,
      },
      {
        name: 'OrderIdNetPay',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN OrderIdNetPay VARCHAR(100) NULL`,
      },
      {
        name: 'TransactionIdNetPay',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN TransactionIdNetPay VARCHAR(100) NULL`,
      },
      {
        name: 'AuthCodeNetPay',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN AuthCodeNetPay VARCHAR(50) NULL`,
      },
      {
        name: 'RrnNetPay',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN RrnNetPay VARCHAR(50) NULL`,
      },
      {
        name: 'NaturalezaTarjeta',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN NaturalezaTarjeta VARCHAR(20) NULL`,
      },
      {
        name: 'Bin',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN Bin VARCHAR(8) NULL`,
      },
      {
        name: 'Ultimos4',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN Ultimos4 VARCHAR(4) NULL`,
      },
      {
        name: 'FolioNetPay',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN FolioNetPay VARCHAR(20) NULL`,
      },
      {
        name: 'MarcaTarjeta',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN MarcaTarjeta VARCHAR(50) NULL`,
      },
      {
        name: 'StoreIdNetPay',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN StoreIdNetPay VARCHAR(50) NULL`,
      },
      {
        name: 'AfiliacionNetPay',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN AfiliacionNetPay VARCHAR(50) NULL`,
      },
      {
        name: 'TerminalNetPay',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN TerminalNetPay VARCHAR(50) NULL`,
      },
      {
        name: 'CantidadPasajes',
        sql: `ALTER TABLE TransaccionesDebito ADD COLUMN CantidadPasajes INT NULL`,
      },
    ];
    for (const col of cols) {
      await this.addColumnIfMissing(q, 'TransaccionesDebito', col.name, col.sql);
    }

    const histNullable: Array<{ isNullable: string }> = await q.query(`
      SELECT IS_NULLABLE AS isNullable
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'HistoricoTransaccionesDebito'
        AND COLUMN_NAME = 'NumeroSerieMonedero'
    `);
    if (histNullable[0]?.isNullable === 'NO') {
      await q.query(`
        ALTER TABLE HistoricoTransaccionesDebito
          MODIFY COLUMN NumeroSerieMonedero VARCHAR(100) NULL
      `);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    const drop = [
      'CantidadPasajes',
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
      'IdMetodoPago',
    ];
    for (const col of drop) {
      await this.dropColumnIfExists(q, 'TransaccionesDebito', col);
    }
    await q.query(`
      ALTER TABLE TransaccionesDebito
        MODIFY COLUMN NumeroSerieMonedero VARCHAR(100) NOT NULL
    `);
    await q.query(`DROP TABLE IF EXISTS ReservasDebitoTarjeta`);
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
