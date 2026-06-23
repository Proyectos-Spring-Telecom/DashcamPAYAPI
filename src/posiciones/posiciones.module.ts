import { Module, forwardRef } from '@nestjs/common';
import { PosicionesService } from './posiciones.service';
import { PosicionesController } from './posiciones.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Posiciones } from 'src/entities/Posiciones';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { Usuarios } from 'src/entities/Usuarios';
import { Clientes } from 'src/entities/Clientes';
import { Validadores } from 'src/entities/Validadores';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { MonitoreoModule } from 'src/monitoreo/monitoreo.module';
import { MonitoreoService } from 'src/monitoreo/monitoreo.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Posiciones,
      Validadores,
      Usuarios,
      Clientes,
      UsuariosZonas,
    ]),
    BitacoraModule,
    forwardRef(() => MonitoreoModule), // Importar con forwardRef para evitar dependencia circular
  ],
  controllers: [PosicionesController],
  providers: [PosicionesService],
})
export class PosicionesModule {}
