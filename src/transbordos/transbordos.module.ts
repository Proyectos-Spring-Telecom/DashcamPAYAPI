import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransbordosService } from './transbordos.service';
import { TransbordosController } from './transbordos.controller';
import { TransbordosPermitidos } from 'src/entities/TransbordosPermitidos';
import { DetalleTransbordos } from 'src/entities/DetalleTransbordos';
import { Clientes } from 'src/entities/Clientes';
import { CatTipoDescuentoTransbordo } from 'src/entities/CatTipoDescuentoTransbordo';
import { BitacoraModule } from 'src/bitacora/bitacora.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransbordosPermitidos,
      DetalleTransbordos,
      Clientes,
      CatTipoDescuentoTransbordo,
    ]),
    BitacoraModule,
  ],
  controllers: [TransbordosController],
  providers: [TransbordosService],
  exports: [TransbordosService],
})
export class TransbordosModule {}
