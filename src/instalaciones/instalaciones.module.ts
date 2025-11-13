import { Module } from '@nestjs/common';
import { InstalacionesService } from './instalaciones.service';
import { InstalacionesController } from './instalaciones.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instalaciones } from 'src/entities/Instalaciones';
import { UsuariosInstalaciones } from 'src/entities/UsuariosInstalaciones';
import { Validadores } from 'src/entities/Validadores';
import { Contadores } from 'src/entities/Contadores';
import { Vehiculos } from 'src/entities/Vehiculos';
import { Clientes } from 'src/entities/Clientes';
import { HistoricoinstalacionesModule } from 'src/historicoinstalaciones/historicoinstalaciones.module';

@Module({
  imports: [TypeOrmModule.forFeature([Instalaciones,UsuariosInstalaciones,Validadores,Contadores,Vehiculos,Clientes]), BitacoraModule,HistoricoinstalacionesModule],
  controllers: [InstalacionesController],
  providers: [InstalacionesService],
})
export class InstalacionesModule {}
