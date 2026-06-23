import { Module } from '@nestjs/common';
import { HistoricoinstalacionesService } from './historicoinstalaciones.service';
import { HistoricoinstalacionesController } from './historicoinstalaciones.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HistoricoInstalaciones } from 'src/entities/historico-instalaciones';
import { BitacoraModule } from 'src/bitacora/bitacora.module';

@Module({
  imports: [TypeOrmModule.forFeature([HistoricoInstalaciones]), BitacoraModule],
  controllers: [HistoricoinstalacionesController],
  providers: [HistoricoinstalacionesService],
  exports: [HistoricoinstalacionesService],
})
export class HistoricoinstalacionesModule {}
