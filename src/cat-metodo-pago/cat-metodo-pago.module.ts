import { Module } from '@nestjs/common';
import { CatMetodoPagoService } from './cat-metodo-pago.service';
import { CatMetodoPagoController } from './cat-metodo-pago.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatMetodoPago } from 'src/entities/CatMetodoPago';

@Module({
  imports: [TypeOrmModule.forFeature([CatMetodoPago]), BitacoraModule],
  controllers: [CatMetodoPagoController],
  providers: [CatMetodoPagoService],
  exports: [CatMetodoPagoService],
})
export class CatMetodoPagoModule {}
