import { Module } from '@nestjs/common';
import { ConteopasajerosService } from './conteopasajeros.service';
import { ConteopasajerosController } from './conteopasajeros.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConteoPasajeros } from 'src/entities/ConteoPasajeros';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { Contadores } from 'src/entities/Contadores';
import { Usuarios } from 'src/entities/Usuarios';
import { Clientes } from 'src/entities/Clientes';
import { Viajes } from 'src/entities/Viajes';
import { Instalaciones } from 'src/entities/Instalaciones';
import { InstalacionContadores } from 'src/entities/InstalacionContadores';
import { Turnos } from 'src/entities/Turnos';

@Module({
  imports: [TypeOrmModule.forFeature([ConteoPasajeros, Contadores, Usuarios, Clientes, Viajes, Instalaciones, InstalacionContadores, Turnos]), BitacoraModule],
  controllers: [ConteopasajerosController],
  providers: [ConteopasajerosService],
})
export class ConteopasajerosModule { }
