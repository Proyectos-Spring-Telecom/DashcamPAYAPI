import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R3 / M-010: la claveIdempotencia de una recarga se reserva ANTES de cobrar en
 * NetPay, así dos peticiones paralelas con la misma clave no generan dos cargos.
 * La misma fila guarda el estado PENDIENTE_CONCILIAR cuando NetPay cobró, la
 * recarga no se pudo guardar y el reembolso de compensación también falló.
 */
export class CreateReservasRecarga1737900008000 implements MigrationInterface {
  name = 'CreateReservasRecarga1737900008000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS ReservasRecarga (
        ClaveIdempotencia VARCHAR(100) NOT NULL,
        NumeroSerieMonedero VARCHAR(100) NOT NULL,
        Monto DECIMAL(10,2) NOT NULL,
        IdUsuario BIGINT NULL,
        Estado VARCHAR(30) NOT NULL DEFAULT 'EN_PROCESO',
        TransactionTokenIdNetPay VARCHAR(150) NULL,
        IdTransaccionRecarga BIGINT NULL,
        FechaCreacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FechaActualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (ClaveIdempotencia),
        KEY IDX_ReservasRecarga_Estado (Estado, FechaCreacion)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS ReservasRecarga');
  }
}
