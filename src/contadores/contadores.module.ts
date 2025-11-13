import { Module } from '@nestjs/common';
import { ContadoresService } from '../contadores/contadores.service';
import { ContadoresController } from '../contadores/contadores.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contadores } from 'src/entities/Contadores';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Clientes } from 'src/entities/Clientes';

@Module({
    imports: [TypeOrmModule.forFeature([Contadores,Instalaciones,Clientes]), BitacoraModule],
  controllers: [ContadoresController],
  providers: [ContadoresService],
})
export class ContadoresModule {}
