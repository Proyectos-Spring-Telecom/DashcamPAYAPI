import { Module } from '@nestjs/common';
import { OperadoresService } from './operadores.service';
import { OperadoresController } from './operadores.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Operadores } from 'src/entities/Operadores';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [TypeOrmModule.forFeature([Operadores,Clientes]), BitacoraModule],
  controllers: [OperadoresController],
  providers: [OperadoresService],
})
export class OperadoresModule {}
