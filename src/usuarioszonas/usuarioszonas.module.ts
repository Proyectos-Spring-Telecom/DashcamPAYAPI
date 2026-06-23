import { Module } from '@nestjs/common';
import { UsuarioszonasService } from './usuarioszonas.service';
import { UsuarioszonasController } from './usuarioszonas.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { Zonas } from 'src/entities/Zonas';
import { Usuarios } from 'src/entities/Usuarios';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsuariosZonas, Zonas, Usuarios]),
    BitacoraModule,
  ],
  controllers: [UsuarioszonasController],
  providers: [UsuarioszonasService],
})
export class UsuarioszonasModule {}
