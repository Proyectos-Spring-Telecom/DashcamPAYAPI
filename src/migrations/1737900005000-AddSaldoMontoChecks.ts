import { MigrationInterface, QueryRunner } from 'typeorm';

const CHECKS: Array<{ table: string; column: string; name: string }> = [
  {
    table: 'Monederos',
    column: 'Saldo',
    name: 'CK_Monederos_Saldo_NoNegativo',
  },
  {
    table: 'TransaccionesRecarga',
    column: 'Monto',
    name: 'CK_TransaccionesRecarga_Monto_NoNegativo',
  },
  {
    table: 'TransaccionesDebito',
    column: 'Monto',
    name: 'CK_TransaccionesDebito_Monto_NoNegativo',
  },
  {
    table: 'HistoricoTransaccionesRecarga',
    column: 'Monto',
    name: 'CK_HistoricoTransaccionesRecarga_Monto_NoNegativo',
  },
  {
    table: 'HistoricoTransaccionesDebito',
    column: 'Monto',
    name: 'CK_HistoricoTransaccionesDebito_Monto_NoNegativo',
  },
];

export class AddSaldoMontoChecks1737900005000 implements MigrationInterface {
  name = 'AddSaldoMontoChecks1737900005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const check of CHECKS) {
      const negatives: Array<{ cnt: number | string }> = await queryRunner.query(
        `SELECT COUNT(*) AS cnt FROM \`${check.table}\` WHERE \`${check.column}\` < 0`,
      );
      const count = Number(negatives[0]?.cnt ?? 0);
      if (count > 0) {
        throw new Error(
          `${check.table}.${check.column} tiene ${count} fila(s) negativas. Corrige esos importes antes de aplicar ${check.name}.`,
        );
      }

      const existing: Array<{ cnt: number | string }> = await queryRunner.query(
        `
        SELECT COUNT(*) AS cnt
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND CONSTRAINT_NAME = ?
          AND CONSTRAINT_TYPE = 'CHECK'
      `,
        [check.table, check.name],
      );
      if (Number(existing[0]?.cnt ?? 0) > 0) continue;

      await queryRunner.query(
        `ALTER TABLE \`${check.table}\` ADD CONSTRAINT \`${check.name}\` CHECK (\`${check.column}\` >= 0)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const check of [...CHECKS].reverse()) {
      const existing: Array<{ cnt: number | string }> = await queryRunner.query(
        `
        SELECT COUNT(*) AS cnt
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND CONSTRAINT_NAME = ?
          AND CONSTRAINT_TYPE = 'CHECK'
      `,
        [check.table, check.name],
      );
      if (Number(existing[0]?.cnt ?? 0) === 0) continue;
      await queryRunner.query(
        `ALTER TABLE \`${check.table}\` DROP CHECK \`${check.name}\``,
      );
    }
  }
}
