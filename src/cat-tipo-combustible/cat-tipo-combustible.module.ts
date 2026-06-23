import { Module } from '@nestjs/common';
import { CatTipoCombustibleService } from './cat-tipo-combustible.service';
import { CatTipoCombustibleController } from './cat-tipo-combustible.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatTipoCombustible } from 'src/entities/CatTipoCombustible';

@Module({
  imports: [
    TypeOrmModule.forFeature([CatTipoCombustible]),
    BitacoraModule,
  ],
  controllers: [CatTipoCombustibleController],
  providers: [CatTipoCombustibleService],
  exports: [CatTipoCombustibleService],
})
export class CatTipoCombustibleModule {}
