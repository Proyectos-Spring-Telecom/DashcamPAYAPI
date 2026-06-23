import { Module } from '@nestjs/common';
import { CatReferenciaServicioService } from './cat-referencia-servicio.service';
import { CatReferenciaServicioController } from './cat-referencia-servicio.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatReferenciaServicio } from 'src/entities/CatReferenciaServicio';

@Module({
  imports: [
    TypeOrmModule.forFeature([CatReferenciaServicio]),
    BitacoraModule,
  ],
  controllers: [CatReferenciaServicioController],
  providers: [CatReferenciaServicioService],
  exports: [CatReferenciaServicioService],
})
export class CatReferenciaServicioModule {}
