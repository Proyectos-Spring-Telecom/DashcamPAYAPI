import { Module } from '@nestjs/common';
import { ViajesService } from './viajes.service';
import { ViajesController } from './viajes.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { Viajes } from 'src/entities/Viajes';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clientes } from 'src/entities/Clientes';
import { Turnos } from 'src/entities/Turnos';
import { ConteoPasajeros } from 'src/entities/ConteoPasajeros';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Contadores } from 'src/entities/Contadores';
import { InstalacionContadores } from 'src/entities/InstalacionContadores';
import { Validadores } from 'src/entities/Validadores';
import { Variantes } from 'src/entities/Variantes';
import { Vehiculos } from 'src/entities/Vehiculos';
import { Posiciones } from 'src/entities/Posiciones';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Viajes,
      Clientes,
      Turnos,
      ConteoPasajeros,
      Instalaciones,
      Contadores,
      InstalacionContadores,
      Validadores,
      Variantes,
      Vehiculos,
      Posiciones,
    ]),
    BitacoraModule,
  ],
  controllers: [ViajesController],
  providers: [ViajesService],
})
export class ViajesModule {}
