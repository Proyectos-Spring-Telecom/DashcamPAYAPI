import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * H-53: purga por lotes de tablas de serie temporal y de tokens vencidos.
 * Desactivada por defecto: cada ventana se activa con su variable de entorno
 * (días de retención > 0). No hace particionado (eso es tarea de DBA con
 * ventana de mantenimiento; cambia PKs/FKs). Borra en lotes para no bloquear.
 *
 * Las sentencias son literales por tabla (sin interpolar identificadores), para
 * no abrir superficie de SQL dinámico (lint:sql). Solo el número de días y el
 * tamaño de lote son parámetros.
 */
@Injectable()
export class RetencionJob {
  private readonly logger = new Logger(RetencionJob.name);
  private corriendo = false;
  private readonly lote = 5000;

  constructor(private readonly dataSource: DataSource) {}

  private dias(envVar: string): number {
    const v = Number(process.env[envVar] ?? 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  /** Ejecuta un DELETE literal en lotes hasta agotar las filas vencidas. */
  private async purgarEnLotes(
    etiqueta: string,
    ejecutarLote: (dias: number, lote: number) => Promise<number>,
    dias: number,
  ): Promise<void> {
    if (dias <= 0) return;
    let total = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const n = await ejecutarLote(dias, this.lote);
      total += n;
      if (n < this.lote) break;
    }
    if (total > 0) this.logger.log(`Retención ${etiqueta}: ${total} filas purgadas.`);
  }

  private afectadas(res: { affectedRows?: number } | undefined): number {
    return Number(res?.affectedRows ?? 0);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async ejecutar(): Promise<void> {
    if (this.corriendo) return;
    this.corriendo = true;
    try {
      await this.purgarEnLotes(
        'Posiciones',
        async (dias, lote) =>
          this.afectadas(
            await this.dataSource.query(
              'DELETE FROM Posiciones WHERE FHRegistro < (NOW() - INTERVAL ? DAY) LIMIT ?',
              [dias, lote],
            ),
          ),
        this.dias('RETENCION_POSICIONES_DIAS'),
      );
      await this.purgarEnLotes(
        'Bitacora',
        async (dias, lote) =>
          this.afectadas(
            await this.dataSource.query(
              'DELETE FROM Bitacora WHERE FechaCreacion < (NOW() - INTERVAL ? DAY) LIMIT ?',
              [dias, lote],
            ),
          ),
        this.dias('RETENCION_BITACORA_DIAS'),
      );
      await this.purgarEnLotes(
        'RefreshSessions',
        async (dias, lote) =>
          this.afectadas(
            await this.dataSource.query(
              'DELETE FROM RefreshSessions WHERE ExpiresAt < (NOW() - INTERVAL ? DAY) LIMIT ?',
              [dias, lote],
            ),
          ),
        this.dias('RETENCION_REFRESH_DIAS'),
      );
      await this.purgarEnLotes(
        'CodigoAutenticacion',
        async (dias, lote) =>
          this.afectadas(
            await this.dataSource.query(
              'DELETE FROM CodigoAutenticacion WHERE FechaExpiracion < (NOW() - INTERVAL ? DAY) LIMIT ?',
              [dias, lote],
            ),
          ),
        this.dias('RETENCION_OTP_DIAS'),
      );
    } catch (e) {
      this.logger.error(`Retención falló: ${(e as Error).message}`);
    } finally {
      this.corriendo = false;
    }
  }
}
