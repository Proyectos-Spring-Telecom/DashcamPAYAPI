import { Module } from '@nestjs/common';
import { TransaccionesService } from './transacciones.service';
import { TransaccionesController } from './transacciones.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transacciones } from 'src/entities/Transacciones';
import { MonederosModule } from 'src/monederos/monederos.module';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { Validadores } from 'src/entities/Validadores';
import { Clientes } from 'src/entities/Clientes';
import { PasajerosModule } from 'src/pasajeros/pasajeros.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transacciones,Validadores,Clientes]),
    MonederosModule,
    BitacoraModule,
    PasajerosModule,
  ],
  controllers: [TransaccionesController],
  providers: [TransaccionesService],
  exports: [TransaccionesService]
})
export class TransaccionesModule {}
