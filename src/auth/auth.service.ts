import { formatFechaDb, nowDb } from 'src/common/clock';
import {
  BadRequestException,
  ForbiddenException,
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
import { Validadores } from 'src/entities/Validadores';
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import { IsNull } from 'typeorm';
import { JwtTyp } from './jwt-types';
import { SecurityFlags } from 'src/common/security-flags';
import { clientesPermitidos } from 'src/common/tenant/ownership-resolvers';
import { isMissingTokenVersionColumn } from './token-version';
import { hashOtp, otpMatchesHash } from 'src/common/otp-hash';

/** Payload de los tokens de propósito (confirmación de correo, reset de contraseña). */
interface PurposeTokenPayload {
  id?: number;
  email?: string;
  typ?: string;
  tv?: number;
}

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
    @InjectRepository(Validadores)
    private readonly validadoresRepository: Repository<Validadores>,
    private readonly jwtService: JwtService,
    private readonly emailService: MailService,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly monederoService: MonederosService,
    private readonly pasajeroService: PasajerosService,
    private readonly netpayService: NetpayService,
    private readonly loggerService: LoggerService,
  ) {}

  private purposeSecret(): string {
    const secret =
      process.env.JWT_PURPOSE_SECRET || process.env.JWT_SECRET || '';
    if (!secret) {
      throw new InternalServerErrorException(
        'JWT_PURPOSE_SECRET / JWT_SECRET no configurado',
      );
    }
    return secret;
  }

  /**
   * `tv` ata el token a la TokenVersion vigente: al cambiar la contraseña se
   * incrementa y el mismo token de reset ya no sirve (uso único, H-03).
   */
  private async signPurposeToken(
    userId: number,
    email: string,
    typ: typeof JwtTyp.EMAIL_CONFIRM | typeof JwtTyp.PWD_RESET,
  ): Promise<string> {
    const tv = await this.currentTokenVersion(userId);
    return this.jwtService.sign(
      { id: userId, email, typ, tv },
      {
        secret: this.purposeSecret(),
        expiresIn: process.env.JWT_CONFIRMACION || '15m',
        algorithm: 'HS256',
      },
    );
  }

  private extractBearer(authorization?: string): string | null {
    if (!authorization) return null;
    const [scheme, token] = authorization.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
      return null;
    }
    return token;
  }

  private verifyPurposeToken(token: string): PurposeTokenPayload {
    try {
      return this.jwtService.verify(token, {
        secret: this.purposeSecret(),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  /**
   * Valida el Bearer de restablecimiento ANTES de buscar al usuario: sin token
   * válido la respuesta es la misma exista o no la cuenta (anti-enumeración).
   */
  private verifyResetBearer(
    authorization: string | undefined,
  ): PurposeTokenPayload {
    const token = this.extractBearer(authorization);
    if (!token) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    const payload = this.verifyPurposeToken(token);
    if (payload.typ !== JwtTyp.PWD_RESET) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    return payload;
  }

  /**
   * El cambio de contraseña exige siempre el token PWD_RESET que llega por
   * correo; el OTP, si se envía, es un factor adicional, no un sustituto.
   */
  private async assertPasswordChangeAuthorized(
    loginAuthResetDto: LoginAuthResetDto,
    payload: PurposeTokenPayload,
    user: Usuarios,
  ): Promise<void> {
    const email = String(payload.email || '').toLowerCase();
    const target = String(loginAuthResetDto.userName || '').toLowerCase();
    if (email !== target || Number(payload.id) !== Number(user.id)) {
      throw new ForbiddenException(
        'No se puede cambiar la contraseña de otro usuario',
      );
    }
    const tv = await this.currentTokenVersion(Number(user.id));
    if (payload.tv === undefined || Number(payload.tv) !== tv) {
      throw new UnauthorizedException('El enlace ya fue usado o expiró');
    }
  }

  /**
   * Mismo mensaje para usuario inexistente, sin código, vencido, erróneo o
   * agotado: el texto no debe revelar si la cuenta existe o tiene OTP pendiente.
   */
  private static readonly CODIGO_INVALIDO =
    'Código inválido o expirado. Si el problema persiste, solicita un nuevo código.';

  /**
   * Compara el OTP vigente y cuenta intentos fallidos; al llegar a
   * OTP_MAX_ATTEMPTS el código se invalida. Devuelve el registro a consumir.
   */
  private async checkOtp(
    idUsuario: number,
    tipo: TipoCodigoAutenticacion,
    codigo: string,
  ): Promise<CodigoAutenticacion> {
    const registro = await this.codigoAutenticacioRepository.findOne({
      where: { idUsuario, tipo, usado: EstatusEnum.ACTIVO },
      order: { id: 'DESC' },
    });
    if (!registro) {
      throw new BadRequestException(AuthService.CODIGO_INVALIDO);
    }
    if (new Date() > registro.fechaExpiracion) {
      await this.codigoAutenticacioRepository.update(registro.id, {
        usado: EstatusEnum.INACTIVO,
        estatus: EstatusEnum.INACTIVO,
      });
      throw new BadRequestException(AuthService.CODIGO_INVALIDO);
    }
    if (!otpMatchesHash(idUsuario, tipo, codigo, registro.codigo)) {
      const maxIntentos = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);
      const nuevosIntentos = (registro.intentos ?? 0) + 1;
      if (nuevosIntentos >= maxIntentos) {
        await this.codigoAutenticacioRepository.update(registro.id, {
          intentos: nuevosIntentos,
          usado: EstatusEnum.INACTIVO,
          estatus: EstatusEnum.INACTIVO,
        });
        throw new BadRequestException(AuthService.CODIGO_INVALIDO);
      }
      await this.codigoAutenticacioRepository.update(registro.id, {
        intentos: nuevosIntentos,
      });
      throw new BadRequestException(AuthService.CODIGO_INVALIDO);
    }
    return registro;
  }

  private async consumeOtp(registro: CodigoAutenticacion): Promise<void> {
    await this.codigoAutenticacioRepository.update(registro.id, {
      usado: EstatusEnum.INACTIVO,
      estatus: EstatusEnum.INACTIVO,
      fechaUso: nowDb(),
    });
  }

  private static readonly CREDENCIALES_INVALIDAS = 'Credenciales invalidas';

  /** Hash de relleno (coste 10) para que un usuario inexistente tarde lo mismo que uno real. */
  private static readonly DUMMY_PASSWORD_HASH =
    '$2b$10$Zjm72KPXp/0t766cyNivIubmMZeI6YYb7Ayu0C05NBcZjZjyhXWdO';

  private throwCredencialesInvalidas(): never {
    throw new UnauthorizedException(AuthService.CREDENCIALES_INVALIDAS);
  }

  private async burnPasswordTime(plain: string): Promise<void> {
    await bcrypt.compare(plain, AuthService.DUMMY_PASSWORD_HASH);
  }

  private assertNotLocked(user: Usuarios): void {
    if (!user.bloqueadoHasta) return;
    if (new Date(user.bloqueadoHasta) > new Date()) {
      throw new UnauthorizedException(
        'Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta más tarde.',
      );
    }
  }

  private async recordFailedLogin(
    user: Usuarios,
    maxIntentos = Number(process.env.MAX_LOGIN_ATTEMPTS ?? 10),
  ): Promise<void> {
    const lockoutMin = Number(process.env.LOCKOUT_MINUTES ?? 30);
    const nuevosIntentos = (user.intentosFallidos ?? 0) + 1;
    const updateData: { intentosFallidos: number; bloqueadoHasta?: string } = {
      intentosFallidos: nuevosIntentos,
    };
    if (nuevosIntentos >= maxIntentos) {
      const bloqueadoHasta = new Date(
        Date.now() + lockoutMin * 60 * 1000,
      );
      updateData.bloqueadoHasta = this.formatFechaLocal(bloqueadoHasta);
    }
    await this.usuariosRepository.update(user.id, updateData);
  }

  async bumpTokenVersion(userId: number): Promise<void> {
    try {
      await this.usuariosRepository.increment({ id: userId }, 'tokenVersion', 1);
    } catch (error) {
      if (!isMissingTokenVersionColumn(error)) {
        throw error;
      }
    }
    await this.refreshSessionsRepository.update(
      { idUsuario: userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async currentTokenVersion(userId: number): Promise<number> {
    try {
      const user = await this.usuariosRepository.findOne({
        where: { id: userId },
        select: ['id', 'tokenVersion'],
      });
      return Number(user?.tokenVersion ?? 0);
    } catch (error) {
      if (isMissingTokenVersionColumn(error)) {
        return 0;
      }
      throw error;
    }
  }

  private async generateTokens(
    payload: Record<string, unknown>,
    userId: number,
  ): Promise<{ token: string; refreshToken: string }> {
    const tv = await this.currentTokenVersion(userId);
    const token = this.jwtService.sign({
      ...payload,
      typ: JwtTyp.ACCESS,
      tv,
    });

    const jti = randomUUID();
    const refreshToken = this.jwtService.sign(
      { sub: userId, jti },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES ?? '7d',
        algorithm: 'HS256',
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
    return formatFechaDb();
  }

  private formatFechaLocal(fecha: Date): string {
    return `${fecha.getUTCFullYear()}-${this.padFecha(fecha.getUTCMonth() + 1)}-${this.padFecha(fecha.getUTCDate())} ${this.padFecha(fecha.getUTCHours())}:${this.padFecha(fecha.getUTCMinutes())}:${this.padFecha(fecha.getUTCSeconds())}`;
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
      // 64 bits de azar: la serie viaja en el QR de pago y con el formato
      // anterior (timestamp + 4 dígitos, ~13 bits) era adivinable.
      numeroSerie = `MON-${randomBytes(8).toString('hex').toUpperCase()}`;

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

      const assertClienteActivo = async (idCliente: number) => {
        const rows = await this.monederosRepository.manager.query(
          'SELECT Id, Estatus, PermiteRegistroPublico FROM Clientes WHERE Id = ? LIMIT 1',
          [idCliente],
        );
        if (
          !rows?.length ||
          Number(rows[0].Estatus) !== 1 ||
          Number(rows[0].PermiteRegistroPublico) !== 1
        ) {
          throw new BadRequestException(
            'El cliente no está disponible para registro.',
          );
        }
      };

      // Si no se proporciona numeroSerieMonedero, generar uno aleatorio único y crear el monedero
      if (!createAltaPasajaroDto.numeroSerieMonedero) {
        // Validar que idCliente sea obligatorio cuando no se envía numeroSerieMonedero
        if (!createAltaPasajaroDto.idCliente) {
          throw new BadRequestException(
            'El idCliente es obligatorio cuando no se proporciona un monedero',
          );
        }

        await assertClienteActivo(Number(createAltaPasajaroDto.idCliente));

        // Generar número de serie aleatorio único
        numeroSerieMonedero = await this.generarNumeroSerieUnico();

        // Crear nuevo monedero con el número de serie generado
        const fechaDesfasada = nowDb();

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
        // (el idCliente del body se ignora: manda el del monedero)
        numeroSerieMonedero = createAltaPasajaroDto.numeroSerieMonedero;
        const monederoLibre = await this.monederosRepository.findOne({
          where: [
            { numeroSerie: numeroSerieMonedero },
            { idCard: numeroSerieMonedero },
          ],
          select: ['id', 'idCliente', 'idPasajero', 'numeroSerie'],
        });
        const rechazoRegistro =
          'No se pudo completar el registro con ese monedero.';
        if (!monederoLibre) {
          throw new BadRequestException(rechazoRegistro);
        }
        if (monederoLibre.idPasajero) {
          throw new BadRequestException(rechazoRegistro);
        }
        monederos = {
          data: {
            id: monederoLibre.id,
            idCliente: monederoLibre.idCliente,
            idPasajero: monederoLibre.idPasajero,
          },
        };

        // Obtener el idCliente del monedero previamente registrado
        idClienteMonedero = monederos.data.idCliente;
        await assertClienteActivo(Number(idClienteMonedero));
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
          const randomIdentifier = randomInt(1000000000, 10000000000).toString();

          this.loggerService.debug('AuthService', 'Creating NetPay customer');

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
              `Se creó el customer en NetPay para el pasajero con ID: ${pasajero.data.id}.`,
              'CREATE',
              {
                pasajeroId: pasajero.data.id,
                idUsuario: userSave.id,
              },
              Number(userSave.id),
              21, // EnumModulos.PASAJEROS
              EstatusEnumBitcora.SUCCESS,
            );
          } else {
            this.loggerService.error(
              'AuthService',
              'NetPay customer created but customerId not found',
            );

            await this.bitacoraLogger.logToBitacora(
              'Pasajeros',
              `Se creó el customer en NetPay pero no se obtuvo el customerId.`,
              'CREATE',
              { pasajeroId: pasajero.data.id },
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
          await this.bitacoraLogger.logToBitacora(
            'Pasajeros',
            `Error al crear customer en NetPay para el pasajero con ID: ${pasajero.data.id}. El pasajero fue creado correctamente.`,
            'CREATE',
            { pasajeroId: pasajero.data.id },
            Number(userSave.id),
            21,
            EstatusEnumBitcora.ERROR,
            'No se pudo crear el customer en NetPay',
          );
        }
      } else {
        this.loggerService.debug(
          'AuthService',
          'NetPay customer creation skipped',
          { reason: 'Missing email or pasajero ID' },
        );
      }

      const token = await this.signPurposeToken(
        Number(userSave.id),
        userSave.userName,
        JwtTyp.EMAIL_CONFIRM,
      );

      //Llamamos la funcion que nos genera el codigo
      const codigo = await this.generarCodigo(
        userSave.id,
        TipoCodigoAutenticacion.CONFIRMACION_CORREO,
      );
      //Enviar correo de confirmacion
      const name = `${userSave.nombre} ${userSave.apellidoPaterno} ${userSave.apellidoMaterno ?? ''}`;
      // H-55: sin await, el registro no debe bloquearse ni fallar por el SMTP;
      // un error de envío solo se registra (mismo patrón que recuperación).
      void this.emailService
        .sendConfirmationEmail(userSave.userName, name, token, codigo)
        .catch((emailError: unknown) =>
          this.loggerService.error(
            'AuthService',
            'Error al enviar correo de confirmación en registro de pasajero',
            emailError,
          ),
        );

      //afiliamos el monedero al pasajero y cambiamos estatus activo
      // Actualizar el monedero con el ID del pasajero y activarlo
      if (monederos && monederos.data) {
        function pad(n: number) {
          return n < 10 ? '0' + n : n;
        }
        const fechaDesfasada = nowDb();

        const fechaActual = `${fechaDesfasada.getUTCFullYear()}-${pad(fechaDesfasada.getUTCMonth() + 1)}-${pad(fechaDesfasada.getUTCDate())} ${pad(fechaDesfasada.getUTCHours())}:${pad(fechaDesfasada.getUTCMinutes())}:${pad(fechaDesfasada.getUTCSeconds())}`;

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
      const {
        passwordHash: _pwdAlta,
        ...altaSinPassword
      } = createAltaPasajaroDto as typeof createAltaPasajaroDto & {
        passwordHash?: string;
      };
      const querylogger = { ...altaSinPassword };
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

  /**
   * El operador puede entrar en otro camión. Si la serie existe, está activa
   * y es de su cliente, queda asignada a él y se libera del operador anterior.
   */
  private async reasignarValidadorDelOperador(
    user: Usuarios,
    numeroSerie: string,
  ): Promise<void> {
    const serie = String(numeroSerie ?? '').trim();
    if (!serie) {
      this.throwCredencialesInvalidas();
    }
    if (user.validadorId === serie) return;

    const dispositivo = await this.validadoresRepository.findOne({
      where: { numeroSerie: serie },
    });
    if (!dispositivo || Number(dispositivo.estatus) !== 1) {
      this.throwCredencialesInvalidas();
    }

    const permitidos = await clientesPermitidos(
      this.usuariosRepository,
      Number(user.idCliente),
    );
    if (!permitidos.includes(Number(dispositivo.idCliente))) {
      this.throwCredencialesInvalidas();
    }

    const ocupantes = await this.usuariosRepository.find({
      where: { validadorId: serie },
    });
    await Promise.all(
      ocupantes
        .filter((otro) => Number(otro.id) !== Number(user.id))
        .map((otro) =>
          this.usuariosRepository.update(otro.id, { validadorId: null }),
        ),
    );

    const anterior = user.validadorId ?? null;
    await this.usuariosRepository.update(user.id, { validadorId: serie });
    user.validadorId = serie;

    // Regla de negocio (V2-01): el validador se asigna al operador que inicia
    // sesión en él. Queda rastro de cada cambio para poder auditarlo.
    this.bitacoraLogger.registrar([
      'Autenticación',
      `Validador ${serie} asignado al operador ${user.userName} al iniciar sesión`,
      'UPDATE',
      {
        idUsuario: Number(user.id),
        numeroSerieAnterior: anterior,
        numeroSerieNuevo: serie,
        idUsuariosDesplazados: ocupantes
          .filter((otro) => Number(otro.id) !== Number(user.id))
          .map((otro) => Number(otro.id)),
      },
      Number(user.id),
      EnumModulos.USUARIOS,
      EstatusEnumBitcora.SUCCESS,
    ]);
  }

  // ========================================
  //Login por PIN
  // ========================================
  async singInPin(loginAuthPin: LoginAuthPinDto) {
    try {
      // Buscar por usuario/correo (activo, email confirmado, cliente activo).
      const user = await this.usuariosRepository.findOne({
        relations: ['idRol2', 'idCliente2', 'idCliente2.idPadre2'],
        where: {
          userName: loginAuthPin.userName,
          estatus: 1,
          emailConfirmado: 1,
          idCliente2: {
            estatus: 1,
          },
        },
      });

      if (!user || user.idCliente2?.estatus === 0 || Number(user.idRol) !== 3) {
        await this.burnPasswordTime(loginAuthPin.codigohash);
        this.throwCredencialesInvalidas();
      }

      this.assertNotLocked(user);

      const pinValid = user.codigoHash
        ? await bcrypt.compare(loginAuthPin.codigohash, user.codigoHash)
        : false;
      if (!user.codigoHash) {
        await this.burnPasswordTime(loginAuthPin.codigohash);
      }
      if (!pinValid) {
        // H-40: mismo lockout que el login por contraseña, pero con umbral
        // propio del PIN (MAX_PIN_ATTEMPTS, análogo a MAX_LOGIN_ATTEMPTS).
        await this.recordFailedLogin(
          user,
          Number(process.env.MAX_PIN_ATTEMPTS ?? 5),
        );
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
        this.throwCredencialesInvalidas();
      }

      await this.reasignarValidadorDelOperador(user, loginAuthPin.validadorId);

      await this.usuariosRepository.update(user.id, {
        ultimoLogin: this.formatFechaDesfasada(),
        intentosFallidos: 0,
        bloqueadoHasta: null,
      });

      const operador = await this.fetchOperadorDatosByUserId(user.id);
      if (
        !operador?.length ||
        !operador[0]?.idOperador ||
        Number(operador[0].estatusOperador) !== 1
      ) {
        this.throwCredencialesInvalidas();
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
        await this.burnPasswordTime(loginAuthDto.password);
        this.throwCredencialesInvalidas();
      }

      this.assertNotLocked(user);

      const passwordValid = user.passwordHash?.startsWith('$2')
        ? await bcrypt.compare(loginAuthDto.password, user.passwordHash)
        : false;
      if (!user.passwordHash?.startsWith('$2')) {
        await this.burnPasswordTime(loginAuthDto.password);
      }
      if (!passwordValid) {
        const nuevosIntentos = (user.intentosFallidos ?? 0) + 1;
        const maxIntentos = Number(process.env.MAX_LOGIN_ATTEMPTS ?? 10);
        await this.recordFailedLogin(user);

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

      if (Number(user.idRol) === 3 && loginAuthDto.validadorId) {
        await this.reasignarValidadorDelOperador(user, loginAuthDto.validadorId);
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
      // El OTP va atado al usuario (HMAC con IdUsuario), así que sin userName
      // no hay nada que comparar; ya no existe el modo "último OTP global".
      if (!codigoPasajeroAutenticacion.userName) {
        throw new BadRequestException('El campo userName es obligatorio');
      }
      const user = await this.usuariosRepository.findOne({
        where: { userName: codigoPasajeroAutenticacion.userName },
      });
      if (!user) {
        throw new BadRequestException(AuthService.CODIGO_INVALIDO);
      }

      const registro = await this.checkOtp(
        Number(user.id),
        TipoCodigoAutenticacion.CONFIRMACION_CORREO,
        codigoPasajeroAutenticacion.codigo,
      );

      await this.usuariosRepository.update(user.id, { emailConfirmado: 1 });
      await this.consumeOtp(registro);

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

  /** Misma respuesta exista o no la cuenta, para no revelar usuarios. */
  private static readonly RECUPERACION_ENVIADA =
    'Si la cuenta existe, enviamos un correo con las instrucciones.';

  // ========================================
  //enviar correo para recuperar contraseña
  // ========================================
  async recuperarContrasena(
    loginAuthConfirmacionDto: LoginAuthConfirmacionDto,
  ) {
    try {
      const user = await this.usuariosRepository.findOne({
        where: { userName: loginAuthConfirmacionDto.userName },
      });
      if (!user) {
        await this.burnPasswordTime(String(loginAuthConfirmacionDto.userName));
        return AuthService.RECUPERACION_ENVIADA;
      }

      // El correo solo lleva el enlace con el token PWD_RESET; ya no se genera
      // un OTP de recuperación que nunca se enviaba y se podía forzar.
      const token = await this.signPurposeToken(
        Number(user.id),
        user.userName,
        JwtTyp.PWD_RESET,
      );
      const name =
        `${user.nombre ?? ''} ${user.apellidoPaterno ?? ''} ${user.apellidoMaterno ?? ''}`.trim();
      // Sin await: el tiempo y el resultado de la respuesta no deben depender
      // de que la cuenta exista (anti-enumeración); un fallo SMTP se registra.
      void this.emailService
        .sendResetPasswordEmail(user.userName, name, token)
        .catch((error) =>
          this.loggerService.error(
            'AuthService',
            'Envío de correo de recuperación falló',
            error,
          ),
        );
      return AuthService.RECUPERACION_ENVIADA;
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
    const codigoHash = hashOtp(idUsuario, tipo, codigo);

    const ahora = new Date();
    const expiracionMs = 15 * 60 * 1000;
    const expiracion = new Date(ahora.getTime() + expiracionMs);

    const codigoExiste = await this.codigoAutenticacioRepository.findOne({
      where: {
        idUsuario: idUsuario,
        tipo: tipo,
      },
      order: { id: 'DESC' },
    });

    if (codigoExiste) {
      await this.codigoAutenticacioRepository.update(codigoExiste.id, {
        codigo: codigoHash,
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
        codigo: codigoHash,
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
      if (!user || Number(user.emailConfirmado) === 1) {
        return AuthService.RECUPERACION_ENVIADA;
      }

      const codigo = await this.generarCodigo(
        user.id,
        TipoCodigoAutenticacion.CONFIRMACION_CORREO,
      );

      const token = await this.signPurposeToken(
        Number(user.id),
        user.userName,
        JwtTyp.EMAIL_CONFIRM,
      );
      const name =
        `${user.nombre ?? ''} ${user.apellidoPaterno ?? ''} ${user.apellidoMaterno ?? ''}`.trim();
      // Sin await, por la misma razón que en recuperarContrasena.
      void this.emailService
        .sendConfirmationEmail(user.userName, name, token, codigo)
        .catch((error) =>
          this.loggerService.error(
            'AuthService',
            'Envío de correo de confirmación falló',
            error,
          ),
        );
      return AuthService.RECUPERACION_ENVIADA;
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
  async resetPassword(
    loginAuthResetDto: LoginAuthResetDto,
    authorization?: string,
  ) {
    try {
      const payload = this.verifyResetBearer(authorization);
      const user = await this.usuariosRepository.findOne({
        where: { userName: loginAuthResetDto.userName },
      });
      if (!user) throw new UnauthorizedException('Token inválido o expirado');

      await this.assertPasswordChangeAuthorized(
        loginAuthResetDto,
        payload,
        user,
      );

      if (loginAuthResetDto.codigo) {
        const registro = await this.checkOtp(
          Number(user.id),
          TipoCodigoAutenticacion.RECUPERACION_CONTRASENA,
          loginAuthResetDto.codigo,
        );
        await this.consumeOtp(registro);
      }

      const hashedPassword = await bcrypt.hash(loginAuthResetDto.password, 10);
      await this.usuariosRepository.update(user.id, {
        passwordHash: hashedPassword,
        intentosFallidos: 0,
        bloqueadoHasta: null,
      });
      // Invalida el token de reset usado, los access y los refresh vigentes.
      await this.bumpTokenVersion(Number(user.id));
      const querylogger = { id: user.id };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se actualizo la contraseña del usuarios con ID: ${user.id}`,
        'UPDATE',
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
          algorithms: ['HS256'],
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

      // Se reclama la sesión antes de emitir tokens: con el UPDATE condicionado
      // solo una de dos peticiones simultáneas con el mismo refresh gana; antes
      // las dos obtenían una sesión nueva.
      const reclamo = await this.refreshSessionsRepository.update(
        { id: session.id, tokenHash, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      if ((reclamo.affected ?? 0) !== 1) {
        await this.refreshSessionsRepository.update(
          { idUsuario: session.idUsuario, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
        throw new UnauthorizedException(
          'Refresh token ya utilizado. Sesiones revocadas por seguridad.',
        );
      }

      const user = await this.usuariosRepository.findOne({
        where: { id: session.idUsuario },
      });
      if (!user || Number(user.estatus) !== 1) {
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
