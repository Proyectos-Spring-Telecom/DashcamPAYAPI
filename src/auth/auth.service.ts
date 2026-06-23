import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuarios } from 'src/entities/Usuarios';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginAuthDto } from './dto/login-auth.dto';
import { UsuariosPermisos } from 'src/entities/UsuariosPermisos';
import { LoginAuthPinDto } from './dto/login-pin.dto';
import { MailService } from 'src/mail/mail.service';
import { LoginAuthConfirmacionDto } from './dto/login-confirmacion.dto';
import { LoginAuthResetDto } from './dto/login-recuperacion.dto';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { ApiCrudResponse, EstatusEnumBitcora } from 'src/common/ApiResponse';
import { CodigoAutenticacion } from 'src/entities/CodigoAutenticacion';
import {
  EnumModulos,
  EnumSolicitudPasajero,
  EstatusEnum,
  TipoCodigoAutenticacion,
} from 'src/common/estatus.enum';
import { CreateAltaPasajaroDto } from './dto/create-pasajero.dto';
import { MonederosService } from 'src/monederos/monederos.service';
import { PasajerosService } from 'src/pasajeros/pasajeros.service';
import { CodigoPasajeroAutenticacion } from './dto/login-autenticacion.dto';
import { NetpayService } from 'src/netpay/netpay.service';
import { Pasajeros } from 'src/entities/Pasajeros';
import { Monederos } from 'src/entities/Monederos';
import { Turnos } from 'src/entities/Turnos';
import { Viajes } from 'src/entities/Viajes';
import { LoggerService } from 'src/common/logger.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(UsuariosPermisos)
    private permisosRepository: Repository<UsuariosPermisos>,
    @InjectRepository(CodigoAutenticacion)
    private codigoAutenticacioRepository: Repository<CodigoAutenticacion>,
    @InjectRepository(Pasajeros)
    private readonly pasajeroRepository: Repository<Pasajeros>,
    @InjectRepository(Monederos)
    private readonly monederosRepository: Repository<Monederos>,
    @InjectRepository(Turnos)
    private readonly turnosRepository: Repository<Turnos>,
    @InjectRepository(Viajes)
    private readonly viajesRepository: Repository<Viajes>,
    private readonly jwtService: JwtService,
    private readonly emailService: MailService,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly monederoService: MonederosService,
    private readonly pasajeroService: PasajerosService,
    private readonly netpayService: NetpayService,
    private readonly loggerService: LoggerService,
  ) {}

  // ========================================
  // 🔹 FUNCIÓN PRIVADA PARA GENERAR NÚMERO DE SERIE ÚNICO
  // ========================================
  private async generarNumeroSerieUnico(): Promise<string> {
    let numeroSerie: string;
    let existe: boolean;
    let intentos = 0;
    const maxIntentos = 100;

    do {
      // Generar número de serie aleatorio con formato MON-XXXX donde XXXX son números aleatorios
      // Usar timestamp y número aleatorio para mayor unicidad
      const timestamp = Date.now().toString().slice(-6); // Últimos 6 dígitos del timestamp
      const numeroAleatorio = Math.floor(1000 + Math.random() * 9000); // Número entre 1000 y 9999
      numeroSerie = `MON-${timestamp}-${numeroAleatorio}`;

      // Verificar si ya existe
      const monederoExistente = await this.monederosRepository.findOne({
        where: { numeroSerie },
      });
      existe = !!monederoExistente;
      intentos++;

      if (intentos >= maxIntentos) {
        throw new InternalServerErrorException(
          'No se pudo generar un número de serie único después de múltiples intentos.',
        );
      }
    } while (existe);

    return numeroSerie;
  }

  // ========================================
  //Creacion de una afiliacion
  // ========================================
  async createPasajero(createAltaPasajaroDto: CreateAltaPasajaroDto) {
    try {
      let monederos: any = null;
      let idClienteMonedero: number | null = null;
      let numeroSerieMonedero: string;

      // Si no se proporciona numeroSerieMonedero, generar uno aleatorio único y crear el monedero
      if (!createAltaPasajaroDto.numeroSerieMonedero) {
        // Validar que idCliente sea obligatorio cuando no se envía numeroSerieMonedero
        if (!createAltaPasajaroDto.idCliente) {
          throw new BadRequestException(
            'El idCliente es obligatorio cuando no se proporciona un monedero',
          );
        }

        // Generar número de serie aleatorio único
        numeroSerieMonedero = await this.generarNumeroSerieUnico();

        // Crear nuevo monedero con el número de serie generado
        const ahora = new Date();
        const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas en milisegundos
        const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);

        const nuevoMonedero = this.monederosRepository.create({
          numeroSerie: numeroSerieMonedero,
          saldo: 0,
          fechaActivacion: fechaDesfasada,
          estatus: EstatusEnum.INACTIVO, // Se activará cuando se asigne al pasajero
          idCliente: createAltaPasajaroDto.idCliente, // Usar idCliente del DTO
          idTipoPasajero: 1, // Tipo de pasajero por defecto
          esVirtual: 1, // Monedero virtual creado automáticamente
        });

        const monederoGuardado =
          await this.monederosRepository.save(nuevoMonedero);

        // Convertir a formato esperado
        monederos = {
          data: {
            id: monederoGuardado.id,
            idCliente: monederoGuardado.idCliente,
            idPasajero: monederoGuardado.idPasajero,
          },
        };

        idClienteMonedero = monederoGuardado.idCliente;

        // Registro en la bitácora SUCCESS
        await this.bitacoraLogger.logToBitacora(
          'Monederos',
          `Se creó un monedero automático con número de serie: ${numeroSerieMonedero} durante el registro de pasajero.`,
          'CREATE',
          {
            numeroSerie: numeroSerieMonedero,
            idCliente: createAltaPasajaroDto.idCliente,
          },
          1, // Usuario sistema por defecto
          EnumModulos.MONEDEROS,
          EstatusEnumBitcora.SUCCESS,
        );
      } else {
        // Si se proporciona numeroSerieMonedero, buscar el monedero existente y obtener su idCliente
        numeroSerieMonedero = createAltaPasajaroDto.numeroSerieMonedero;
        monederos = await this.monederoService.findOneMonederoBySerie(
          createAltaPasajaroDto.numeroSerieMonedero,
        );

        // Validar que el monedero no esté asignado a otro pasajero
        if (monederos.data.idPasajero) {
          // Verificar que el pasajero asociado realmente existe
          const pasajeroAsociado = await this.pasajeroRepository.findOne({
            where: { id: monederos.data.idPasajero },
          });

          if (pasajeroAsociado) {
            throw new BadRequestException(
              `El monedero con número de serie ${createAltaPasajaroDto.numeroSerieMonedero} ya está asignado al pasajero ${pasajeroAsociado.nombre} ${pasajeroAsociado.apellidoPaterno} (ID: ${pasajeroAsociado.id}).`,
            );
          } else {
            throw new BadRequestException(
              `El monedero con número de serie ${createAltaPasajaroDto.numeroSerieMonedero} está asociado a un pasajero que no existe en el sistema.`,
            );
          }
        }

        // Obtener el idCliente del monedero previamente registrado
        idClienteMonedero = monederos.data.idCliente;
      }

      const existUsuario = await this.usuariosRepository.findOne({
        //Buscamos si existe usuario
        where: { userName: createAltaPasajaroDto.correo },
      });
      if (existUsuario) {
        throw new BadRequestException('El usuario ya se encuentra registrado.');
      }

      const hashedPassword = await bcrypt.hash(
        createAltaPasajaroDto.passwordHash,
        10,
      ); //encriptamos la contraseña
      createAltaPasajaroDto.passwordHash = hashedPassword;

      //creamos el body para crear un usuario que le permita loguearse
      const bodyUsuario = {
        userName: createAltaPasajaroDto.correo,
        passwordHash: createAltaPasajaroDto.passwordHash,
        emailConfirmado: 0,
        nombre: createAltaPasajaroDto.nombre,
        apellidoPaterno: createAltaPasajaroDto.apellidoPaterno,
        apellidoMaterno: createAltaPasajaroDto.apellidoMaterno,
        telefono: createAltaPasajaroDto.telefono,
        fotoPerfil:
          'https://dashcamsys.s3.us-east-2.amazonaws.com/imagenes/2c369ac0-c489-4384-8d35-3ba482f7ccaa.jpeg',
        estatus: 1,
        idRol: 9,
        idCliente: idClienteMonedero, // Puede ser null si no se proporcionó monedero
      };

      //Creamos el usuario
      const newUser = this.usuariosRepository.create(bodyUsuario);
      const userSave = await this.usuariosRepository.save(newUser); //creamos el usuario

      //Le añadimos los permisos correspondientes
      const permisosIds = [92];
      if (permisosIds.length > 0) {
        const usuariosPermisos = permisosIds.map((permisoId) =>
          this.permisosRepository.create({
            idUsuario: userSave.id,
            idPermiso: permisoId,
          }),
        );

        //guardamos los permisos
        await this.permisosRepository.save(usuariosPermisos);
      }

      //Creamos el body del pasajero
      const bodyPasajero = {
        nombre: createAltaPasajaroDto.nombre,
        apellidoPaterno: createAltaPasajaroDto.apellidoPaterno,
        apellidoMaterno: createAltaPasajaroDto.apellidoMaterno,
        telefono: createAltaPasajaroDto.telefono,
        fechaNacimiento: createAltaPasajaroDto.fechaNacimiento,
        correo: createAltaPasajaroDto.correo,
        estatus: 1,
        estadoSolicitud: EnumSolicitudPasajero.NOSOLICITADO,
      };

      //Creamos el pasajero
      const pasajero = await this.pasajeroService.createPasajerosAfiliacion(
        bodyPasajero,
        userSave.id,
      );

      // Crear customer en NetPay si el pasajero tiene correo
      this.loggerService.debug(
        'AuthService',
        'Checking if NetPay customer creation is needed',
        {
          hasEmail: !!createAltaPasajaroDto.correo,
          hasPasajeroId: !!pasajero.data?.id,
        },
      );

      if (createAltaPasajaroDto.correo && pasajero.data?.id) {
        try {
          // Combinar apellidos para lastName
          const lastName = createAltaPasajaroDto.apellidoMaterno
            ? `${createAltaPasajaroDto.apellidoPaterno} ${createAltaPasajaroDto.apellidoMaterno}`
            : createAltaPasajaroDto.apellidoPaterno;

          // Generar número aleatorio de 10 dígitos para identifier
          const randomIdentifier = Math.floor(
            1000000000 + Math.random() * 9000000000,
          ).toString();

          this.loggerService.debug('AuthService', 'Creating NetPay customer', {
            email: createAltaPasajaroDto.correo,
            phone: createAltaPasajaroDto.telefono ? 'present' : 'absent',
          });

          const customerResponse = await this.netpayService.createCustomer({
            firstName: createAltaPasajaroDto.nombre,
            lastName: lastName,
            email: createAltaPasajaroDto.correo,
            phone: createAltaPasajaroDto.telefono || undefined,
            identifier: randomIdentifier,
          });

          // El customerId viene en el campo 'id' de la respuesta de NetPay
          const customerId =
            customerResponse?.id || customerResponse?.customerId;

          this.loggerService.debug('AuthService', 'NetPay customer created', {
            hasCustomerId: !!customerId,
          });

          if (customerId) {
            const updateData = {
              customerIdNetPay: customerId,
              idUsuario: userSave.id,
            };

            const updateResult = await this.pasajeroRepository.update(
              pasajero.data.id,
              updateData,
            );

            // Registro en la bitácora SUCCESS
            await this.bitacoraLogger.logToBitacora(
              'Pasajeros',
              `Se creó el customer en NetPay para el pasajero con ID: ${pasajero.data.id}, customerId: ${customerId}, idUsuario: ${userSave.id}`,
              'CREATE',
              {
                pasajeroId: pasajero.data.id,
                customerId,
                idUsuario: userSave.id,
                updateResult,
              },
              Number(userSave.id),
              21, // EnumModulos.PASAJEROS
              EstatusEnumBitcora.SUCCESS,
            );
          } else {
            this.loggerService.error(
              'AuthService',
              'NetPay customer created but customerId not found',
              customerResponse,
            );

            await this.bitacoraLogger.logToBitacora(
              'Pasajeros',
              `Se creó el customer en NetPay pero no se obtuvo el customerId. Respuesta: ${JSON.stringify(customerResponse)}`,
              'CREATE',
              { pasajeroId: pasajero.data.id, customerResponse },
              Number(userSave.id),
              21,
              EstatusEnumBitcora.ERROR,
              'No se obtuvo customerId de la respuesta de NetPay',
            );
          }
        } catch (netpayError: unknown) {
          this.loggerService.error(
            'AuthService',
            'NetPay customer creation failed',
            netpayError,
          );
          const netpayErrorMessage =
            netpayError instanceof Error
              ? netpayError.message
              : 'Unknown NetPay error';
          // Si falla la creación en NetPay, no fallar la creación del pasajero
          // Solo registrar el error en la bitácora
          await this.bitacoraLogger.logToBitacora(
            'Pasajeros',
            `Error al crear customer en NetPay para el pasajero con ID: ${pasajero.data.id}. El pasajero fue creado correctamente.`,
            'CREATE',
            { pasajeroId: pasajero.data.id, error: netpayErrorMessage },
            Number(userSave.id),
            21,
            EstatusEnumBitcora.ERROR,
            netpayErrorMessage,
          );
        }
      } else {
        this.loggerService.debug(
          'AuthService',
          'NetPay customer creation skipped',
          { reason: 'Missing email or pasajero ID' },
        );
      }

      //armamos el payload para el token
      const payload = {
        id: userSave.id,
        email: userSave.userName,
      };

      //creamos el token
      const token = this.jwtService.sign(payload, {
        expiresIn: `${process.env.JWT_CONFIRMACION}`,
      });

      //Llamamos la funcion que nos genera el codigo
      const codigo = await this.generarCodigo(
        userSave.id,
        TipoCodigoAutenticacion.CONFIRMACION_CORREO,
      );
      //Enviar correo de confirmacion
      const name = `${userSave.nombre} ${userSave.apellidoPaterno} ${userSave.apellidoMaterno ?? ''}`;
      try {
        await this.emailService.sendConfirmationEmail(
          userSave.userName,
          name,
          token,
          codigo,
        );
      } catch (_emailError) {
        // Log del error pero no fallar la creación del pasajero
      }

      //afiliamos el monedero al pasajero y cambiamos estatus activo
      // Actualizar el monedero con el ID del pasajero y activarlo
      if (monederos && monederos.data) {
        function pad(n: number) {
          return n < 10 ? '0' + n : n;
        }
        const ahora = new Date();
        const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas en milisegundos
        const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);

        const fechaActual = `${fechaDesfasada.getFullYear()}-${pad(fechaDesfasada.getMonth() + 1)}-${pad(fechaDesfasada.getDate())} ${pad(fechaDesfasada.getHours())}:${pad(fechaDesfasada.getMinutes())}:${pad(fechaDesfasada.getSeconds())}`;

        await this.monederoService.updateMonedero(
          monederos.data.id,
          userSave.id,
          {
            idPasajero: pasajero.data?.id,
            fechaActivacion: fechaActual,
            estatus: EstatusEnum.ACTIVO,
          },
        );
      }

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createAltaPasajaroDto };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se ha creado un usuario con nombre: ${userSave.nombre}.`,
        'CREATE',
        querylogger,
        Number(userSave.id),
        2,
        EstatusEnumBitcora.SUCCESS,
      );

      const { passwordHash: _, ...usuarioSinPassword } = newUser;

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Usuario creado correctamente',
        data: {
          id: Number(usuarioSinPassword.id),
          nombre:
            `${usuarioSinPassword.nombre} ${usuarioSinPassword.apellidoPaterno}`.trim(),
        },
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.loggerService.error('AuthService', 'Operation failed', error);
      throw new InternalServerErrorException(
        'Ha ocurrido un error durante el proceso de creación del pasajero.',
      );
    }
  }

  // ========================================
  //Login por PIN
  // ========================================
  async singInPin(loginAuthPin: LoginAuthPinDto) {
    try {
      //buscamos el usuario
      /* Debe tener el mismo correo
         Debe estar activo en estatus
         debe estar confirmado el correo
         y el cliente al que pertenece debe estar activo
      */
      const user = await this.usuariosRepository.findOne({
        relations: ['idRol2', 'idCliente2', 'idCliente2.idPadre2'],
        where: {
          userName: loginAuthPin.userName,
          validadorId: loginAuthPin.validadorId,
          estatus: 1,
          emailConfirmado: 1,
          idCliente2: {
            estatus: 1,
          },
        },
      });

      if (user?.idCliente2?.estatus === 0) {
        throw new UnauthorizedException(
          'Acceso denegado: el cliente ha sido dado de baja.',
        );
      }
      if (!user) {
        throw new NotFoundException('No se encontró al usuario.');
      }
      if (user.validadorId !== loginAuthPin.validadorId) {
        throw new NotFoundException(
          'El dispositivo reportado no coincide con el dispositivo asignado al usuario.',
        );
      }

      if (
        !user ||
        !user.codigoHash ||
        !(await bcrypt.compare(loginAuthPin.codigohash, user.codigoHash))
      ) {
        throw new UnauthorizedException('Credenciales invalidas');
      }
      const permisos = await this.permisosRepository.find({
        select: ['idPermiso'],
        where: { idUsuario: user.id, estatus: 1 },
      });

      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }

      const ahora = new Date();
      const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas en milisegundos
      const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);

      const fechaActual = `${fechaDesfasada.getFullYear()}-${pad(fechaDesfasada.getMonth() + 1)}-${pad(fechaDesfasada.getDate())} ${pad(fechaDesfasada.getHours())}:${pad(fechaDesfasada.getMinutes())}:${pad(fechaDesfasada.getSeconds())}`;

      await this.usuariosRepository.update(user.id, {
        ultimoLogin: fechaActual,
      });
      const pin = user.codigoHash ? 1 : 0;
      const operador = await this.usuariosRepository.query(`
          WITH DatosUsuario AS (
    SELECT
        u.Id AS IdUsuario,
        u.UserName AS userName,
        u.Nombre AS nombre,
        u.ApellidoPaterno AS apellidoPaterno,
        u.ApellidoMaterno AS apellidoMaterno,
        u.Telefono AS telefono,
        u.UltimoLogin AS ultimoLogin,
        u.FechaCreacion AS fechaCreacion,
        u.FotoPerfil AS fotoPerfil,
        u.ValidadorId AS validadorId,

        -- CLIENTE
        c.Id AS idCliente,
        c.Nombre AS nombreCliente,
        c.ApellidoPaterno AS apellidoPaternoCliente,
        c.ApellidoMaterno AS apellidoMaternoCliente,
        COALESCE(c.Logotipo, cp.Logotipo) AS logotipo,

        -- OPERADOR
        o.Id AS idOperador,
        o.FechaNacimiento AS fechaNacimiento,
        o.Identificacion AS identificacion,
        o.Foto AS fotoOperador,
        o.ComprobanteDomicilio AS comprobanteDomicilioOperador,
        o.CertificadoMedico AS certificadoMedicoOperador,
        o.AntecedentesNoPenales AS antecedentesNoPenalesOperador,
        o.Estatus AS estatusOperador
    FROM Usuarios u
    INNER JOIN Clientes c ON c.Id = u.IdCliente
    LEFT JOIN Clientes cp ON c.IdPadre = cp.Id
    LEFT JOIN Operadores o ON o.IdUsuario = u.Id
    WHERE u.Id = ${user.id}
),
LicenciasJSON AS (
    SELECT
        o.IdUsuario,
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'IdLicencia', l.Id,
                'Licencia', l.Licencia,
                'NumeroLicencia', l.NumeroLicencia,
                'FechaExpedicion', l.FechaExpedicion,
                'FechaVencimiento', l.FechaVencimiento,
                'IdTipoLicencia', l.IdTipoLicencia,
                'IdCategoriaLicencia', l.IdCategoriaLicencia
            )
        ) AS Licencias
    FROM Operadores o
    LEFT JOIN Licencias l ON l.IdOperador = o.Id
    GROUP BY o.IdUsuario
)
SELECT 
    du.*,
    lj.Licencias
