import { Module } from '@nestjs/common';
import { ViajestransaccionesService } from './viajestransacciones.service';
import { ViajestransaccionesController } from './viajestransacciones.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ViajesTransacciones } from 'src/entities/ViajesTransacciones';

@Module({
  imports:[BitacoraModule,TypeOrmModule.forFeature([ViajesTransacciones])],
  controllers: [ViajestransaccionesController],
  providers: [ViajestransaccionesService],
})
export class ViajestransaccionesModule {}
