import { Module } from '@nestjs/common';
import { ValidadoresService } from './validadores.service'; 
import { ValidadoresController } from './validadores.controller'; 
import { TypeOrmModule } from '@nestjs/typeorm';
import { Validadores } from 'src/entities/Validadores';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { ClientesModule } from 'src/clientes/clientes.module';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [TypeOrmModule.forFeature([Validadores, Instalaciones,Clientes]), BitacoraModule,ClientesModule],
  controllers: [ValidadoresController],
  providers: [ValidadoresService],
  exports: [ValidadoresService]
})
export class ValidadoresModule {}
