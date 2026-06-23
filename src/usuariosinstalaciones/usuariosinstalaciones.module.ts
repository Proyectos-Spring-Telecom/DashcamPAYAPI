import { Module } from '@nestjs/common';
import { UsuariosinstalacionesService } from './usuariosinstalaciones.service';
import { UsuariosinstalacionesController } from './usuariosinstalaciones.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosInstalaciones } from 'src/entities/UsuariosInstalaciones';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Usuarios } from 'src/entities/Usuarios';
import { BitacoraModule } from 'src/bitacora/bitacora.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsuariosInstalaciones, Instalaciones, Usuarios]),
    BitacoraModule,
  ],
  controllers: [UsuariosinstalacionesController],
  providers: [UsuariosinstalacionesService],
})
export class UsuariosinstalacionesModule {}
