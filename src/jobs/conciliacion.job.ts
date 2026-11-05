import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TransaccionesService } from '../transacciones/transacciones.service';

/**
 * H-20 / WP-3.1: concilia las reservas de recarga NetPay que quedaron sin
 * resolver (EN_PROCESO vencidas o PENDIENTE_CONCILIAR). La lógica vive en
 * TransaccionesService.conciliarReservasPendientes(); este job solo la dispara
 * periódicamente. Se desactiva con CONCILIACION_ENABLED=false.
 */
@Injectable()
export class ConciliacionJob {
  private readonly logger = new Logger(ConciliacionJob.name);
  private corriendo = false;

  constructor(private readonly transaccionesService: TransaccionesService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async ejecutar(): Promise<void> {
    if (process.env.CONCILIACION_ENABLED === 'false') return;
    if (this.corriendo) return;
    this.corriendo = true;
    try {
      const r = await this.transaccionesService.conciliarReservasPendientes();
      if (r.revisadas > 0) {
        this.logger.log(
          `Conciliación NetPay: ${r.resueltas}/${r.revisadas} reservas resueltas.`,
        );
      }
    } catch (e) {
      this.logger.error(`Conciliación falló: ${(e as Error).message}`);
    } finally {
      this.corriendo = false;
    }
  }
}
