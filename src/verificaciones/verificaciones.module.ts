import { Module } from '@nestjs/common';
import { VerificacionesService } from './verificaciones.service';
import { VerificacionesController } from './verificaciones.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { S3Module } from 'src/s3/s3.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Verificaciones } from 'src/entities/Verificaciones';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Operadores } from 'src/entities/Operadores';
import { CatTipoVerificaciones } from 'src/entities/CatTipoVerificaciones';
import { CatCategoriaMantenimientoMecanico } from 'src/entities/CatCategoriaMantenimientoMecanico';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Verificaciones,
      Instalaciones,
      Operadores,
      CatTipoVerificaciones,
      CatCategoriaMantenimientoMecanico,
      Clientes,
    ]),
    BitacoraModule,
    S3Module,
  ],
  controllers: [VerificacionesController],
  providers: [VerificacionesService],
  exports: [VerificacionesService],
})
export class VerificacionesModule {}
