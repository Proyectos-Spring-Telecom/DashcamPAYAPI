import { Module } from '@nestjs/common';
import { CatEstatusMantenimientoService } from './cat-estatus-mantenimiento.service';
import { CatEstatusMantenimientoController } from './cat-estatus-mantenimiento.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatEstatusMantenimiento } from 'src/entities/CatEstatusMantenimiento';

@Module({
  imports: [
    TypeOrmModule.forFeature([CatEstatusMantenimiento]),
    BitacoraModule,
  ],
  controllers: [CatEstatusMantenimientoController],
  providers: [CatEstatusMantenimientoService],
  exports: [CatEstatusMantenimientoService],
})
export class CatEstatusMantenimientoModule {}
