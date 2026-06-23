import { Module } from '@nestjs/common';
import { TarifasService } from './tarifas.service';
import { TarifasController } from './tarifas.controller';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { Tarifas } from 'src/entities/Tarifas';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Variantes } from 'src/entities/Variantes';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tarifas, Variantes, UsuariosZonas, Clientes]),
    BitacoraModule,
  ],
  controllers: [TarifasController],
  providers: [TarifasService],
})
export class TarifasModule {}
