import { Module } from '@nestjs/common';
import { CatTipoTarifaService } from './cat-tipo-tarifa.service';
import { CatTipoTarifaController } from './cat-tipo-tarifa.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatTipoTarifa } from 'src/entities/CatTipoTarifa';

@Module({
  imports: [TypeOrmModule.forFeature([CatTipoTarifa])],
  controllers: [CatTipoTarifaController],
  providers: [CatTipoTarifaService],
  exports: [CatTipoTarifaService],
})
export class CatTipoTarifaModule {}
