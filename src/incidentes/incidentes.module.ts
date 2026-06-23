import { Module } from '@nestjs/common';
import { IncidentesService } from './incidentes.service';
import { IncidentesController } from './incidentes.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { S3Module } from 'src/s3/s3.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incidentes } from 'src/entities/Incidentes';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Operadores } from 'src/entities/Operadores';

@Module({
  imports: [
    TypeOrmModule.forFeature([Incidentes, Instalaciones, Operadores]),
    BitacoraModule,
    S3Module,
  ],
  controllers: [IncidentesController],
  providers: [IncidentesService],
  exports: [IncidentesService],
})
export class IncidentesModule {}
