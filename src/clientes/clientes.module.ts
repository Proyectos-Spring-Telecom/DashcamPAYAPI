import { Module } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { ClientesController } from './clientes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clientes } from 'src/entities/Clientes';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { CatpasajeroModule } from 'src/cattiposasajeros/catpasajero.module';

@Module({
  imports: [TypeOrmModule.forFeature([Clientes]), BitacoraModule,CatpasajeroModule],
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