FROM DatosUsuario du
LEFT JOIN LicenciasJSON lj ON lj.IdUsuario = du.IdUsuario;
          `);

      if (!operador || operador.length === 0 || !operador[0]) {
        throw new NotFoundException('No se encontró información del operador.');
      }

      const payload = {
        id: user.id,
        email: user.userName,
        cliente: user.idCliente,
        rol: user.idRol,
        idOperador: operador[0].idOperador,
      };

      // Si el rol es 3 (operador), buscar turno y viaje activos
      let idTurno: number | null = null;
      let idViaje: number | null = null;

      if (Number(user.idRol) === 3 && operador[0].idOperador) {
        // Buscar turno activo (estatus = 1) para este operador
        const turnoActivo = await this.turnosRepository.findOne({
          where: {
            idOperador: operador[0].idOperador,
            estatus: 1,
          },
          order: {
            inicio: 'DESC', // Más reciente primero
          },
        });

        if (turnoActivo) {
          idTurno = turnoActivo.id;

          // Buscar viaje activo (estatus = 1) para este turno
          const viajeActivo = await this.viajesRepository.findOne({
            where: {
              idTurno: turnoActivo.id,
              estatus: 1,
            },
            order: {
              inicio: 'DESC', // Más reciente primero
            },
          });

          if (viajeActivo) {
            idViaje = viajeActivo.id;
          }
        }
      }

      return {
        message: `login exitoso`,
        id: Number(operador[0].IdUsuario),
        nombre: operador[0].nombre,
        apellidoPaterno: operador[0].apellidoPaterno,
        apellidoMaterno: operador[0].apellidoMaterno,
        fechaNacimiento: operador[0].fechaNacimiento,
        identificacion: operador[0].identificacion,
        comprobanteDomicilioOperador: operador[0].comprobanteDomicilioOperador,
        certificadoMedicoOperador: operador[0].certificadoMedicoOperador,
        antecedentesNoPenalesOperador:
          operador[0].antecedentesNoPenalesOperador,
        estatusOperador: operador[0].estatusOperador,
        idCliente: Number(operador[0].idCliente),
        nombreCliente: operador[0].nombreCliente,
        apellidoPaternoCliente: operador[0].apellidoPaternoCliente,
        apellidoMaternoCliente: operador[0].apellidoMaternoCliente,
        logotipo: operador[0].logotipo,
        telefono: operador[0].telefono,
        ultimoLogin: operador[0].ultimoLogin,
        fechaCreacion: operador[0].fechaCreacion,
        fotoPerfil: operador[0].fotoOperador,
        validadorId: operador[0].validadorId,
        pinExist: pin,
        userName: user.userName,
        Licencias: operador[0].Licencias,
        rol: user.idRol2,
        token: this.jwtService.sign(payload),
        permisos: permisos,
        idTurno: idTurno,
        idViaje: idViaje,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.loggerService.error('AuthService', 'Operation failed', error);
      throw new InternalServerErrorException(
        'Internal error occurred. Please contact support.',
      );
    }
  }

  // ========================================
  //login por correo
  // ========================================
  async signIn(loginAuthDto: LoginAuthDto) {
    try {
      const user = await this.usuariosRepository.findOne({
        relations: ['idRol2', 'idCliente2', 'idCliente2.idPadre2'],
        where: {
          userName: loginAuthDto.userName,
          estatus: 1,
          emailConfirmado: 1,
        },
      });
      if (!user) {
        throw new NotFoundException('No se encontró al usuario.');
      }

      if (
        !user ||
        !(await bcrypt.compare(loginAuthDto.password, user.passwordHash))
      ) {
        throw new UnauthorizedException('Credenciales invalidas');
      }

      const permisos = await this.permisosRepository.find({
        select: ['idPermiso'],
        where: { idUsuario: user.id, estatus: 1 },
      });

      const payload = {
        id: user.id,
        email: user.userName,
        cliente: user.idCliente,
        rol: user.idRol,
      };

      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }

      const ahora = new Date();
      const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas en milisegundos
      const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);

      const fechaActual = `${fechaDesfasada.getFullYear()}-${pad(fechaDesfasada.getMonth() + 1)}-${pad(fechaDesfasada.getDate())} ${pad(fechaDesfasada.getHours())}:${pad(fechaDesfasada.getMinutes())}:${pad(fechaDesfasada.getSeconds())}`;

      await this.usuariosRepository.update(user.id, {
        ultimoLogin: fechaActual,
      });

      //login para operadores
      if (Number(user.idRol) === 3) {
        const pin = user.codigoHash ? 1 : 0;
        const operador = await this.usuariosRepository.query(`
          WITH DatosUsuario AS (
    SELECT
        u.Id AS IdUsuario,
        u.UserName AS userName,
        u.Nombre AS nombre,
        u.ApellidoPaterno AS apellidoPaterno,
        u.ApellidoMaterno AS apellidoMaterno,
        u.Telefono AS telefono,
        u.UltimoLogin AS ultimoLogin,
        u.FechaCreacion AS fechaCreacion,
        u.FotoPerfil AS fotoPerfil,
        u.ValidadorId AS validadorId,

        -- CLIENTE
        c.Id AS idCliente,
        c.Nombre AS nombreCliente,
        c.ApellidoPaterno AS apellidoPaternoCliente,
        c.ApellidoMaterno AS apellidoMaternoCliente,
        COALESCE(c.Logotipo, cp.Logotipo) AS logotipo,

        -- OPERADOR
        o.Id AS idOperador,
        o.FechaNacimiento AS fechaNacimiento,
        o.Identificacion AS identificacion,
        o.Foto AS fotoOperador,
        o.ComprobanteDomicilio AS comprobanteDomicilioOperador,
        o.CertificadoMedico AS certificadoMedicoOperador,
        o.AntecedentesNoPenales AS antecedentesNoPenalesOperador,
        o.Estatus AS estatusOperador
    FROM Usuarios u
    INNER JOIN Clientes c ON c.Id = u.IdCliente
    LEFT JOIN Clientes cp ON c.IdPadre = cp.Id
    LEFT JOIN Operadores o ON o.IdUsuario = u.Id
    WHERE u.Id = ${user.id}
),
LicenciasJSON AS (
    SELECT
        o.IdUsuario,
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'IdLicencia', l.Id,
                'Licencia', l.Licencia,
                'NumeroLicencia', l.NumeroLicencia,
                'FechaExpedicion', l.FechaExpedicion,
                'FechaVencimiento', l.FechaVencimiento,
                'IdTipoLicencia', l.IdTipoLicencia,
                'IdCategoriaLicencia', l.IdCategoriaLicencia
            )
        ) AS Licencias
    FROM Operadores o
    LEFT JOIN Licencias l ON l.IdOperador = o.Id
    GROUP BY o.IdUsuario
)
SELECT 
    du.*,
    lj.Licencias
