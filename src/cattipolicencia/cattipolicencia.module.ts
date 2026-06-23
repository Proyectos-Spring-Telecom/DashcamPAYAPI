import { Module } from '@nestjs/common';
import { CattipolicenciaService } from './cattipolicencia.service';
import { CattipolicenciaController } from './cattipolicencia.controller';
import { CatTipoLicencia } from 'src/entities/CatTipoLicencia';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([CatTipoLicencia])],
  controllers: [CattipolicenciaController],
  providers: [CattipolicenciaService],
})
export class CattipolicenciaModule {}
