import { Module } from '@nestjs/common';
import { PosicionesService } from './posiciones.service';
import { PosicionesController } from './posiciones.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Posiciones } from 'src/entities/Posiciones';
import { BitacoraModule } from 'src/bitacora/bitacora.module';

@Module({
  imports: [TypeOrmModule.forFeature([Posiciones]), BitacoraModule],
  controllers: [PosicionesController],
  providers: [PosicionesService],
})
export class PosicionesModule {}
