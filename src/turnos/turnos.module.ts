import { Module } from '@nestjs/common';
import { TurnosService } from './turnos.service';
import { TurnosController } from './turnos.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Turnos } from 'src/entities/Turnos';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { Clientes } from 'src/entities/Clientes';
import { Operadores } from 'src/entities/Operadores';
import { Instalaciones } from 'src/entities/Instalaciones';

@Module({
  imports: [
    TypeOrmModule.forFeature([Turnos, Clientes, Operadores, Instalaciones]),
    BitacoraModule,
  ],
  controllers: [TurnosController],
  providers: [TurnosService],
})
export class TurnosModule {}
