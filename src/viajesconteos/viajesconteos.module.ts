import { Module } from '@nestjs/common';
import { ViajesconteosService } from './viajesconteos.service';
import { ViajesconteosController } from './viajesconteos.controller';
import { ViajesConteos } from 'src/entities/ViajesConteos';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [BitacoraModule, TypeOrmModule.forFeature([ViajesConteos, Clientes])],
  controllers: [ViajesconteosController],
  providers: [ViajesconteosService],
})
export class ViajesconteosModule { }
