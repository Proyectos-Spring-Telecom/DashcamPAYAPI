import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DireccionesService } from './direcciones.service';
import { DireccionesController } from './direcciones.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [ConfigModule, HttpModule],
  controllers: [DireccionesController],
  providers: [DireccionesService],
  exports: [DireccionesService],
})
export class DireccionesModule {}
