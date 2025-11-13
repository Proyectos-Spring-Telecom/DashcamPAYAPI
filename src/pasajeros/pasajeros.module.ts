import { Module } from '@nestjs/common';
import { PasajerosService } from './pasajeros.service';
import { PasajerosController } from './pasajeros.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pasajeros } from 'src/entities/Pasajeros';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [TypeOrmModule.forFeature([Pasajeros,Clientes]), BitacoraModule],
  controllers: [PasajerosController],
  providers: [PasajerosService],
  exports: [PasajerosService]
})
export class PasajerosModule {}
