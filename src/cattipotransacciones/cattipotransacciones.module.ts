import { Module } from '@nestjs/common';
import { CattipotransaccionesService } from './cattipotransacciones.service';
import { CattipotransaccionesController } from './cattipotransacciones.controller';
import { CatTiposTransacciones } from 'src/entities/CatTiposTransacciones';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([CatTiposTransacciones])],
  controllers: [CattipotransaccionesController],
  providers: [CattipotransaccionesService],
})
export class CattipotransaccionesModule {}
