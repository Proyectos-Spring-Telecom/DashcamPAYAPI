import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsuariosModule } from './usuarios/usuarios.module';
import { AuthModule } from './auth/auth.module';
import { BitacoraModule } from './bitacora/bitacora.module';
import { ClientesModule } from './clientes/clientes.module';
import { ValidadoresModule } from './validadores/validadores.module';
import { ModulosModule } from './modulos/modulos.module';
import { MonederosModule } from './monederos/monederos.module';
import { OperadoresModule } from './operadores/operadores.module';
import { PasajerosModule } from './pasajeros/pasajeros.module';
import { PermisosModule } from './permisos/permisos.module';
import { RolesModule } from './roles/roles.module';
import { TransaccionesModule } from './transacciones/transacciones.module';
import { VehiculosModule } from './vehiculos/vehiculos.module';
import { ContadoresModule } from './contadores/contadores.module';
import { RutasModule } from './rutas/rutas.module';
import { PosicionesModule } from './posiciones/posiciones.module';
import { S3Module } from './s3/s3.module';
import { ConteopasajerosModule } from './conteopasajeros/conteopasajeros.module';
import { InstalacionesModule } from './instalaciones/instalaciones.module';
import { TurnosModule } from './turnos/turnos.module';
import { ZonasModule } from './zonas/zonas.module';
import { UsuarioszonasModule } from './usuarioszonas/usuarioszonas.module';
import { UsuariosinstalacionesModule } from './usuariosinstalaciones/usuariosinstalaciones.module';
import { VariantesModule } from './variantes/variantes.module';
import { TarifasModule } from './tarifas/tarifas.module';
import { ViajesModule } from './viajes/viajes.module';
import { ViajesconteosModule } from './viajesconteos/viajesconteos.module';
import { ViajestransaccionesModule } from './viajestransacciones/viajestransacciones.module';
import { MailModule } from './mail/mail.module';
import { HistoricoinstalacionesModule } from './historicoinstalaciones/historicoinstalaciones.module';
import { MonitoreoModule } from './monitoreo/monitoreo.module';
import { CatpasajeroModule } from './cattiposasajeros/catpasajero.module';
import { CatcombustibleModule } from './cattipocombustible/catcombustible.module';
import { LicenciasModule } from './licencias/licencias.module';
import { CatcategorialicenciaModule } from './catcategorialicencia/catcategorialicencia.module';
import { CattipolicenciaModule } from './cattipolicencia/cattipolicencia.module';
import { CattipodescuentoModule } from './cattipodescuento/cattipodescuento.module';
import { CattipotransaccionesModule } from './cattipotransacciones/cattipotransacciones.module';
import { TalleresModule } from './talleres/talleres.module';
import { CatEstatusMantenimientoModule } from './cat-estatus-mantenimiento/cat-estatus-mantenimiento.module';
import { CatReferenciaServicioModule } from './cat-referencia-servicio/cat-referencia-servicio.module';
import { CatTipoCombustibleModule } from './cat-tipo-combustible/cat-tipo-combustible.module';
import { CatTipoVerificacionesModule } from './cat-tipo-verificaciones/cat-tipo-verificaciones.module';
import { MantenimientoVehicularModule } from './mantenimiento-vehicular/mantenimiento-vehicular.module';
import { MantenimientoCombustibleModule } from './mantenimiento-combustible/mantenimiento-combustible.module';
import { MantenimientoKilometrajeModule } from './mantenimiento-kilometraje/mantenimiento-kilometraje.module';
import { TransbordosModule } from './transbordos/transbordos.module';
import { VerificacionesModule } from './verificaciones/verificaciones.module';
import { ReportesModule } from './reportes/reportes.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { IncidentesModule } from './incidentes/incidentes.module';
import { CatTipoTarifaModule } from './cat-tipo-tarifa/cat-tipo-tarifa.module';
import { NetpayModule } from './netpay/netpay.module';
import { CatMetodoPagoModule } from './cat-metodo-pago/cat-metodo-pago.module';
import { DireccionesModule } from './direcciones/direcciones.module';
import Joi from 'joi';
import { LoggerService } from './common/logger.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().default(3306),
        DB_USER: Joi.string().required(),
        DB_PASSWORD: Joi.string().allow(''), // Puede estar vacío si no hay pass
        DB_DATABASE: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().required(),
        AWS_REGION: Joi.string().required(),
        AWS_ACCESS_KEY_ID: Joi.string().required(),
        AWS_SECRET_ACCESS_KEY: Joi.string().required(),
        AWS_S3_BUCKET: Joi.string().required(),
        UPLOAD_MAX_SIZE: Joi.string().required(),
        HOST: Joi.string().optional(),
        SMTP: Joi.string().optional(),
        E_MAIL: Joi.string().optional(),
        E_MAIL_PASSWORD: Joi.string().optional(),
        SMTP_PASSWORD: Joi.string().optional(),
        NETPAY_ENVIRONMENT: Joi.string()
          .valid('sandbox', 'production')
          .default('sandbox'),
        NETPAY_BASE_URL: Joi.string().uri().optional(),
        NETPAY_PUBLIC_KEY: Joi.string().optional(),
        NETPAY_PRIVATE_KEY: Joi.string().optional(),
        CORS_ORIGINS: Joi.string().optional(),
        ENFORCE_HTTPS: Joi.string().valid('true', 'false').default('false'),
        SWAGGER_ENABLED: Joi.string().valid('true', 'false').default('false'),
        SWAGGER_USER: Joi.string().optional(),
        SWAGGER_PASSWORD: Joi.string().optional(),
      }),
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        autoLoadEntities: false,
        entities: [__dirname + '/entities/*{.ts,.js}'],
        synchronize: false, //Nunca poner en true
        dateStrings: false,
        timezone: 'Z',
        extra: {
          // Evita que bigint se devuelvan como string
          decimalNumbers: true,
        },
      }),
    }),

    UsuariosModule,

    AuthModule,

    BitacoraModule,

    ClientesModule,

    ValidadoresModule,

    ModulosModule,

    MonederosModule,

    OperadoresModule,

    PasajerosModule,

    PermisosModule,

    RolesModule,

    TransaccionesModule,

    VehiculosModule,

    ContadoresModule,

    RutasModule,

    PosicionesModule,

    S3Module,

    ConteopasajerosModule,

    InstalacionesModule,

    TurnosModule,

    ZonasModule,

    UsuarioszonasModule,

    UsuariosinstalacionesModule,

    VariantesModule,

    TarifasModule,

    ViajesModule,

    ViajesconteosModule,

    ViajestransaccionesModule,

    MailModule,

    HistoricoinstalacionesModule,

    MonitoreoModule,

    CatpasajeroModule,

    CatcombustibleModule,

    TalleresModule,

    CatEstatusMantenimientoModule,

    CatReferenciaServicioModule,

    CatTipoCombustibleModule,

    CatTipoVerificacionesModule,

    MantenimientoVehicularModule,

    MantenimientoCombustibleModule,

    MantenimientoKilometrajeModule,

    VerificacionesModule,

    IncidentesModule,

    LicenciasModule,

    CatcategorialicenciaModule,

    CattipolicenciaModule,

    CattipodescuentoModule,

    CattipotransaccionesModule,

    TransbordosModule,
    ReportesModule,

    DashboardModule,

    IncidentesModule,

    CatTipoTarifaModule,

    NetpayModule,

    CatMetodoPagoModule,

    DireccionesModule,
  ],
  controllers: [AppController],
  providers: [AppService, LoggerService],
})
export class AppModule {}
