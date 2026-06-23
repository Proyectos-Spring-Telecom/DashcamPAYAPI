import { Module } from '@nestjs/common';
import { LicenciasService } from './licencias.service';
import { LicenciasController } from './licencias.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { S3Module } from 'src/s3/s3.module';
import { Licencias } from 'src/entities/Licencias';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [
    TypeOrmModule.forFeature([Licencias, Clientes]),
    BitacoraModule,
    S3Module,
  ],
  controllers: [LicenciasController],
  providers: [LicenciasService],
  exports: [LicenciasService],
})
export class LicenciasModule {}
