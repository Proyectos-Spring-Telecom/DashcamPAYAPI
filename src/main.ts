import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpStringResponseFilter } from './utils/http-string-response.filter';
import { SocketIOAdapter } from './common/socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Configurar el adaptador de Socket.IO
  app.useWebSocketAdapter(new SocketIOAdapter(app));

  app.useGlobalFilters(new HttpStringResponseFilter());

  // Configurar CORS global
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Authorization, Accept',
  });

  const config = new DocumentBuilder()
    .setTitle('DashCam API')
    .setDescription('Documentación de la API de DashCam') 
    .setVersion('2.0') 
    .addServer('https://dashcampay.com/apidev', 'Servidor de Desarrollo')   
     .addServer('http://localhost:3000', 'Servidor de Desarrollo')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'bearer-token',
        description: 'Ingresa el token Bearer',
        in: 'header',
      },
      'bearer-token',
    )
    .addTag('Autenticación', 'Endpoints de autenticación y registro')
    .addTag('Bitácora', 'Registro de actividades del sistema')
    .addTag('Contadores', 'Gestión de dispositivos Contadores')
    .addTag('Catálogo categoría licencia', 'Catálogo de categorías de licencias')
    .addTag('Catálogo combustible', 'Catálogo de tipos de combustible')
    .addTag('Catálogo estatus mantenimiento', 'Catálogo de estatus de mantenimiento')
    .addTag('Catálogo referencia servicio', 'Catálogo de referencias de servicio')
    .addTag('Catálogo tipo combustible', 'Catálogo de tipos de combustible')
    .addTag('Catálogo tipo descuento', 'Catálogo de tipos de descuento')
    .addTag('Catálogo tipo licencia', 'Catálogo de tipos de licencia')
    .addTag('Catálogo tipo transacciones', 'Catálogo de tipos de transacciones')
    .addTag('Catálogo tipo verificaciones', 'Catálogo de tipos de verificaciones')
    .addTag('Catálogo tipos pasajeros', 'Catálogo de tipos de pasajeros')
    .addTag('Clientes', 'Gestión de clientes')
    .addTag('Conteo pasajeros', 'Registro y consulta de conteo de pasajeros')
    .addTag('Dashboard', 'Información y KPIs del dashboard')
    .addTag('Variantes', 'Gestión de variantes')
    .addTag('Validadores', 'Gestión de validadores')
    .addTag('Histórico instalaciones', 'Histórico de instalaciones')
    .addTag('Incidentes', 'Registro y gestión de incidentes')
    .addTag('Instalaciones', 'Gestión de instalaciones')
    .addTag('Licencias', 'Gestión de licencias')
    .addTag('Mail', 'Servicio de correo electrónico')
    .addTag('Mantenimiento combustible', 'Registro de mantenimiento de combustible')
    .addTag('Mantenimiento kilometraje', 'Registro de mantenimiento por kilometraje')
    .addTag('Mantenimiento vehicular', 'Gestión de mantenimiento vehicular')
    .addTag('Modulos', 'Gestión de módulos del sistema')
    .addTag('Monederos', 'Gestión de monederos electrónicos')
    .addTag('Monitoreo', 'Monitoreo en tiempo real')
    .addTag('Operadores', 'Gestión de operadores')
    .addTag('Pasajeros', 'Gestión de pasajeros')
    .addTag('Permisos', 'Gestión de permisos')
    .addTag('Posiciones', 'Registro de posiciones GPS')
    .addTag('Zonas', 'Gestión de Zonas')
    .addTag('Reportes', 'Generación de reportes')
    .addTag('Roles', 'Gestión de roles')
    .addTag('Rutas', 'Gestión de rutas')
    .addTag('S3 - archivos', 'Carga de archivos a S3')
    .addTag('Talleres', 'Gestión de talleres')
    .addTag('Tarifas', 'Gestión de tarifas')
    .addTag('Transacciones', 'Registro de transacciones')
    .addTag('Turnos', 'Gestión de turnos')
    .addTag('Usuarios', 'Gestión de usuarios')
    .addTag('Usuarios instalaciones', 'Relación usuarios-instalaciones')
    .addTag('Usuarios Zonas', 'Relación usuarios-Zonas')
    .addTag('Vehiculos', 'Gestión de vehículos')
    .addTag('Verificaciones', 'Gestión de verificaciones vehiculares')
    .addTag('Viajes', 'Gestión de viajes')
    .addTag('Viajes conteos', 'Relación viajes-conteos')
    .addTag('Viajes transacciones', 'Relación viajes-transacciones')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      defaultModelsExpandDepth: -1,
    },
  }); 
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       
      forbidNonWhitelisted: true, 
      transform: true,      
    }),
  );
  
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
