import { Module } from '@nestjs/common';
import { TurnosService } from './turnos.service';
import { TurnosController } from './turnos.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Turnos } from 'src/entities/Turnos';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [TypeOrmModule.forFeature([Turnos,Clientes]), BitacoraModule],
  controllers: [TurnosController],
  providers: [TurnosService],
})
export class TurnosModule {}
