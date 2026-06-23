import { Module } from '@nestjs/common';
import { TransaccionesService } from './transacciones.service';
import { TransaccionesController } from './transacciones.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonederosModule } from 'src/monederos/monederos.module';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { NetpayModule } from 'src/netpay/netpay.module';
import { Validadores } from 'src/entities/Validadores';
import { PasajerosModule } from 'src/pasajeros/pasajeros.module';
import { Clientes } from 'src/entities/Clientes';
import { TransaccionesRecarga } from 'src/entities/TransaccionesRecarga';
import { TransaccionesDebito } from 'src/entities/TransaccionesDebito';
import { Monederos } from 'src/entities/Monederos';
import { CatTiposPasajeros } from 'src/entities/CatTiposPasajeros';
import { TransbordosPermitidos } from 'src/entities/TransbordosPermitidos';
import { DetalleTransbordos } from 'src/entities/DetalleTransbordos';
import { HistoricoTransaccionesDebito } from 'src/entities/HistoricoTransaccionesDebito';
import { HistoricoTransaccionesRecarga } from 'src/entities/HistoricoTransaccionesRecarga';
import { Viajes } from 'src/entities/Viajes';
import { Tarifas } from 'src/entities/Tarifas';
import { Variantes } from 'src/entities/Variantes';
import { Turnos } from 'src/entities/Turnos';
import { Instalaciones } from 'src/entities/Instalaciones';
import { CatTiposTransacciones } from 'src/entities/CatTiposTransacciones';
import { Usuarios } from 'src/entities/Usuarios';
import { Pasajeros } from 'src/entities/Pasajeros';
import { DireccionesTarjeta } from 'src/entities/DireccionesTarjeta';
import { DatosTarjeta } from 'src/entities/DatosTarjeta';
import { QRCodes } from 'src/entities/QRCodes';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransaccionesRecarga,
      TransaccionesDebito,
      HistoricoTransaccionesDebito,
      HistoricoTransaccionesRecarga,
      Validadores,
      Clientes,
      Monederos,
      CatTiposPasajeros,
      TransbordosPermitidos,
      DetalleTransbordos,
      Viajes,
      Tarifas,
      Variantes,
      Turnos,
      Instalaciones,
      CatTiposTransacciones,
      Usuarios,
      Pasajeros,
      DireccionesTarjeta,
      DatosTarjeta,
      QRCodes,
    ]),
    MonederosModule,
    BitacoraModule,
    PasajerosModule,
    NetpayModule,
  ],
  controllers: [TransaccionesController],
  providers: [TransaccionesService],
  exports: [TransaccionesService],
})
export class TransaccionesModule {}
