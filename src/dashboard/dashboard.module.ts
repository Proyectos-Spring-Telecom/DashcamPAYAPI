import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clientes } from 'src/entities/Clientes';
import { TransaccionesDebito } from 'src/entities/TransaccionesDebito';
import { Viajes } from 'src/entities/Viajes';
import { Validadores } from 'src/entities/Validadores';
import { Monederos } from 'src/entities/Monederos';
import { Rutas } from 'src/entities/Rutas';
import { Variantes } from 'src/entities/Variantes';
import { CatTiposPasajeros } from 'src/entities/CatTiposPasajeros';
import { HistoricoTransaccionesDebito } from 'src/entities/HistoricoTransaccionesDebito';
import { ConteoPasajeros } from 'src/entities/ConteoPasajeros';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Clientes,
      TransaccionesDebito,
      Viajes,
      Validadores,
      Monederos,
      Rutas,
      Variantes,
      CatTiposPasajeros,
      HistoricoTransaccionesDebito,
      ConteoPasajeros,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
