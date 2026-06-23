import { Module } from '@nestjs/common';
import { MantenimientoVehicularService } from './mantenimiento-vehicular.service';
import { MantenimientoVehicularController } from './mantenimiento-vehicular.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { S3Module } from 'src/s3/s3.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MantenimientoVehicular } from 'src/entities/MantenimientoVehicular';
import { CatEstatusMantenimiento } from 'src/entities/CatEstatusMantenimiento';
import { Talleres } from 'src/entities/Talleres';
import { Instalaciones } from 'src/entities/Instalaciones';
import { CatReferenciaServicio } from 'src/entities/CatReferenciaServicio';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MantenimientoVehicular,
      CatEstatusMantenimiento,
      Talleres,
      Instalaciones,
      CatReferenciaServicio,
      Clientes,
    ]),
    BitacoraModule,
    S3Module,
  ],
  controllers: [MantenimientoVehicularController],
  providers: [MantenimientoVehicularService],
  exports: [MantenimientoVehicularService],
})
export class MantenimientoVehicularModule {}
