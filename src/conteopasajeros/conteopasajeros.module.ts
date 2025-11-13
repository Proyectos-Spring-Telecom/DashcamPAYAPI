import { Module } from '@nestjs/common';
import { ConteopasajerosService } from './conteopasajeros.service';
import { ConteopasajerosController } from './conteopasajeros.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConteoPasajeros } from 'src/entities/ConteoPasajeros';
import { BitacoraModule } from 'src/bitacora/bitacora.module';

@Module({
  imports:[TypeOrmModule.forFeature([ConteoPasajeros]),BitacoraModule],
  controllers: [ConteopasajerosController],
  providers: [ConteopasajerosService],
})
export class ConteopasajerosModule {}
