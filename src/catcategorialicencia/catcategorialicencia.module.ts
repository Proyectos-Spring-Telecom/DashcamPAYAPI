import { Module } from '@nestjs/common';
import { CatcategorialicenciaService } from './catcategorialicencia.service';
import { CatcategorialicenciaController } from './catcategorialicencia.controller';
import { CatCategoriaLicencia } from 'src/entities/CatCategoriaLicencia';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([CatCategoriaLicencia])],
  controllers: [CatcategorialicenciaController],
  providers: [CatcategorialicenciaService],
})
export class CatcategorialicenciaModule {}
