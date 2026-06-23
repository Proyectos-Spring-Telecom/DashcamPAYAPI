import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpStringResponseFilter } from './utils/http-string-response.filter';
import { SocketIOAdapter } from './common/socket-io.adapter';
import helmet from 'helmet';
import basicAuth from 'express-basic-auth';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Configurar el adaptador de Socket.IO
  app.useWebSocketAdapter(new SocketIOAdapter(app));

  // El TLS lo termina el reverse proxy; confiar en sus headers X-Forwarded-*
  app.set('trust proxy', 1);

  // Cabeceras de seguridad HTTP (PCI DSS Req. 6.4.1)
  app.use(
    helmet({
      // HSTS: forzar HTTPS en el navegador por 1 año, incluyendo subdominios
      hsts: {
        maxAge: 31536000, // 1 año en segundos
        includeSubDomains: true,
        preload: true,
      },
      // CSP configurada para permitir que Swagger UI siga funcionando
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          imgSrc: [`'self'`, 'data:', 'https:'],
          scriptSrc: [`'self'`, `'unsafe-inline'`],
        },
      },
      // Evita problemas de carga de recursos de Swagger UI
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Redirect HTTP -> HTTPS (activar solo si el proxy NO lo hace ya)
  if (process.env.ENFORCE_HTTPS === 'true') {
    app.use((req, res, next) => {
      const proto = req.header('x-forwarded-proto');
      if (proto && proto !== 'https') {
        return res.redirect(301, `https://${req.header('host')}${req.url}`);
      }
      next();
    });
  }

  app.useGlobalFilters(new HttpStringResponseFilter());

  // Configurar CORS — solo orígenes autorizados (PCI DSS Req. 1.3 / 6.4.3)
  // Los orígenes se leen de la variable de entorno CORS_ORIGINS (separados por coma).
  // CORS valida por origin (esquema + dominio + puerto), NO por ruta.
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'https://dashcampay.com')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  app.enableCors({
    origin: (origin, callback) => {
      // Permitir herramientas sin origin (curl, apps móviles nativas, healthchecks)
      if (!origin) {
        return callback(null, true);
      }
      if (corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Authorization, Accept',
  });

  // Swagger gobernado por entorno (PCI DSS Req. 2.2 / 6.4)
  // SWAGGER_ENABLED=false en producción pública. Si se habilita, queda protegido con auth básica.
  if (process.env.SWAGGER_ENABLED === 'true') {
    const swaggerUser = process.env.SWAGGER_USER || 'admin';
    const swaggerPassword = process.env.SWAGGER_PASSWORD || '';

    if (!swaggerPassword) {
      throw new Error(
        'SWAGGER_ENABLED=true requiere SWAGGER_PASSWORD configurada en el .env',
      );
    }

    app.use(
      ['/docs', '/docs-json'],
      basicAuth({
        challenge: true,
        users: { [swaggerUser]: swaggerPassword },
      }),
    );

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
      .addTag(
        'Catálogo categoría licencia',
        'Catálogo de categorías de licencias',
      )
      .addTag('Catálogo combustible', 'Catálogo de tipos de combustible')
      .addTag(
        'Catálogo estatus mantenimiento',
        'Catálogo de estatus de mantenimiento',
      )
      .addTag(
        'Catálogo referencia servicio',
        'Catálogo de referencias de servicio',
      )
      .addTag('Catálogo tipo combustible', 'Catálogo de tipos de combustible')
      .addTag('Catálogo tipo descuento', 'Catálogo de tipos de descuento')
      .addTag('Catálogo tipo licencia', 'Catálogo de tipos de licencia')
      .addTag(
        'Catálogo tipo transacciones',
        'Catálogo de tipos de transacciones',
      )
      .addTag(
        'Catálogo tipo verificaciones',
        'Catálogo de tipos de verificaciones',
      )
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
      .addTag(
        'Mantenimiento combustible',
        'Registro de mantenimiento de combustible',
      )
      .addTag(
        'Mantenimiento kilometraje',
        'Registro de mantenimiento por kilometraje',
      )
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
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
