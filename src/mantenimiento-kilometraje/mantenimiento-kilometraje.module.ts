import { Module } from '@nestjs/common';
import { MantenimientoKilometrajeService } from './mantenimiento-kilometraje.service';
import { MantenimientoKilometrajeController } from './mantenimiento-kilometraje.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MantenimientoKilometraje } from 'src/entities/MantenimientoKilometraje';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Clientes } from 'src/entities/Clientes';
import { Posiciones } from 'src/entities/Posiciones';

@Module({
  imports: [
    TypeOrmModule.forFeature([MantenimientoKilometraje, Instalaciones, Clientes, Posiciones]),
    BitacoraModule,
  ],
  controllers: [MantenimientoKilometrajeController],
  providers: [MantenimientoKilometrajeService],
  exports: [MantenimientoKilometrajeService],
})
export class MantenimientoKilometrajeModule {}
