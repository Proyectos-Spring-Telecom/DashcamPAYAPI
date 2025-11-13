import { Module } from '@nestjs/common';
import { HistoricoinstalacionesService } from './historicoinstalaciones.service';
import { HistoricoinstalacionesController } from './historicoinstalaciones.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HistoricoInstalaciones } from 'src/entities/HistoricoInstalaciones';
import { Instalaciones } from 'src/entities/Instalaciones';
import { BitacoraModule } from 'src/bitacora/bitacora.module';

@Module({
  imports: [TypeOrmModule.forFeature([HistoricoInstalaciones, Instalaciones]), BitacoraModule],
  controllers: [HistoricoinstalacionesController],
  providers: [HistoricoinstalacionesService],
  exports: [HistoricoinstalacionesService]
})
export class HistoricoinstalacionesModule {}
