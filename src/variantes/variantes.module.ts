import { Module } from '@nestjs/common';
import { VariantesService } from './variantes.service'; 
import { VariantesController } from '../variantes/variantes.controller'
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rutas } from 'src/entities/Rutas';
import { Variantes } from 'src/entities/Variantes';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [TypeOrmModule.forFeature([Rutas,Variantes,UsuariosZonas,Clientes]), BitacoraModule],
  controllers: [VariantesController],
  providers: [VariantesService],
})
export class VariantesModule {}
