import { Module } from '@nestjs/common';
import { VariantesService } from './variantes.service';
import { VariantesController } from './variantes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rutas } from 'src/entities/Rutas';
import { Variantes } from 'src/entities/Variantes';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { Clientes } from 'src/entities/Clientes';
import { CatTipoVariante } from 'src/entities/CatTipoVariante';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Rutas,
      Variantes,
      UsuariosZonas,
      Clientes,
      CatTipoVariante,
    ]),
    BitacoraModule,
  ],
  controllers: [VariantesController],
  providers: [VariantesService],
})
export class VariantesModule {}
