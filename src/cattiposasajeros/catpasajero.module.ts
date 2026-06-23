import { Module } from '@nestjs/common';
import { CatpasajeroService } from './catpasajero.service';
import { CatpasajeroController } from './catpasajero.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatTiposPasajeros } from 'src/entities/CatTiposPasajeros';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [
    TypeOrmModule.forFeature([CatTiposPasajeros, Clientes]),
    BitacoraModule,
  ],
  controllers: [CatpasajeroController],
  providers: [CatpasajeroService],
  exports: [CatpasajeroService],
})
export class CatpasajeroModule {}
