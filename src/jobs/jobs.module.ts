import { Module } from '@nestjs/common';
import { TransaccionesModule } from '../transacciones/transacciones.module';
import { ConciliacionJob } from './conciliacion.job';
import { RetencionJob } from './retencion.job';

/**
 * Tareas programadas de continuidad (H-20 conciliación NetPay, H-53 retención).
 * ScheduleModule se registra una sola vez en AppModule.
 */
@Module({
  imports: [TransaccionesModule],
  providers: [ConciliacionJob, RetencionJob],
})
export class JobsModule {}