FROM DatosUsuario du
LEFT JOIN LicenciasJSON lj ON lj.IdUsuario = du.IdUsuario;
          `);
        if (!operador || operador.length === 0 || !operador[0]) {
          throw new NotFoundException(
            'No se encontró información del operador.',
          );
        }

        const payload = {
          id: user.id,
          email: user.userName,
          cliente: user.idCliente,
          rol: user.idRol,
          idOperador: operador[0].idOperador,
        };

        // Si el rol es 3 (operador), buscar turno y viaje activos
        let idTurno: number | null = null;
        let idViaje: number | null = null;

        if (Number(user.idRol) === 3 && operador[0].idOperador) {
          // Buscar turno activo (estatus = 1) para este operador
          const turnoActivo = await this.turnosRepository.findOne({
            where: {
              idOperador: operador[0].idOperador,
              estatus: 1,
            },
            order: {
              inicio: 'DESC', // Más reciente primero
            },
          });

          if (turnoActivo) {
            idTurno = turnoActivo.id;

            // Buscar viaje activo (estatus = 1) para este turno
            const viajeActivo = await this.viajesRepository.findOne({
              where: {
                idTurno: turnoActivo.id,
                estatus: 1,
              },
              order: {
                inicio: 'DESC', // Más reciente primero
              },
            });

            if (viajeActivo) {
              idViaje = viajeActivo.id;
            }
          }
        }

        return {
          message: `login exitoso`,
          id: Number(operador[0].IdUsuario),
          nombre: operador[0].nombre,
          apellidoPaterno: operador[0].apellidoPaterno,
          apellidoMaterno: operador[0].apellidoMaterno,
          fechaNacimiento: operador[0].fechaNacimiento,
          identificacion: operador[0].identificacion,
          comprobanteDomicilioOperador:
            operador[0].comprobanteDomicilioOperador,
          certificadoMedicoOperador: operador[0].certificadoMedicoOperador,
          antecedentesNoPenalesOperador:
            operador[0].antecedentesNoPenalesOperador,
          estatusOperador: operador[0].estatusOperador,
          idCliente: Number(operador[0].idCliente),
          nombreCliente: operador[0].nombreCliente,
          apellidoPaternoCliente: operador[0].apellidoPaternoCliente,
          apellidoMaternoCliente: operador[0].apellidoMaternoCliente,
          logotipo: operador[0].logotipo,
          telefono: operador[0].telefono,
          ultimoLogin: operador[0].ultimoLogin,
          fechaCreacion: operador[0].fechaCreacion,
          fotoPerfil: operador[0].fotoOperador,
          pinExist: pin,
          userName: user.userName,
          Licencias: operador[0].Licencias,
          rol: user.idRol2,
          token: this.jwtService.sign(payload),
          permisos: permisos,
          idTurno: idTurno,
          idViaje: idViaje,
          validadorId: operador[0].validadorId,
        };
      }
      // Obtener logotipo del cliente o del padre si es null
      const logotipo =
        user.idCliente2?.logotipo ||
        user.idCliente2?.idPadre2?.logotipo ||
        null;

      return {
        message: `login exitoso`,
        id: Number(`${user.id}`),
        nombre: `${user.nombre}`,
        apellidoPaterno: `${user.apellidoPaterno}`,
        apellidoMaterno: `${user.apellidoMaterno}`,
        idCliente: Number(`${user.idCliente}`),
        nombreCliente: `${user.idCliente2?.nombre}`,
        apellidoPaternoCliente: `${user.idCliente2?.apellidoPaterno}`,
        apellidoMaternoCliente: `${user.idCliente2?.apellidoMaterno}`,
        logotipo: logotipo ? `${logotipo}` : null,
        telefono: `${user.telefono}`,
        ultimoLogin: `${user.ultimoLogin}`,
        fechaCreacion: `${user.fechaCreacion}`,
        fotoPerfil: `${user.fotoPerfil}`,
        userName: `${user.userName}`,
        rol: user.idRol2,
        token: this.jwtService.sign(payload),
        permisos: permisos,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.loggerService.error('AuthService', 'Operation failed', error);
      throw new InternalServerErrorException(
        'Internal error occurred. Please contact support.',
      );
    }
  }

  // ========================================
  //confirmacion de correo
  // ========================================
  async verifyUser(codigoPasajeroAutenticacion: CodigoPasajeroAutenticacion) {
    try {
      //Buscamos el codigo en la tabla CodigoAutenticacion tiene que ser  Tipo: 0 y Estatus: 1
      const codigoValido = await this.codigoAutenticacioRepository.findOne({
        where: {
          codigo: codigoPasajeroAutenticacion.codigo,
          tipo: TipoCodigoAutenticacion.CONFIRMACION_CORREO,
          usado: EstatusEnum.ACTIVO,
        },
      });

      //En caso de no encontrar manda error
      if (!codigoValido) {
        throw new BadRequestException('Código inválido o ya usado');
      }

      //Buscamos al usuario por la relacion que tiene la tabla CodigoAutenticacion
      const user = await this.usuariosRepository.findOne({
        where: { id: codigoValido.idUsuario },
      });
      if (!user) throw new BadRequestException('Usuario no encontrado');

      //Generamos la fecha con un retraso de 6 horas para que se guarde de manera correcta
      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }

      const ahora = new Date();
      const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas en milisegundos
      const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);

      const fechaActual = `${fechaDesfasada.getFullYear()}-${pad(fechaDesfasada.getMonth() + 1)}-${pad(fechaDesfasada.getDate())} ${pad(fechaDesfasada.getHours())}:${pad(fechaDesfasada.getMinutes())}:${pad(fechaDesfasada.getSeconds())}`;

      //Verificamos que la fecha no sea mayor a la de expiracion en caso de ser asi
      //el codigo ha expirado
      if (fechaDesfasada > codigoValido.fechaExpiracion) {
        throw new BadRequestException('El código ha expirado');
      }

      //cambiamos el estatus del email a 1 del usuario correspondiente
      await this.usuariosRepository.update(user.id, { emailConfirmado: 1 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: user.id, EmailConfirmado: 1 };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se verifico un usuarios con nombre: ${user.nombre}`,
        'CREATE',
        querylogger,
        Number(user.id),
        2,
        EstatusEnumBitcora.SUCCESS,
      );

      //en la tabla CodigoAutenticacion actualizamos para dar a entender que ya se uso el codigo
      await this.codigoAutenticacioRepository.update(codigoValido.id, {
        usado: EstatusEnum.INACTIVO,
        estatus: EstatusEnum.INACTIVO,
        fechaUso: fechaActual,
      });

      return `La verificación del usuario ${user.nombre} se ha completado con éxito.
Muchas gracias por su preferencia.`;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.loggerService.error('AuthService', 'Operation failed', error);
      throw new InternalServerErrorException(
        'Internal error occurred. Please contact support.',
      );
    }
  }

  // ========================================
  //enviar correo para recuperar contraseña
  // ========================================
  async recuperarContrasena(
    loginAuthConfirmacionDto: LoginAuthConfirmacionDto,
  ) {
    try {
      //Buscamos el usuario por correo
      const user = await this.usuariosRepository.findOne({
        where: { userName: loginAuthConfirmacionDto.userName },
      });
      if (!user) throw new BadRequestException('Usuario no encontrado');

      //Generamos el codigo
      const _codigo = await this.generarCodigo(
        user.id,
        TipoCodigoAutenticacion.RECUPERACION_CONTRASENA,
      );

      //Generamos el payload para el tokenn
      const payload = {
        id: user.id,
        email: user.userName,
      };

      //Generamos el token
      const token = this.jwtService.sign(payload, {
        expiresIn: `${process.env.JWT_CONFIRMACION}`,
      });
      const name =
        `${user.nombre ?? ''} ${user.apellidoPaterno ?? ''} ${user.apellidoMaterno ?? ''}`.trim();
      await this.emailService.sendResetPasswordEmail(
        user.userName,
        name,
        token,
      );
      return `Se ha enviado un correo con el codigo.`;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.loggerService.error('AuthService', 'Operation failed', error);
      throw new InternalServerErrorException(
        'Internal error occurred. Please contact support.',
      );
    }
  }

  // ========================================
  //Creacion de codigo de autenticacion
  // ========================================
  async generarCodigo(idUsuario: number, tipo: number): Promise<string> {
    // Generar código de 4 dígitos
    const codigo = Math.floor(1000 + Math.random() * 9000).toString();

    //Generamos la fecha de Expiracion
    const ahora = new Date();
    const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas
    const expiracionMs = 15 * 60 * 1000; // +15 minutos

    const expiracion = new Date(ahora.getTime() + expiracionMs + desfaseMs);

    //Buscamos si ya existe un atributo con ese usuario
    const codigoExiste = await this.codigoAutenticacioRepository.findOne({
      where: {
        idUsuario: idUsuario,
      },
    });

    //si existe actualiza los datos
    if (codigoExiste) {
      await this.codigoAutenticacioRepository.update(codigoExiste.id, {
        codigo,
        fechaCreacion: ahora,
        fechaExpiracion: expiracion,
        usado: EstatusEnum.ACTIVO,
        estatus: EstatusEnum.ACTIVO,
        fechaUso: null,
      });
    } else {
      //si no se crea el atributo
      const codigoCreate = this.codigoAutenticacioRepository.create({
        idUsuario: idUsuario,
        codigo: codigo,
        tipo: tipo,
        fechaExpiracion: expiracion,
        usado: EstatusEnum.ACTIVO,
        estatus: EstatusEnum.ACTIVO,
      });
      await this.codigoAutenticacioRepository.save(codigoCreate);
    }

    //regresa el codigo
    return codigo;
  }

  // ========================================
  //recuperar la confirmacion de correo
  // ========================================
  async recuperarConfirmacion(
    loginAuthConfirmacionDto: LoginAuthConfirmacionDto,
  ) {
    try {
      const user = await this.usuariosRepository.findOne({
        where: { userName: loginAuthConfirmacionDto.userName },
      });
      if (!user) throw new NotFoundException('Usuario no encontrado.');

      const codigo = await this.generarCodigo(
        user.id,
        TipoCodigoAutenticacion.CONFIRMACION_CORREO,
      );

      const payload = {
        id: user.id,
        email: user.userName,
      };
      const token = this.jwtService.sign(payload, {
        expiresIn: `${process.env.JWT_CONFIRMACION}`,
      });
      const name =
        `${user.nombre ?? ''} ${user.apellidoPaterno ?? ''} ${user.apellidoMaterno ?? ''}`.trim();
      await this.emailService.sendConfirmationEmail(
        user.userName,
        name,
        token,
        codigo,
      );
      return `Se ha enviado un correo con el codigo de autenticación.`;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.loggerService.error('AuthService', 'Operation failed', error);
      throw new InternalServerErrorException(
        'Internal error occurred. Please contact support.',
      );
    }
  }

  // ========================================
  //actualizar contraseña
  // ========================================
  async resetPassword(loginAuthResetDto: LoginAuthResetDto) {
    try {
      const user = await this.usuariosRepository.findOne({
        where: { userName: loginAuthResetDto.userName },
      });
      if (!user) throw new BadRequestException('Usuario no encontrado');

      const hashedPassword = await bcrypt.hash(loginAuthResetDto.password, 10); //encriptamos la contraseña
      loginAuthResetDto.password = hashedPassword;
      await this.usuariosRepository.update(user.id, {
        passwordHash: hashedPassword,
      });
      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: user.id, EmailConfirmado: 1 };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se actualizo la contraseña del usuarios con ID: ${user.id}`,
        'CREATE',
        querylogger,
        Number(user.id),
        2,
        EstatusEnumBitcora.SUCCESS,
      );
      return `La contraseña del usuario ${user.nombre} ha sido actualizada exitosamente.`;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.loggerService.error('AuthService', 'Operation failed', error);
      throw new InternalServerErrorException(
        'Internal error occurred. Please contact support.',
      );
    }
  }
}
