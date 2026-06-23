import { Module } from '@nestjs/common';
import { ZonasService } from './zonas.service';
import { ZonasController } from './zonas.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { Zonas } from 'src/entities/Zonas';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [
    TypeOrmModule.forFeature([Zonas, UsuariosZonas, Clientes]),
    BitacoraModule,
  ],
  controllers: [ZonasController],
  providers: [ZonasService],
})
export class ZonasModule {}
