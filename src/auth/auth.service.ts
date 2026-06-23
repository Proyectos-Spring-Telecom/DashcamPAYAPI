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
import { RefreshSessions } from 'src/entities/RefreshSessions';
import { LoggerService } from 'src/common/logger.service';
import { createHash, randomInt, randomUUID } from 'crypto';
import { IsNull } from 'typeorm';

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
    @InjectRepository(RefreshSessions)
    private readonly refreshSessionsRepository: Repository<RefreshSessions>,
    private readonly jwtService: JwtService,
    private readonly emailService: MailService,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly monederoService: MonederosService,
    private readonly pasajeroService: PasajerosService,
    private readonly netpayService: NetpayService,
    private readonly loggerService: LoggerService,
  ) {}

  private async generateTokens(
    payload: Record<string, unknown>,
    userId: number,
  ): Promise<{ token: string; refreshToken: string }> {
    const token = this.jwtService.sign(payload);

    const jti = randomUUID();
    const refreshToken = this.jwtService.sign(
      { sub: userId, jti },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES ?? '7d',
      },
    );

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const decoded = this.jwtService.decode(refreshToken);
    const expiresAt = new Date(decoded.exp * 1000);

    await this.refreshSessionsRepository.save(
      this.refreshSessionsRepository.create({
        idUsuario: userId,
        jti,
        tokenHash,
        expiresAt,
      }),
    );

    return { token, refreshToken };
  }

  private padFecha(n: number): string {
    return n < 10 ? '0' + n : String(n);
  }

  private formatFechaDesfasada(): string {
    const ahora = new Date();
    const desfaseMs = -6 * 60 * 60 * 1000;
    const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);
    return `${fechaDesfasada.getFullYear()}-${this.padFecha(fechaDesfasada.getMonth() + 1)}-${this.padFecha(fechaDesfasada.getDate())} ${this.padFecha(fechaDesfasada.getHours())}:${this.padFecha(fechaDesfasada.getMinutes())}:${this.padFecha(fechaDesfasada.getSeconds())}`;
  }

  private fetchOperadorDatosByUserId(userId: number) {
    return this.usuariosRepository.query(
      `
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
        c.Id AS idCliente,
        c.Nombre AS nombreCliente,
        c.ApellidoPaterno AS apellidoPaternoCliente,
        c.ApellidoMaterno AS apellidoMaternoCliente,
        COALESCE(c.Logotipo, cp.Logotipo) AS logotipo,
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
    WHERE u.Id = ?
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
          `,
      [userId],
    );
  }

  private async resolveTurnoViajeActivo(idOperador: number | null): Promise<{
    idTurno: number | null;
    idViaje: number | null;
  }> {
    let idTurno: number | null = null;
    let idViaje: number | null = null;

    if (!idOperador) {
      return { idTurno, idViaje };
    }

    const turnoActivo = await this.turnosRepository.findOne({
      where: { idOperador, estatus: 1 },
      order: { inicio: 'DESC' },
    });

    if (turnoActivo) {
      idTurno = turnoActivo.id;
      const viajeActivo = await this.viajesRepository.findOne({
        where: { idTurno: turnoActivo.id, estatus: 1 },
        order: { inicio: 'DESC' },
      });
      if (viajeActivo) {
        idViaje = viajeActivo.id;
      }
    }

    return { idTurno, idViaje };
  }

  async getMe(userId: number) {
    try {
      const user = await this.usuariosRepository.findOne({
        relations: ['idRol2', 'idCliente2', 'idCliente2.idPadre2'],
        where: { id: userId, estatus: 1 },
      });

      if (!user) {
        throw new UnauthorizedException('Usuario no válido');
      }

      const permisos = await this.permisosRepository.find({
        select: ['idPermiso'],
        where: { idUsuario: user.id, estatus: 1 },
      });

      if (Number(user.idRol) === 3) {
        const operador = await this.fetchOperadorDatosByUserId(userId);
        if (!operador?.length || !operador[0]) {
          throw new NotFoundException(
            'No se encontró información del operador.',
          );
        }

        const op = operador[0];
        const { idTurno, idViaje } = await this.resolveTurnoViajeActivo(
          op.idOperador,
        );
        const pin = user.codigoHash ? 1 : 0;

        return {
          message: 'login exitoso',
          id: Number(op.IdUsuario),
          nombre: op.nombre,
          apellidoPaterno: op.apellidoPaterno,
          apellidoMaterno: op.apellidoMaterno,
          fechaNacimiento: op.fechaNacimiento,
          identificacion: op.identificacion,
          comprobanteDomicilioOperador: op.comprobanteDomicilioOperador,
          certificadoMedicoOperador: op.certificadoMedicoOperador,
          antecedentesNoPenalesOperador: op.antecedentesNoPenalesOperador,
          estatusOperador: op.estatusOperador,
          idCliente: Number(op.idCliente),
          nombreCliente: op.nombreCliente,
          apellidoPaternoCliente: op.apellidoPaternoCliente,
          apellidoMaternoCliente: op.apellidoMaternoCliente,
          logotipo: op.logotipo,
          telefono: op.telefono,
          ultimoLogin: op.ultimoLogin,
          fechaCreacion: op.fechaCreacion,
          fotoPerfil: op.fotoOperador,
          validadorId: op.validadorId,
          pinExist: pin,
          userName: user.userName,
          Licencias: op.Licencias,
          rol: user.idRol2,
          permisos,
          idTurno,
          idViaje,
        };
      }

      const logotipo =
        user.idCliente2?.logotipo ||
        user.idCliente2?.idPadre2?.logotipo ||
        null;

      return {
        message: 'login exitoso',
        id: Number(user.id),
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
        permisos,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.loggerService.error('AuthService', 'getMe failed', error);
      throw new InternalServerErrorException(
        'Internal error occurred. Please contact support.',
      );
    }
  }

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

      const pinValid =
        user.codigoHash &&
        (await bcrypt.compare(loginAuthPin.codigohash, user.codigoHash));
      if (!pinValid) {
        try {
          await this.bitacoraLogger.logToBitacora(
            'Autenticación',
            `Intento de inicio de sesión fallido: ${user.userName}`,
            'LOGIN',
            { userName: user.userName },
            Number(user.id),
            2,
            EstatusEnumBitcora.ERROR,
            'Credenciales inválidas',
          );
        } catch {
          /* el log no debe interrumpir el login */
        }
        throw new UnauthorizedException('Credenciales invalidas');
      }

      await this.usuariosRepository.update(user.id, {
        ultimoLogin: this.formatFechaDesfasada(),
      });

      const operador = await this.fetchOperadorDatosByUserId(user.id);
      if (!operador?.length || !operador[0]) {
        throw new NotFoundException('No se encontró información del operador.');
      }

      const payload = {
        id: user.id,
        email: user.userName,
        cliente: user.idCliente,
        rol: user.idRol,
        idOperador: operador[0].idOperador,
      };

      const tokens = await this.generateTokens(payload, Number(user.id));
      try {
        await this.bitacoraLogger.logToBitacora(
          'Autenticación',
          `Inicio de sesión exitoso: ${user.userName}`,
          'LOGIN',
          { userName: user.userName },
          Number(user.id),
          2,
          EstatusEnumBitcora.SUCCESS,
        );
      } catch {
        /* el log no debe interrumpir el login */
      }
      return {
        token: tokens.token,
        refreshToken: tokens.refreshToken,
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

      if (user.bloqueadoHasta) {
        const ahora = new Date();
        const desfaseMs = -6 * 60 * 60 * 1000;
        const ahoraDesfasado = new Date(ahora.getTime() + desfaseMs);
        if (new Date(user.bloqueadoHasta) > ahoraDesfasado) {
          throw new UnauthorizedException(
            'Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta más tarde.',
          );
        }
      }

      const passwordValid = await bcrypt.compare(
        loginAuthDto.password,
        user.passwordHash,
      );
      if (!passwordValid) {
        const maxIntentos = Number(process.env.MAX_LOGIN_ATTEMPTS ?? 10);
        const lockoutMin = Number(process.env.LOCKOUT_MINUTES ?? 30);
        const nuevosIntentos = (user.intentosFallidos ?? 0) + 1;

        const ahora = new Date();
        const desfaseMs = -6 * 60 * 60 * 1000;
        const ahoraDesfasado = new Date(ahora.getTime() + desfaseMs);

        const updateData: {
          intentosFallidos: number;
          bloqueadoHasta?: string;
        } = { intentosFallidos: nuevosIntentos };
        if (nuevosIntentos >= maxIntentos) {
          const bloqueadoHasta = new Date(
            ahoraDesfasado.getTime() + lockoutMin * 60 * 1000,
          );
          updateData.bloqueadoHasta = `${bloqueadoHasta.getFullYear()}-${this.padFecha(bloqueadoHasta.getMonth() + 1)}-${this.padFecha(bloqueadoHasta.getDate())} ${this.padFecha(bloqueadoHasta.getHours())}:${this.padFecha(bloqueadoHasta.getMinutes())}:${this.padFecha(bloqueadoHasta.getSeconds())}`;
        }
        await this.usuariosRepository.update(user.id, updateData);

        try {
          if (nuevosIntentos >= maxIntentos) {
            await this.bitacoraLogger.logToBitacora(
              'Autenticación',
              `Cuenta bloqueada por intentos fallidos: ${user.userName}`,
              'LOCK',
              { userName: user.userName },
              Number(user.id),
              2,
              EstatusEnumBitcora.ERROR,
              'Bloqueo temporal',
            );
          }
          await this.bitacoraLogger.logToBitacora(
            'Autenticación',
            `Intento de inicio de sesión fallido: ${user.userName}`,
            'LOGIN',
            { userName: user.userName },
            Number(user.id),
            2,
            EstatusEnumBitcora.ERROR,
            'Credenciales inválidas',
          );
        } catch {
          /* el log no debe interrumpir el login */
        }

        throw new UnauthorizedException('Credenciales invalidas');
      }

      await this.usuariosRepository.update(user.id, {
        ultimoLogin: this.formatFechaDesfasada(),
        intentosFallidos: 0,
        bloqueadoHasta: null,
      });

      const payload: Record<string, unknown> = {
        id: user.id,
        email: user.userName,
        cliente: user.idCliente,
        rol: user.idRol,
      };

      if (Number(user.idRol) === 3) {
        const operador = await this.fetchOperadorDatosByUserId(user.id);
        if (!operador?.length || !operador[0]) {
          throw new NotFoundException(
            'No se encontró información del operador.',
          );
        }
        payload.idOperador = operador[0].idOperador;
      }

      const tokens = await this.generateTokens(payload, Number(user.id));
      try {
        await this.bitacoraLogger.logToBitacora(
          'Autenticación',
          `Inicio de sesión exitoso: ${user.userName}`,
          'LOGIN',
          { userName: user.userName },
          Number(user.id),
          2,
          EstatusEnumBitcora.SUCCESS,
        );
      } catch {
        /* el log no debe interrumpir el login */
      }
      return {
        token: tokens.token,
        refreshToken: tokens.refreshToken,
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
      const registro = await this.codigoAutenticacioRepository.findOne({
        where: {
          tipo: TipoCodigoAutenticacion.CONFIRMACION_CORREO,
          usado: EstatusEnum.ACTIVO,
        },
        order: { id: 'DESC' },
      });

      if (!registro) {
        throw new BadRequestException('Código inválido o ya usado');
      }

      const ahora = new Date();
      const desfaseMs = -6 * 60 * 60 * 1000;
      const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);

      if (fechaDesfasada > registro.fechaExpiracion) {
        await this.codigoAutenticacioRepository.update(registro.id, {
          usado: EstatusEnum.INACTIVO,
          estatus: EstatusEnum.INACTIVO,
        });
        throw new BadRequestException('El código ha expirado');
      }

      if (codigoPasajeroAutenticacion.codigo !== registro.codigo) {
        const maxIntentos = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);
        const nuevosIntentos = (registro.intentos ?? 0) + 1;

        if (nuevosIntentos >= maxIntentos) {
          await this.codigoAutenticacioRepository.update(registro.id, {
            intentos: nuevosIntentos,
            usado: EstatusEnum.INACTIVO,
            estatus: EstatusEnum.INACTIVO,
          });
          throw new BadRequestException(
            'Demasiados intentos. Solicita un nuevo código.',
          );
        }

        await this.codigoAutenticacioRepository.update(registro.id, {
          intentos: nuevosIntentos,
        });
        throw new BadRequestException('Código inválido');
      }

      const user = await this.usuariosRepository.findOne({
        where: { id: registro.idUsuario },
      });
      if (!user) throw new BadRequestException('Usuario no encontrado');

      const fechaActual = this.formatFechaDesfasada();

      await this.usuariosRepository.update(user.id, { emailConfirmado: 1 });

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

      await this.codigoAutenticacioRepository.update(registro.id, {
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
    const codigo = randomInt(100000, 1000000).toString();

    const ahora = new Date();
    const desfaseMs = -6 * 60 * 60 * 1000;
    const expiracionMs = 15 * 60 * 1000;

    const expiracion = new Date(ahora.getTime() + expiracionMs + desfaseMs);

    const codigoExiste = await this.codigoAutenticacioRepository.findOne({
      where: {
        idUsuario: idUsuario,
      },
    });

    if (codigoExiste) {
      await this.codigoAutenticacioRepository.update(codigoExiste.id, {
        codigo,
        fechaCreacion: ahora,
        fechaExpiracion: expiracion,
        usado: EstatusEnum.ACTIVO,
        estatus: EstatusEnum.ACTIVO,
        fechaUso: null,
        intentos: 0,
      });
    } else {
      const codigoCreate = this.codigoAutenticacioRepository.create({
        idUsuario: idUsuario,
        codigo: codigo,
        tipo: tipo,
        fechaExpiracion: expiracion,
        usado: EstatusEnum.ACTIVO,
        estatus: EstatusEnum.ACTIVO,
        intentos: 0,
      });
      await this.codigoAutenticacioRepository.save(codigoCreate);
    }

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

  async refreshToken(refreshToken: string) {
    try {
      let payloadJwt: { jti: string; sub: number };
      try {
        payloadJwt = this.jwtService.verify(refreshToken, {
          secret: process.env.JWT_REFRESH_SECRET,
        });
      } catch {
        throw new UnauthorizedException('Refresh token inválido o expirado');
      }

      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

      const session = await this.refreshSessionsRepository.findOne({
        where: { jti: payloadJwt.jti },
      });

      if (!session || session.tokenHash !== tokenHash) {
        throw new UnauthorizedException('Refresh token inválido');
      }
      if (session.revokedAt) {
        await this.refreshSessionsRepository.update(
          { idUsuario: session.idUsuario, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
        throw new UnauthorizedException(
          'Refresh token ya utilizado. Sesiones revocadas por seguridad.',
        );
      }
      if (session.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token expirado');
      }

      const user = await this.usuariosRepository.findOne({
        where: { id: session.idUsuario },
      });
      if (!user || user.estatus !== 1) {
        throw new UnauthorizedException('Usuario no válido');
      }

      const payload: Record<string, unknown> = {
        id: user.id,
        email: user.userName,
        cliente: user.idCliente,
        rol: user.idRol,
      };

      if (Number(user.idRol) === 3) {
        const operador = await this.fetchOperadorDatosByUserId(user.id);
        if (operador?.[0]?.idOperador) {
          payload.idOperador = operador[0].idOperador;
        }
      }

      const tokens = await this.generateTokens(payload, Number(user.id));
      const nuevaSesion = await this.refreshSessionsRepository.findOne({
        where: { idUsuario: Number(user.id) },
        order: { id: 'DESC' },
      });
      await this.refreshSessionsRepository.update(session.id, {
        revokedAt: new Date(),
        replacedById: nuevaSesion ? nuevaSesion.id : null,
      });

      return { token: tokens.token, refreshToken: tokens.refreshToken };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.loggerService.error('AuthService', 'refreshToken failed', error);
      throw new InternalServerErrorException(
        'Internal error occurred. Please contact support.',
      );
    }
  }

  async logout(refreshToken: string) {
    try {
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      const session = await this.refreshSessionsRepository.findOne({
        where: { tokenHash },
      });
      if (session && !session.revokedAt) {
        await this.refreshSessionsRepository.update(session.id, {
          revokedAt: new Date(),
        });
        try {
          await this.bitacoraLogger.logToBitacora(
            'Autenticación',
            'Cierre de sesión',
            'LOGOUT',
            {},
            Number(session.idUsuario),
            2,
            EstatusEnumBitcora.SUCCESS,
          );
        } catch {
          /* el log no debe interrumpir el logout */
        }
      }
      return { message: 'Sesión cerrada correctamente' };
    } catch (error) {
      this.loggerService.error('AuthService', 'logout failed', error);
      throw new InternalServerErrorException(
        'Internal error occurred. Please contact support.',
      );
    }
  }
}
