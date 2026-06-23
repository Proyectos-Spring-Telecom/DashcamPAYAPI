import { Module } from '@nestjs/common';
import { MonitoreoService } from './monitoreo.service';
import { MonitoreoController } from './monitoreo.controller';
import { MonitoreoGateway } from './monitoreo.gateway';
import { Clientes } from 'src/entities/Clientes';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Variantes } from 'src/entities/Variantes';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { Posiciones } from 'src/entities/Posiciones';
import { Vehiculos } from 'src/entities/Vehiculos';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Validadores } from 'src/entities/Validadores';
import { Operadores } from 'src/entities/Operadores';
import { Usuarios } from 'src/entities/Usuarios';
import { Turnos } from 'src/entities/Turnos';
import { Viajes } from 'src/entities/Viajes';
import { ConnectedUsers } from 'src/entities/ConnectedUsers';
import { Monederos } from 'src/entities/Monederos';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
    TypeOrmModule.forFeature([
      Variantes,
      UsuariosZonas,
      Clientes,
      Posiciones,
      Vehiculos,
      Instalaciones,
      Validadores,
      Operadores,
      Usuarios,
      Turnos,
      Viajes,
      ConnectedUsers,
      Monederos,
    ]),
  ],
  controllers: [MonitoreoController],
  providers: [MonitoreoService, MonitoreoGateway],
  exports: [MonitoreoGateway, MonitoreoService], // Exportar para usar en PosicionesModule
})
export class MonitoreoModule {}
