import { Module } from '@nestjs/common';
import { MonederosService } from './monederos.service';
import { MonederosController } from './monederos.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Monederos } from 'src/entities/Monederos';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { ClientesModule } from 'src/clientes/clientes.module';
import { PasajerosModule } from 'src/pasajeros/pasajeros.module';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [
    TypeOrmModule.forFeature([Monederos,Clientes]),
    BitacoraModule,
    ClientesModule,
    PasajerosModule,
  ],
  controllers: [MonederosController],
  providers: [MonederosService],
  exports: [MonederosService],
})
export class MonederosModule {}
