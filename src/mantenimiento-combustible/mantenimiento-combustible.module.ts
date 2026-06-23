import { Module } from '@nestjs/common';
import { MantenimientoCombustibleService } from './mantenimiento-combustible.service';
import { MantenimientoCombustibleController } from './mantenimiento-combustible.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MantenimientoCombustible } from 'src/entities/MantenimientoCombustible';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [
    TypeOrmModule.forFeature([MantenimientoCombustible, Instalaciones, Clientes]),
    BitacoraModule,
  ],
  controllers: [MantenimientoCombustibleController],
  providers: [MantenimientoCombustibleService],
  exports: [MantenimientoCombustibleService],
})
export class MantenimientoCombustibleModule {}
