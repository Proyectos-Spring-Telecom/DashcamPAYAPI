import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * H-34: índices sobre las columnas de fecha calientes de las tablas de
 * transacciones, históricos y bitácora. Las consultas de reportes/paginados
 * filtran y ordenan por la fecha de registro (FHRegistro) y por FechaCreacion
 * de la bitácora, hoy sin índice -> full scan.
 *
 * Columnas tomadas de las entidades en src/entities (no inventadas):
 *   - TransaccionesDebito.FHRegistro            (datetime)
 *   - TransaccionesRecarga.FHRegistro           (datetime)
 *   - HistoricoTransaccionesDebito.FHRegistro   (datetime)
 *   - HistoricoTransaccionesRecarga.FHRegistro  (datetime)
 *   - Bitacora.FechaCreacion                    (datetime)
 *
 * Idempotente: comprueba information_schema antes de crear/eliminar cada índice
 * (mismo patrón que 1737900004000). No toca datos.
 */
export class IndicesFecha1737900012000 implements MigrationInterface {
  name = 'IndicesFecha1737900012000';

  private readonly indices: Array<{
    table: string;
    column: string;
    name: string;
  }> = [
    {
      table: 'TransaccionesDebito',
      column: 'FHRegistro',
      name: 'IX_TransaccionesDebito_FHRegistro',
    },
    {
      table: 'TransaccionesRecarga',
      column: 'FHRegistro',
      name: 'IX_TransaccionesRecarga_FHRegistro',
    },
    {
      table: 'HistoricoTransaccionesDebito',
      column: 'FHRegistro',
      name: 'IX_HistoricoTransaccionesDebito_FHRegistro',
    },
    {
      table: 'HistoricoTransaccionesRecarga',
      column: 'FHRegistro',
      name: 'IX_HistoricoTransaccionesRecarga_FHRegistro',
    },
    {
      table: 'Bitacora',
      column: 'FechaCreacion',
      name: 'IX_Bitacora_FechaCreacion',
    },
  ];

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
    for (const check of this.indices) {
      if (!(await this.indexExiste(queryRunner, check.table, check.name))) {
        await queryRunner.query(
          `CREATE INDEX ${check.name} ON ${check.table} (${check.column})`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const check of this.indices) {
      if (await this.indexExiste(queryRunner, check.table, check.name)) {
        await queryRunner.query(`DROP INDEX ${check.name} ON ${check.table}`);
      }
    }
  }
}
