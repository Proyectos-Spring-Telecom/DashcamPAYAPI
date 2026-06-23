import { Module } from '@nestjs/common';
import { CattipodescuentoService } from './cattipodescuento.service';
import { CattipodescuentoController } from './cattipodescuento.controller';
import { CatTipoDescuento } from 'src/entities/CatTipoDescuento';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([CatTipoDescuento])],
  controllers: [CattipodescuentoController],
  providers: [CattipodescuentoService],
})
export class CattipodescuentoModule {}
