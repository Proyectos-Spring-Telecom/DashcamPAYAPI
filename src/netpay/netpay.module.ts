import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NetpayService } from './netpay.service';
import { NetpayController } from './netpay.controller';
import { Pasajeros } from 'src/entities/Pasajeros';
import { DatosTarjeta } from 'src/entities/DatosTarjeta';
import { DireccionesTarjeta } from 'src/entities/DireccionesTarjeta';
import { TokenDirecciones } from 'src/entities/TokenDirecciones';
import { NormalizeCreateCustomerBodyInterceptor } from './interceptors/normalize-create-customer-body.interceptor';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Pasajeros, DatosTarjeta, DireccionesTarjeta, TokenDirecciones]),
  ],
  controllers: [NetpayController],
  providers: [NetpayService, NormalizeCreateCustomerBodyInterceptor],
  exports: [NetpayService],
})
export class NetpayModule {}
