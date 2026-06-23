import { Module } from '@nestjs/common';
import { CatTipoVerificacionesService } from './cat-tipo-verificaciones.service';
import { CatTipoVerificacionesController } from './cat-tipo-verificaciones.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatTipoVerificaciones } from 'src/entities/CatTipoVerificaciones';

@Module({
  imports: [
    TypeOrmModule.forFeature([CatTipoVerificaciones]),
    BitacoraModule,
  ],
  controllers: [CatTipoVerificacionesController],
  providers: [CatTipoVerificacionesService],
  exports: [CatTipoVerificacionesService],
})
export class CatTipoVerificacionesModule {}
