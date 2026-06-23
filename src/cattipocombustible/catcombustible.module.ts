import { Module } from '@nestjs/common';
import { CatcombustibleService } from './catcombustible.service';
import { CatcombustibleController } from './catcombustible.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatTipoCombustible } from 'src/entities/CatTipoCombustible';

@Module({
  imports: [TypeOrmModule.forFeature([CatTipoCombustible]), BitacoraModule],
  controllers: [CatcombustibleController],
  providers: [CatcombustibleService],
})
export class CatcombustibleModule {}
