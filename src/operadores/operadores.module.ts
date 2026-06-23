import { Module } from '@nestjs/common';
import { OperadoresService } from './operadores.service';
import { OperadoresController } from './operadores.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Operadores } from 'src/entities/Operadores';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { Clientes } from 'src/entities/Clientes';
import { LicenciasModule } from 'src/licencias/licencias.module';
import { Licencias } from 'src/entities/Licencias';
import { Usuarios } from 'src/entities/Usuarios';

@Module({
  imports: [TypeOrmModule.forFeature([Operadores, Clientes, Licencias, Usuarios]), BitacoraModule, LicenciasModule],
  controllers: [OperadoresController],
  providers: [OperadoresService],
})
export class OperadoresModule {}
