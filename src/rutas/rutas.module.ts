import { Module } from '@nestjs/common';
import { RutasService } from './rutas.service';
import { RutasController } from './rutas.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rutas } from 'src/entities/Rutas';
import { Zonas } from 'src/entities/Zonas';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [TypeOrmModule.forFeature([Zonas,Rutas,UsuariosZonas,Clientes]), BitacoraModule],
  controllers: [RutasController],
  providers: [RutasService],
})
export class RutasModule {}
