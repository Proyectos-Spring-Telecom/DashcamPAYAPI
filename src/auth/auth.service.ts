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
import { LoginAuthCodigoDto } from './dto/login-codigo.dto';
import { MailService } from 'src/mail/mail.service';
import { LoginAuthConfirmacionDto } from './dto/login-confirmacion.dto';
import { LoginAuthResetDto } from './dto/login-recuperacion.dto';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { ApiCrudResponse, EstatusEnumBitcora } from 'src/common/ApiResponse';
import { EstatusEnum, TipoCodigoAutenticacion } from 'src/common/estado-componente.enum';
import { CreateAltaPasajaroDto } from './dto/create-pasajero.dto';
import { CodigoPasajeroAutenticacion } from './dto/login-autenticacion.dto';
import { CodigoAutenticacion } from 'src/entities/CodigoAutenticacion';
import { MonederosService } from 'src/monederos/monederos.service';
import { PasajerosService } from 'src/pasajeros/pasajeros.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(UsuariosPermisos)
    private permisosRepository: Repository<UsuariosPermisos>,
    @InjectRepository(CodigoAutenticacion)
    private codigoAutenticacioRepository: Repository<CodigoAutenticacion>,
    private readonly jwtService: JwtService,
    private readonly emailService: MailService,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly monederoService: MonederosService,
    private readonly pasajeroService: PasajerosService,
  ) {}

  async createPasajero(createAltaPasajaroDto: CreateAltaPasajaroDto) {
    try {
      //Buscamos el monedero que este dado de alta
      const monederos = await this.monederoService.findOneMonederoBySerie(
        createAltaPasajaroDto.numeroSerieMonedero,
      );

      if (monederos.data.idPasajero) {
        throw new BadRequestException(
          `El monedero con numero de serie ${createAltaPasajaroDto.numeroSerieMonedero} esta ligado a un pasajero`,
        );
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

      const bodyUsuario = {
        userName: createAltaPasajaroDto.correo,
        passwordHash: createAltaPasajaroDto.passwordHash,
        emailConfirmado: 0,
        nombre: createAltaPasajaroDto.nombre,
        apellidoPaterno: createAltaPasajaroDto.apellidoPaterno,
        apellidoMaterno: createAltaPasajaroDto.apellidoMaterno,
        telefono: createAltaPasajaroDto.telefono,
        fotoPerfil: 'https://dashcamsys.s3.us-east-2.amazonaws.com/imagenes/2c369ac0-c489-4384-8d35-3ba482f7ccaa.jpeg',
        estatus: 1,
        idRol: 9,
        idCliente: monederos.data.idCliente,
      };

      const newUser = await this.usuariosRepository.create(bodyUsuario);
      const userSave = await this.usuariosRepository.save(newUser); //creamos el usuario

      const permisosIds = [77, 80, 90];
      if (permisosIds.length > 0) {
        const usuariosPermisos = permisosIds.map((permisoId) =>
          this.permisosRepository.create({
            idUsuario: userSave.id,
            idPermiso: permisoId,
          }),
        );

        await this.permisosRepository.save(usuariosPermisos);
      }

      const bodyPasajero = {
        nombre: createAltaPasajaroDto.nombre,
        apellidoPaterno: createAltaPasajaroDto.apellidoPaterno,
        apellidoMaterno: createAltaPasajaroDto.apellidoMaterno,
        telefono: createAltaPasajaroDto.telefono,
        fechaNacimiento: createAltaPasajaroDto.fechaNacimiento,
        correo: createAltaPasajaroDto.correo,
        estatus: 1,
      };
      const pasajero = await this.pasajeroService.createPasajeros(
        bodyPasajero,
        userSave.id,
      );

      const payload = {
        id: userSave.id,
        email: userSave.userName,
      };

      //datos del correo
      const token = this.jwtService.sign(payload, {
        expiresIn: `${process.env.JWT_CONFIRMACION}`,
      } as any );

      const codigo = await this.generarCodigo(
        userSave.id,
        TipoCodigoAutenticacion.CONFIRMACION_CORREO,
      );
      //Enviar correo de confirmacion
      const name = `${userSave.nombre} ${userSave.apellidoPaterno} ${userSave.apellidoMaterno ?? ''}`;
      await this.emailService.sendConfirmationEmail(
        userSave.userName,
        name,
        token,
        codigo,
      );

      //afiliamos el monedero al pasajero y cambiamos estatus activo
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
            `${usuarioSinPassword.nombre} ${usuarioSinPassword.apellidoPaterno} ` ||
            '',
        },
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Ha ocurrido un error durante el proceso de creación del pasajero.',
      );
    }
  }


  async singInCodigo(loginAuthCodigo: LoginAuthCodigoDto) {
    try {
      const user = await this.usuariosRepository.findOne({
        relations: ['rol'],
        where: {
          userName: loginAuthCodigo.userName,
          validadorId: loginAuthCodigo.validadorId,
          estatus: 1,
        },
      });
      console.log(user?.id, loginAuthCodigo.codigoHash)
      if (
        !user ||
        !user.codigoHash ||
        !(await bcrypt.compare(loginAuthCodigo.codigoHash, user.codigoHash))
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
      return {
        message: `login exitoso`,
        id: Number(`${user.id}`),
        idCliente: Number(`${user.idCliente}`),
        nombre: `${user.nombre}`,
        apellidoPaterno: `${user.apellidoPaterno}`,
        apellidoMaterno: `${user.apellidoMaterno}`,
        telefono: `${user.telefono}`,
        ultimoLogin: `${user.ultimoLogin}`,
        fechaCreacion: `${user.fechaCreacion}`,
        fotoPerfil: `${user.fotoPerfil}`,
        userName: `${user.userName}`,
        rol: user.rol,
        token: this.jwtService.sign(payload),
        permisos: permisos,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async signIn(loginAuthDto: LoginAuthDto) {
    try {
      const user = await this.usuariosRepository.findOne({
        relations: ['rol','idCliente2'],
        where: { userName: loginAuthDto.userName, estatus: 1, emailConfirmado: 1 },
      });
      console.log({ data: user });
      if (
        !user ||
        !(await bcrypt.compare(loginAuthDto.password, user.passwordHash))
      ) {
        console.log({
          user: user,
          message: 'Entro a verificar los valores y no son iguales',
        });
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
      const fechaActual = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
      console.log(fechaActual);

      await this.usuariosRepository.update(user.id, {
        ultimoLogin: fechaActual,
      });
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
        telefono: `${user.telefono}`,
        ultimoLogin: `${user.ultimoLogin}`,
        fechaCreacion: `${user.fechaCreacion}`,
        fotoPerfil: `${user.fotoPerfil}`,
        userName: `${user.userName}`,
        rol: user.rol,
        token: this.jwtService.sign(payload),
        permisos: permisos,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  //confirmacion de correo
  async verifyUser(codigoPasajeroAutenticacion: CodigoPasajeroAutenticacion) {
    try {
      const codigoValido = await this.codigoAutenticacioRepository.findOne({
        where: {
          codigo: codigoPasajeroAutenticacion.codigo,
          tipo: TipoCodigoAutenticacion.CONFIRMACION_CORREO,
          usado: EstatusEnum.ACTIVO,
        },
      });

      if (!codigoValido) {
        throw new BadRequestException('Código inválido o ya usado');
      }

      const user = await this.usuariosRepository.findOne({
        where: { id: codigoValido.idUsuario },
      });
      if (!user) throw new BadRequestException('Usuario no encontrado');

      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }

      const ahora = new Date();
      const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas en milisegundos
      const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);

      const fechaActual = `${fechaDesfasada.getFullYear()}-${pad(fechaDesfasada.getMonth() + 1)}-${pad(fechaDesfasada.getDate())} ${pad(fechaDesfasada.getHours())}:${pad(fechaDesfasada.getMinutes())}:${pad(fechaDesfasada.getSeconds())}`;

      if (fechaDesfasada > codigoValido.fechaExpiracion) {
        throw new BadRequestException('El código ha expirado');
      }
      await this.usuariosRepository.update(user.id, { emailConfirmado: 1 });

      codigoValido.usado = 1;
      codigoValido.fechaUso = new Date();
      await this.codigoAutenticacioRepository.save(codigoValido);
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

      await this.codigoAutenticacioRepository.update(codigoValido.id, {
        usado: EstatusEnum.INACTIVO,
        estatus: EstatusEnum.INACTIVO,
      });

      return `La verificación del usuario ${user.nombre} se ha completado con éxito.
Muchas gracias por su preferencia.`;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al registrar pasajero.',
        error: error.message,
      });
    }
  }

  //enviar correo para recuperar contraseña
  async recuperarContrasena(
    loginAuthConfirmacionDto: LoginAuthConfirmacionDto,
  ) {
    try {
      const user = await this.usuariosRepository.findOne({
        where: { userName: loginAuthConfirmacionDto.userName },
      });
      if (!user) throw new BadRequestException('Usuario no encontrado');

      const payload = {
        id: user.id,
        email: user.userName,
      };
      const token = this.jwtService.sign(payload, {
        expiresIn: `${process.env.JWT_CONFIRMACION}`, 
      }as any) ;
      const name = `${user.nombre} ${user.apellidoPaterno} ${user.apellidoMaterno}`;
      await this.emailService.sendResetPasswordEmail(
        user.userName,
        name,
        token,
      );
      return  `Se ha enviado un correo con el codigo.`;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al recuperar contraseña del usuario.',
        error: error.message,
      });
    }
  }

  //Creacion de codigo de autenticacion
  async generarCodigo(idUsuario: number, tipo: number): Promise<string> {
    // Generar código de 4 dígitos
    const codigo = Math.floor(1000 + Math.random() * 9000).toString();

    const ahora = new Date();
    const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas
    const expiracionMs = 15 * 60 * 1000; // +15 minutos

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
      });
    } else {
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

    return codigo;
  }

  //recuperar la confirmacion de correo
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
      } as any);
      const name = `${user.nombre} ${user.apellidoPaterno} ${user.apellidoMaterno}`;
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
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al confirmar el usuario.',
        error: error.message,
      });
    }
  }

  //actualizar contraseña
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
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al actualizar contraseña del usuario.',
        error: error.message,
      });
    }
  }
}
