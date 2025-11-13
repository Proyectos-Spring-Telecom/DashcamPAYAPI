import { Module } from '@nestjs/common';
import { UsuariosZonasService } from './usuarioszonas.service';
import { UsuariosZonasController } from './usuarioszonas.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { Zonas } from 'src/entities/Zonas';
import { Usuarios } from 'src/entities/Usuarios';

@Module({
  imports: [TypeOrmModule.forFeature([UsuariosZonas,Zonas,Usuarios]), BitacoraModule],
  controllers: [UsuariosZonasController],
  providers: [UsuariosZonasService],
})
export class UsuariosZonasModule {}
