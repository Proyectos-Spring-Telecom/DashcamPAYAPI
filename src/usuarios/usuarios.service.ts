import { nowDb } from 'src/common/clock';
import {
  clienteHijosDesdeSp,
  clientesPermitidos,
  tieneIdsTenant,
} from 'src/common/tenant/ownership-resolvers';
import { ROLES_CONOCIDOS } from 'src/guard/roles.decorator';
//Servicio usuario
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { forbidTenantMove } from 'src/common/tenant/forbid-tenant-move';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuarios } from 'src/entities/Usuarios';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UpdateUsuarioEstatusDto } from './dto/update-usuario-estatus.dto';
import * as bcrypt from 'bcrypt';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { ClientesService } from 'src/clientes/clientes.service';
import { UsuariosPermisos } from 'src/entities/UsuariosPermisos';
import { UpdateUsuarioOperadorDto } from './dto/update-usuario-operador.dto';
import { UpdateUsuarioContrasena } from './dto/update-usuario-contrasena.dto';
import { MailService } from 'src/mail/mail.service';
import { JwtService } from '@nestjs/jwt';
import { Clientes } from 'src/entities/Clientes';
import { EnumModulos, EstatusEnum } from 'src/common/estatus.enum';
import { Validadores } from 'src/entities/Validadores';
import { Operadores } from 'src/entities/Operadores';
import { UpdateUsuarioValidadorDto } from './dto/update-usuario-validador.dto';
import { S3Service } from 'src/s3/s3.service';
import { AuthService } from 'src/auth/auth.service';

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(
    @InjectRepository(Usuarios)
    private readonly usuarioRepository: Repository<Usuarios>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly clientesService: ClientesService,
    @InjectRepository(UsuariosPermisos)
    private usuariosPermisosRepository: Repository<UsuariosPermisos>,
    @InjectRepository(Validadores)
    private validadoresRepository: Repository<Validadores>,
    @InjectRepository(Operadores)
    private readonly operadoresRepository: Repository<Operadores>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly emailService: MailService,
    private readonly jwtService: JwtService,
    private readonly s3Service: S3Service,
    private readonly authService: AuthService,
  ) {}

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    return clienteHijosDesdeSp(this.clienteRepository.manager, cliente);
  }

  /** PIN / validador: solo admin, objetivo = operador activo del tenant. */
  private async assertAsignacionPinValidador(
    usuario: Usuarios,
    rolActor: number,
    clienteActor: number,
  ): Promise<void> {
    if (![1, 2].includes(Number(rolActor))) {
      throw new ForbiddenException(
        'Solo administración puede asignar PIN o validador.',
      );
    }
    if (Number(usuario.idRol) !== 3) {
      throw new BadRequestException(
        'Solo se puede asignar PIN o dispositivo a usuarios operador.',
      );
    }
    const operador = await this.operadoresRepository.findOne({
      where: { idUsuario: usuario.id },
    });
    if (!operador || Number(operador.estatus) !== 1) {
      throw new BadRequestException(
        'El operador debe existir y estar activo.',
      );
    }
    if (Number(rolActor) !== 1 && clienteActor) {
      const hijos = await this.clienteHijos(clienteActor);
      const permitidos = hijos?.ids ?? [];
      if (!permitidos.includes(Number(usuario.idCliente))) {
        throw new NotFoundException('Usuario no encontrado.');
      }
    }
  }

  // Obtener todos los usuarios con paginación
  async getAllUsuario(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      let usuarios;
      const offset = (page - 1) * limit;
      let totalResult;

      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          usuarios = await this.usuarioRepository.query(
            `
SELECT
  -- Datos del Usuario
  u.Id AS Id,
  u.UserName AS UserName,
  u.Nombre AS Nombre,
  u.ApellidoPaterno AS ApellidoPaterno,
  u.ApellidoMaterno AS ApellidoMaterno,
  u.Telefono AS Telefono,
  u.UltimoLogin AS UltimoLogin,
  u.ValidadorId AS ValidadorId,
  u.FotoPerfil AS FotoPerfil,
  u.FechaCreacion AS FechaCreacion,
  u.FechaActualizacion AS FechaActualizacion,
  u.Estatus AS estatus,
  u.IdRol AS IdRol,
  -- Datos del Rol
  r.Nombre AS RolNombre,
  r.Descripcion AS RolDescripcion,
  u.IdCliente AS IdCliente,
  -- Datos del Cliente
  c.Nombre AS clienteNombre,
  c.ApellidoPaterno AS ApellidoPaternoCliente,
  c.ApellidoMaterno AS ApellidoMaternoCliente,
  c.Estatus AS EstatusCliente

FROM Usuarios u
INNER JOIN Roles r ON u.IdRol = r.Id
LEFT JOIN Clientes c ON u.IdCliente = c.Id

ORDER BY u.Id DESC
LIMIT ? OFFSET ?;
        `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.usuarioRepository.query(
            `
  SELECT COUNT(*) AS total
  FROM Usuarios u
  INNER JOIN Clientes c ON u.IdCliente = c.Id

  `,
          );
          break;

        case 3:
        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          if (!tieneIdsTenant(ids)) {
            usuarios = [];
            totalResult = [{ total: 0 }];
            break;
          }
          // Consulta de datos paginados resto Usuario
          usuarios = await this.usuarioRepository.query(
            `
SELECT
  -- Datos del Usuario
  u.Id AS Id,
  u.UserName AS UserName,
  u.Nombre AS Nombre,
  u.ApellidoPaterno AS ApellidoPaterno,
  u.ApellidoMaterno AS ApellidoMaterno,
  u.Telefono AS Telefono,
  u.UltimoLogin AS UltimoLogin,
  u.ValidadorId AS ValidadorId,
  u.FotoPerfil AS FotoPerfil,
  u.FechaCreacion AS FechaCreacion,
  u.FechaActualizacion AS FechaActualizacion,
  u.Estatus AS estatus,
  u.IdRol AS IdRol,
  -- Datos del Rol
  r.Nombre AS RolNombre,
  r.Descripcion AS RolDescripcion,
  u.IdCliente AS IdCliente,
  -- Datos del Cliente
  c.Nombre AS clienteNombre,
  c.ApellidoPaterno AS ApellidoPaternoCliente,
  c.ApellidoMaterno AS ApellidoMaternoCliente,
  c.Estatus AS EstatusCliente

FROM Usuarios u
INNER JOIN Roles r ON u.IdRol = r.Id
LEFT JOIN Clientes c ON u.IdCliente = c.Id
WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND u.Estatus = 1
AND u.Id != ?
ORDER BY u.Id DESC
LIMIT ? OFFSET ?;
        `,
            [...ids, idUser, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.usuarioRepository.query(
            `
  SELECT COUNT(*) AS total
  FROM Usuarios u
  INNER JOIN Clientes c ON u.IdCliente = c.Id
	WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND u.Estatus = 1
AND u.Id != ? 
  `,
            [...ids, idUser],
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      const data = usuarios.map((item) => ({
        ...item,
        Id: Number(item.Id),
        IdRol: Number(item.IdRol),
        IdCliente: Number(item.IdCliente),
      }));

      const result: ApiResponseCommon = {
        data: data,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };

      return result;
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al obtener la paginación de usuarios.',
      });
    }
  }

  //Obtener todos los usuarios
  async getAllListUsuarios(
    cliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      let usuarios;

      switch (rol) {
        case 1:
          // Consulta de datos listado Usuario SuperAdministrador
          usuarios = await this.usuarioRepository.query(
            `
SELECT
  -- Datos del Usuario
  u.Id AS Id,
  u.UserName AS UserName,
  u.Nombre AS Nombre,
  u.ApellidoPaterno AS ApellidoPaterno,
  u.ApellidoMaterno AS ApellidoMaterno,
  u.Telefono AS Telefono,
  u.UltimoLogin AS UltimoLogin,
  u.ValidadorId AS ValidadorId,
  u.FotoPerfil AS FotoPerfil,
  u.FechaCreacion AS FechaCreacion,
  u.FechaActualizacion AS FechaActualizacion,
  u.Estatus AS estatus,
  u.IdRol AS IdRol,
  -- Datos del Rol
  r.Nombre AS RolNombre,
  r.Descripcion AS RolDescripcion,
  u.IdCliente AS IdCliente,
  -- Datos del Cliente
  c.Nombre AS clienteNombre,
  c.ApellidoPaterno AS ApellidoPaternoCliente,
  c.ApellidoMaterno AS ApellidoMaternoCliente,
  c.Estatus AS EstatusCliente

FROM Usuarios u
INNER JOIN Roles r ON u.IdRol = r.Id
LEFT JOIN Clientes c ON u.IdCliente = c.Id
WHERE u.Estatus = 1
ORDER BY u.Id DESC;
        `,
          );
          break;

        case 3:
        default:
          // Consulta de datos listado resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          if (!tieneIdsTenant(ids)) {
            usuarios = [];
            break;
          }
          usuarios = await this.usuarioRepository.query(
            `
SELECT
  -- Datos del Usuario
  u.Id AS Id,
  u.UserName AS UserName,
  u.Nombre AS Nombre,
  u.ApellidoPaterno AS ApellidoPaterno,
  u.ApellidoMaterno AS ApellidoMaterno,
  u.Telefono AS Telefono,
  u.UltimoLogin AS UltimoLogin,
  u.ValidadorId AS ValidadorId,
  u.FotoPerfil AS FotoPerfil,
  u.FechaCreacion AS FechaCreacion,
  u.FechaActualizacion AS FechaActualizacion,
  u.Estatus AS estatus,
  u.IdRol AS IdRol,
  -- Datos del Rol
  r.Nombre AS RolNombre,
  r.Descripcion AS RolDescripcion,
  u.IdCliente AS IdCliente,
  -- Datos del Cliente
  c.Nombre AS clienteNombre,
  c.ApellidoPaterno AS ApellidoPaternoCliente,
  c.ApellidoMaterno AS ApellidoMaternoCliente,
  c.Estatus AS EstatusCliente

FROM Usuarios u
INNER JOIN Roles r ON u.IdRol = r.Id
LEFT JOIN Clientes c ON u.IdCliente = c.Id
WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND u.Estatus = 1
ORDER BY u.Id DESC;
        `,
            [...ids],
          );

          break;
      }

      const data = usuarios.map((item) => ({
        ...item,
        Id: Number(item.Id),
        IdRol: Number(item.IdRol),
        IdCliente: Number(item.IdCliente),
      }));

      const result: ApiResponseCommon = {
        data: data,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al obtener el listado de usuarios.',
      });
    }
  }

  //Obtener usuarios operador
  async getAllListUsuariosRol(id: number): Promise<ApiResponseCommon> {
    try {
      const usuarios = await this.usuarioRepository.query(
        `
SELECT
  u.Id AS id,
  u.Nombre AS nombre,
  u.ApellidoPaterno AS apellidoPaterno,
  u.ApellidoMaterno AS apellidoMaterno

FROM Usuarios u
WHERE u.IdRol = 3
AND u.IdCliente = ?
AND u.Estatus = 1
  AND u.Id NOT IN (
    SELECT o.IdUsuario
    FROM Operadores o
  )
ORDER BY u.Id DESC;
        `,
        [id],
      );

      const data = usuarios.map((item) => ({
        ...item,
        id: Number(item.id),
      }));
      const result: ApiResponseCommon = {
        data: data,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al obtener los usuarios por roles.',
      });
    }
  }

  //Obtener usuarios por cliente
  async getAllListUsuariosCliente(
    id: number,
    clienteActor: number,
    rol = 1,
  ): Promise<ApiResponseCommon> {
    try {
      if (Number(rol) !== 1) {
        const permitidos = await clientesPermitidos(
          this.clienteRepository.manager,
          clienteActor,
        );
        if (!permitidos.includes(Number(id))) {
          throw new NotFoundException('Cliente no encontrado');
        }
      }

      const usuarios = await this.usuarioRepository.find({
        where: { estatus: 1, idCliente: id },
      });
      if (usuarios.length === 0) {
        throw new NotFoundException('No se encontraron usuarios.');
      }
      const usuariosSinPassword = usuarios.map(
        ({ passwordHash: _passwordHash, ...rest }) => rest,
      );
      const result: ApiResponseCommon = {
        data: usuariosSinPassword,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          'Se produjo un error al intentar obtener los usuarios asociados al cliente.',
      });
    }
  }

  //Obtener el usuario por ID
  async getUsuarioByID(id: number, cliente: number, rol: number) {
    try {
      let usuarioData;

      switch (rol) {
        case 1:
          // Consulta de datos listado Usuario SuperAdministrador
          usuarioData = await this.usuarioRepository.query(
            `
SELECT
  -- Datos del Usuario
  u.Id AS id,
  u.UserName AS userName,
  u.Nombre AS nombre,
  u.ApellidoPaterno AS apellidoPaterno,
  u.ApellidoMaterno AS apellidoMaterno,
  u.Telefono AS telefono,
  u.UltimoLogin AS ultimoLogin,
  u.ValidadorId AS validadorId,
  u.FotoPerfil AS fotoPerfil,
  u.FechaCreacion AS fechaCreacion,
  u.FechaActualizacion AS fechaActualizacion,
  u.Estatus AS estatus,
  u.IdRol AS idRol,
  -- Datos del rol
  r.Nombre AS rolNombre,
  r.Descripcion AS rolDescripcion,
  u.IdCliente AS idCliente,
  -- Datos del Cliente
  c.Nombre AS clienteNombre,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Usuarios u
INNER JOIN Roles r ON u.IdRol = r.Id
LEFT JOIN Clientes c ON u.IdCliente = c.Id
WHERE u.Id = ?
ORDER BY u.Id DESC
        `,
            [id],
          );
          break;

        case 3:
        default:
          // Consulta de datos paginados resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          if (!tieneIdsTenant(ids)) {
            throw new NotFoundException(
              `No se encontró un usuario con ID: ${id}.`,
            );
          }
          usuarioData = await this.usuarioRepository.query(
            `
SELECT
  -- Datos del Usuario
  u.Id AS id,
  u.UserName AS userName,
  u.Nombre AS nombre,
  u.ApellidoPaterno AS apellidoPaterno,
  u.ApellidoMaterno AS apellidoMaterno,
  u.Telefono AS telefono,
  u.UltimoLogin AS ultimoLogin,
  u.ValidadorId AS validadorId,
  u.FotoPerfil AS fotoPerfil,
  u.FechaCreacion AS fechaCreacion,
  u.FechaActualizacion AS fechaActualizacion,
  u.Estatus AS estatus,
  u.IdRol AS idRol,
  -- Datos del rol
  r.Nombre AS rolNombre,
  r.Descripcion AS rolDescripcion,
  u.IdCliente AS idCliente,
  -- Datos del Cliente
  c.Nombre AS clienteNombre,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Usuarios u
INNER JOIN Roles r ON u.IdRol = r.Id
LEFT JOIN Clientes c ON u.IdCliente = c.Id
WHERE u.Id = ?
AND c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND u.Estatus = 1
ORDER BY u.Id DESC
        `,
            [id, ...ids],
          );
          break;
      }

      if (usuarioData.length === 0) {
        throw new NotFoundException('Usuario no encontrado.');
      }
      const usuario = usuarioData.map((item) => ({
        ...item,
        id: Number(item.id),
        idRol: Number(item.idRol),
        idCliente: Number(item.idCliente),
      }));

      const permisoData = await this.usuariosPermisosRepository.find({
        where: { idUsuario: id, estatus: 1 },
      });

      const permiso = permisoData.map((item) => ({
        ...item,
        id: Number(item.id),
        idUsuario: Number(item.idUsuario),
        idPermiso: Number(item.idPermiso),
      }));

      return { data: { usuario, permiso } };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al obtener al usuario.',
      });
    }
  }

  //Creacion de pin operador
  async createPin(
    userName: string,
    idUser: number,
    updateUsuarioOperadorDto: UpdateUsuarioOperadorDto,
    rolActor = 0,
    clienteActor = 0,
  ): Promise<ApiCrudResponse> {
    try {
      const usuario = await this.usuarioRepository.findOne({
        where: { userName: updateUsuarioOperadorDto.userName },
      });

      if (!usuario) {
        throw new NotFoundException('Usuario no encontrado.');
      }
      await this.assertAsignacionPinValidador(usuario, rolActor, clienteActor);

      const pinPassword = await bcrypt.hash(
        updateUsuarioOperadorDto.codigohash,
        10,
      );

      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }

      const fechaDesfasada = nowDb();
      const fechaActual = `${fechaDesfasada.getUTCFullYear()}-${pad(fechaDesfasada.getUTCMonth() + 1)}-${pad(fechaDesfasada.getUTCDate())} ${pad(fechaDesfasada.getUTCHours())}:${pad(fechaDesfasada.getUTCMinutes())}:${pad(fechaDesfasada.getUTCSeconds())}`;
      const bodyOperador = {
        codigoHash: pinPassword,
        actualizacionCodigo: fechaActual,
      };

      await this.usuarioRepository.update(usuario.id, bodyOperador);

      const querylogger = { idUsuarioObjetivo: Number(usuario.id) };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `El PIN ha sido generado para el usuario con ID: ${usuario.id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.SUCCESS,
      );

      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El PIN ha sido creado correctamente.',
        data: {
          id: Number(usuario.id),
          nombre: `${usuario.nombre} ${usuario.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      const querylogger = { idUsuarioActor: idUser };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Error al generar PIN (actor ${idUser}).`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al crear el PIN del usuario.',
      });
    }
  }

  //Creacion de pin operador
  async updateValidador(
    userName: string,
    idUser: number,
    updateUsuarioValidadorDto: UpdateUsuarioValidadorDto,
    rolActor = 0,
    clienteActor = 0,
  ): Promise<ApiCrudResponse> {
    try {
      const usuario = await this.usuarioRepository.findOne({
        where: { userName: updateUsuarioValidadorDto.userName },
      });
      if (!usuario) {
        throw new NotFoundException('Usuario no encontrado.');
      }
      await this.assertAsignacionPinValidador(usuario, rolActor, clienteActor);

      const dispositivo = await this.validadoresRepository.findOne({
        where: { numeroSerie: updateUsuarioValidadorDto.validadorId },
      });
      if (!dispositivo || Number(dispositivo.estatus) !== 1) {
        throw new NotFoundException('Validador no encontrado.');
      }
      if (Number(rolActor) !== 1 && clienteActor) {
        const hijos = await this.clienteHijos(clienteActor);
        const permitidos = hijos?.ids ?? [];
        if (!permitidos.includes(Number(dispositivo.idCliente))) {
          throw new NotFoundException('Validador no encontrado.');
        }
      }

      const usuariosOperadorDevice = await this.usuarioRepository.find({
        where: {
          validadorId: updateUsuarioValidadorDto.validadorId,
        },
      });

      if (usuariosOperadorDevice.length > 0) {
        await Promise.all(
          usuariosOperadorDevice.map((u) =>
            this.usuarioRepository.update(u.id, {
              validadorId: null,
            }),
          ),
        );
      }

      const bodyOperador = {
        validadorId: updateUsuarioValidadorDto.validadorId,
      };

      await this.usuarioRepository.update(usuario.id, bodyOperador);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = {
        idUsuarioObjetivo: Number(usuario.id),
        validadorId: updateUsuarioValidadorDto.validadorId,
      };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `El deviceId ha sido actualizado para el usuario con ID: ${usuario.id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El dispositivo ha sido actualizado correctamente.',
        data: {
          id: Number(usuario.id),
          nombre: `${usuario.nombre} ${usuario.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      const querylogger = { idUsuarioActor: idUser };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Error al actualizar validador (actor ${idUser}).`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar el validador del usuario.',
      });
    }
  }

  //Creacion de un usuario
  /**
   * H-02: nadie otorga un permiso que no tiene. No es una matriz de roles
   * (los roles los define cada cliente): solo impide escalar por permisos.
   * El SA queda exento.
   */
  private async assertPermisosOtorgables(
    permisosIds: number[],
    idActor: number,
    rolActor: number,
  ): Promise<void> {
    if (Number(rolActor) === 1 || !permisosIds.length) return;
    const propios = await this.usuariosPermisosRepository.find({
      where: { idUsuario: idActor, estatus: 1 },
      select: ['idPermiso'],
    });
    const tiene = new Set(propios.map((p) => Number(p.idPermiso)));
    if (permisosIds.some((p) => !tiene.has(Number(p)))) {
      throw new ForbiddenException(
        'No puedes otorgar permisos que tú no tienes.',
      );
    }
  }

  async createUsuario(
    createUsuarioDto: CreateUsuarioDto,
    idUser: string,
    rolActor: number,
    clienteActor: number,
  ): Promise<ApiCrudResponse> {
    try {
      await this.assertPermisosOtorgables(
        (createUsuarioDto.permisosIds ?? []).map(Number),
        Number(idUser),
        rolActor,
      );
      const rolNuevo = Number(createUsuarioDto.idRol);
      if (rolNuevo === 1 && Number(rolActor) !== 1) {
        throw new ForbiddenException('No autorizado.');
      }
      if (!ROLES_CONOCIDOS.includes(rolNuevo)) {
        throw new BadRequestException('Rol no válido.');
      }
      if (Number(rolActor) !== 1) {
        const permitidos = await clientesPermitidos(
          this.clienteRepository.manager,
          clienteActor,
        );
        if (!permitidos.includes(Number(createUsuarioDto.idCliente))) {
          throw new NotFoundException('Cliente no encontrado.');
        }
      }

      const existUsuario = await this.usuarioRepository.findOne({
        //Buscamos si existe usuario
        where: { userName: createUsuarioDto.userName },
      });
      if (existUsuario) {
        throw new BadRequestException('El usuario ya se encuentra registrado.');
      }

      const hashedPassword = await bcrypt.hash(
        createUsuarioDto.passwordHash,
        10,
      ); //encriptamos la contraseña
      createUsuarioDto.passwordHash = hashedPassword;

      const newUser = await this.usuarioRepository.create(createUsuarioDto);

      //Activamos su ingreso
      newUser.emailConfirmado = 1;
      newUser.estatus = 1;

      const userSave = await this.usuarioRepository.save(newUser); //creamos el usuario

      if (createUsuarioDto.permisosIds.length > 0) {
        const usuariosPermisos = createUsuarioDto.permisosIds.map((permisoId) =>
          this.usuariosPermisosRepository.create({
            idUsuario: userSave.id,
            idPermiso: permisoId,
          }),
        );

        await this.usuariosPermisosRepository.save(usuariosPermisos);
      }

      const _payload = {
        id: userSave.id,
        email: userSave.userName,
      };

      //datos del correo
      /*       const token = this.jwtService.sign(payload, {
              expiresIn: `${process.env.JWT_CONFIRMACION}`,
            });
            //Enviar correo de confirmacion
            const name = `${userSave.nombre} ${userSave.apellidoPaterno} ${userSave.apellidoMaterno??''}`;
            await this.emailService.sendConfirmationEmail(
              userSave.userName,
              name,
              token,
            ); */

      //-----Registro en la bitacora----- SUCCESS
      const { passwordHash: _pwdCreate, ...usuarioSinHashBitacora } =
        createUsuarioDto;
      const querylogger = { ...usuarioSinHashBitacora };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se ha creado un usuario con nombre: ${createUsuarioDto.nombre}.`,
        'CREATE',
        querylogger,
        Number(idUser),
        EnumModulos.USUARIOS,
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
      const { passwordHash: _pwdErr, ...usuarioSinHashBitacoraErr } =
        createUsuarioDto;
      const querylogger = { ...usuarioSinHashBitacoraErr };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se ha creado un usuario con nombre: ${createUsuarioDto.nombre}.`,
        'CREATE',
        querylogger,
        Number(idUser),
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al intentar crear el usuario.',
      });
    }
  }

  //Actualizar contraseña
  async updateContrasena(
    id: number,
    idUser: string,
    updateUsuarioContrasena: UpdateUsuarioContrasena,
  ): Promise<ApiCrudResponse> {
    try {
      const usuario = await this.usuarioRepository.findOne({
        where: { id: id },
      });
      if (!usuario) {
        throw new NotFoundException(`No se encontró un usuario con ID: ${id}.`);
      }
      if (
        updateUsuarioContrasena.passwordNueva !==
        updateUsuarioContrasena.passwordNuevaConfirmacion
      ) {
        throw new BadRequestException(
          'La contraseña nueva y su confirmación no coinciden.',
        );
      }
      if (
        !(await bcrypt.compare(
          updateUsuarioContrasena.passwordActual,
          usuario.passwordHash,
        ))
      ) {
        throw new BadRequestException('La contraseña actual no es correcta.');
      }
      const hashedPassword = await bcrypt.hash(
        updateUsuarioContrasena.passwordNueva,
        10,
      );

      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }

      const fechaDesfasada = nowDb();

      const fechaActual = `${fechaDesfasada.getUTCFullYear()}-${pad(fechaDesfasada.getUTCMonth() + 1)}-${pad(fechaDesfasada.getUTCDate())} ${pad(fechaDesfasada.getUTCHours())}:${pad(fechaDesfasada.getUTCMinutes())}:${pad(fechaDesfasada.getUTCSeconds())}`;

      await this.usuarioRepository.update(id, {
        passwordHash: hashedPassword,
        actualizacionPassword: fechaActual,
      });
      await this.authService.bumpTokenVersion(Number(id));

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se ha actualizado la contraseña del usuario con ID: ${id}.`,
        'UPDATE',
        querylogger,
        Number(idUser),
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'La contraseña ha sido actualizada correctamente.',
        data: {
          id: id,
          nombre: `${usuario.nombre} ${usuario.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `SSe ha actualizado la contraseña del usuario con ID: ${id}.`,
        'UPDATE',
        querylogger,
        Number(idUser),
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar la contraseña.',
      });
    }
  }

  //Actualizar usuario
  async updateUsuario(
    id: number,
    updateUsuarioDto: UpdateUsuarioDto,
    idUser: string,
    rolActor?: number,
    clienteActor = 0,
  ): Promise<ApiCrudResponse> {
    try {
      const usuario = await this.usuarioRepository.findOne({
        where: { id: id },
      });
      if (!usuario) {
        throw new NotFoundException(`No se encontró un usuario con ID: ${id}.`);
      }
      if (Number(usuario.idRol) === 1 && Number(rolActor) !== 1) {
        throw new NotFoundException(`No se encontró un usuario con ID: ${id}.`);
      }
      if (Number(rolActor) !== 1) {
        const permitidos = await clientesPermitidos(
          this.clienteRepository.manager,
          clienteActor,
        );
        if (!permitidos.includes(Number(usuario.idCliente))) {
          throw new NotFoundException(
            `No se encontró un usuario con ID: ${id}.`,
          );
        }
      }

      forbidTenantMove(
        usuario.idCliente,
        updateUsuarioDto as any,
        'idCliente',
        'Usuario no encontrado',
      );
      const esPropio = Number(id) === Number(idUser);
      if (esPropio) {
        delete updateUsuarioDto.idRol;
        delete updateUsuarioDto.permisosIds;
      }
      if (
        updateUsuarioDto.idRol !== undefined &&
        Number(updateUsuarioDto.idRol) === 1 &&
        Number(rolActor) !== 1
      ) {
        delete updateUsuarioDto.idRol;
      }
      updateUsuarioDto.emailConfirmado = EstatusEnum.ACTIVO;

      if (Array.isArray(updateUsuarioDto.permisosIds)) {
        // Solo se revisan los permisos que se agregan; los que ya tiene se conservan.
        const actuales = await this.usuariosPermisosRepository.find({
          where: { idUsuario: id, estatus: 1 },
          select: ['idPermiso'],
        });
        const yaTiene = new Set(actuales.map((p) => Number(p.idPermiso)));
        await this.assertPermisosOtorgables(
          updateUsuarioDto.permisosIds.map(Number).filter((p) => !yaTiene.has(p)),
          Number(idUser),
          Number(rolActor),
        );
      }

      const cambiaRol =
        updateUsuarioDto.idRol !== undefined &&
        Number(updateUsuarioDto.idRol) !== Number(usuario.idRol);
      const cambiaEstatus =
        updateUsuarioDto.estatus !== undefined &&
        Number(updateUsuarioDto.estatus) !== Number(usuario.estatus);

      const { permisosIds: _permisosIds, ...usuarioUpdate } = updateUsuarioDto;
      // ----- ACTUALIZACIÓN DE USUARIO -----
      await this.usuarioRepository.update(id, usuarioUpdate);
      if (cambiaRol || cambiaEstatus) {
        // Corta access y refresh vigentes: el nuevo rol o la baja aplican ya.
        await this.authService.bumpTokenVersion(Number(id));
      }
      const newUser = await this.usuarioRepository.findOne({
        where: { id: id },
      });
      if (!newUser) {
        throw new NotFoundException(`No se encontró un usuario con ID: ${id}.`);
      }
      const { passwordHash: _, ...usuarioSinPassword } = newUser;

      // ----- ACTUALIZACIÓN DE PERMISOS -----
      if (
        updateUsuarioDto.permisosIds &&
        Array.isArray(updateUsuarioDto.permisosIds)
      ) {
        const nuevaLista: number[] = updateUsuarioDto.permisosIds.map(Number); // lista nueva de permisos (ej. [1,EnumModulos.USUARIOS,3])

        // Permisos actuales en BD
        const creadaLista = await this.usuariosPermisosRepository.find({
          where: { idUsuario: id },
        });

        const nuevaSet = new Set<number>(nuevaLista);
        const creadaMap = new Map<number, any>(
          creadaLista.map((p) => [Number(p.idPermiso), p] as const),
        );
        // Unimos todos los ids (de la nueva lista y de la creada)
        const todosIds = new Set<number>([
          ...nuevaSet,
          ...creadaLista.map((p) => Number(p.idPermiso)),
        ]);

        for (const permisoId of todosIds) {
          const enNueva = nuevaSet.has(permisoId);
          const creado = creadaMap.get(permisoId);
          if (enNueva && creado) {
            if (creado.estatus === 0) {
              // Caso: existe en ambas y en creada estatus=0 → activar
              await this.usuariosPermisosRepository.update(creado.id, {
                estatus: 1,
              });
            } else {
              // Caso: existe en ambas y ya está activo → no hacer nada
              continue;
            }
          } else if (enNueva && !creado) {
            // Caso: existe en nueva pero no en creada → crear

            const existe = await this.usuariosPermisosRepository.findOne({
              where: { idUsuario: id, idPermiso: permisoId },
            });
            if (!existe) {
              await this.usuariosPermisosRepository.save({
                idUsuario: id,
                idPermiso: permisoId,
                estatus: 1,
              });
            }
          } else if (!enNueva && creado) {
            if (creado.estatus === 1) {
              // Caso: no está en nueva pero sí en creada activo → desactivar
              await this.usuariosPermisosRepository.update(creado.id, {
                estatus: 0,
              });
            } else {
              // Caso: ya estaba inactivo → nada que hacer
              continue;
            }
          } else {
            // Caso: no existe ni en nueva ni en creada → nada que hacer
            continue;
          }
        }
      }

      // ----- Registro en la bitácora ----- SUCCESS
      const querylogger = { updateUsuarioDto };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se actualizó el usuario: ${newUser.nombre} con ID: ${newUser.id}.`,
        'UPDATE',
        querylogger,
        Number(idUser),
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El usuario ha sido actualizado correctamente.',
        data: {
          id: id,
          nombre:
            `${usuarioSinPassword.nombre} ${usuarioSinPassword.apellidoPaterno} ` ||
            '',
        },
      };
      return result;
    } catch (error) {
      // ----- Registro en la bitácora ----- ERROR
      const querylogger = { updateUsuarioDto };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se actualizó el usuario con ID: ${id}.`,
        'UPDATE',
        querylogger,
        Number(idUser),
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar el usuario.',
      });
    }
  }

  //Actualizar Estatus
  async updateUsuarioEstatus(
    id: number,
    updateUsuarioEstatusDto: UpdateUsuarioEstatusDto,
    idUser: number,
    clienteActor = 0,
    rolActor = 1,
  ): Promise<ApiCrudResponse> {
    try {
      const usuario = await this.usuarioRepository.findOne({
        where: { id: id },
      });
      if (!usuario) {
        throw new NotFoundException(`No se encontró un usuario con ID: ${id}.`);
      }
      if (Number(rolActor) !== 1) {
        const permitidos = await clientesPermitidos(
          this.clienteRepository.manager,
          clienteActor,
        );
        if (!permitidos.includes(Number(usuario.idCliente))) {
          throw new NotFoundException(
            `No se encontró un usuario con ID: ${id}.`,
          );
        }
      }
      const { estatus } = updateUsuarioEstatusDto;

      await this.usuarioRepository.update(id, { estatus: estatus });
      const usuarioResult = await this.usuarioRepository.findOne({
        where: { id: id },
      });
      if (!usuarioResult) {
        throw new NotFoundException(`No se encontró un usuario con ID: ${id}.`);
      }
      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateUsuarioEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se cambió el estatus del usuario ${usuarioResult.nombre} con ID: ${id} a estatus: ${estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api Response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El estatus del usuario ha sido actualizado correctamente.',
        estatus: {
          estatus: estatus,
        },
        data: {
          id: id,
          nombre:
            `${usuarioResult.nombre} ${usuarioResult.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateUsuarioEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se cambió el estatus del usuario con ID: ${id} a estatus: ${updateUsuarioEstatusDto.estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'No se pudo actualizar el estatus del usuario.',
      });
    }
  }

  //Eliminamos usuario
  async deleteUsuario(
    id: number,
    idUser: string,
    clienteActor = 0,
    rolActor = 1,
  ): Promise<ApiCrudResponse> {
    try {
      const usuario = await this.usuarioRepository.findOne({
        where: { id: id },
      });
      if (!usuario) {
        throw new NotFoundException(`No se encontró un usuario con ID: ${id}.`);
      }
      if (Number(rolActor) !== 1) {
        const permitidos = await clientesPermitidos(
          this.clienteRepository.manager,
          clienteActor,
        );
        if (!permitidos.includes(Number(usuario.idCliente))) {
          throw new NotFoundException(
            `No se encontró un usuario con ID: ${id}.`,
          );
        }
      }
      //Se hacer eliminado logico
      //Cambiamos el estatus del usuario a 0
      await this.usuarioRepository.update(id, { estatus: 0 });

      //buscamos sus permisos
      const _permisos = await this.usuariosPermisosRepository.find({
        where: { idUsuario: id },
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se eliminó el usuario con ID: ${id}.`,
        'UPDATE',
        querylogger,
        Number(idUser),
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.SUCCESS,
      );
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El usuario ha sido eliminado correctamente.',
        data: {
          id: id,
          nombre: `${usuario.nombre} ${usuario.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se eliminó el usuario con ID: ${id}.`,
        'UPDATE',
        querylogger,
        Number(idUser),
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Hubo un problema al intentar eliminar el usuario.',
      });
    }
  }

  async uploadFotoPerfil(
    file: Express.Multer.File,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      // Validar que el archivo existe
      if (!file) {
        throw new BadRequestException('Archivo requerido');
      }

      // Validar que solo sean imágenes
      const allowedMimeTypes = ['image/png', 'image/jpg', 'image/jpeg'];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          'Solo se permiten imágenes PNG, JPG o JPEG',
        );
      }

      // Buscar el usuario por el ID del token
      const usuario = await this.usuarioRepository.findOne({
        where: { id: idUser },
      });

      if (!usuario) {
        throw new NotFoundException('Usuario no encontrado');
      }

      // Si el usuario ya tiene una foto, eliminar la anterior de S3
      if (usuario.fotoPerfil) {
        try {
          await this.s3Service.deleteFile(
            usuario.fotoPerfil,
            idUser,
            EnumModulos.USUARIOS,
          );
        } catch {
          // No fallar si no se puede eliminar la foto anterior
          this.logger.warn('Error al eliminar foto anterior');
        }
      }

      // Subir la nueva foto a S3 en la carpeta "Usuarios"
      const uploadResult = await this.s3Service.uploadFile(
        file,
        'Usuarios',
        idUser,
        EnumModulos.USUARIOS,
        Number(usuario.idCliente) || 0,
      );

      // Actualizar el campo fotoPerfil en la base de datos
      await this.usuarioRepository.update(idUser, {
        fotoPerfil: uploadResult.url,
      });

      // Obtener el usuario actualizado
      const usuarioActualizado = await this.usuarioRepository.findOne({
        where: { id: idUser },
      });

      if (!usuarioActualizado) {
        throw new NotFoundException(
          'Usuario no encontrado después de la actualización',
        );
      }

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = {
        data: 'UPDATE Usuarios SET FotoPerfil = ? WHERE Id = ?',
      };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Se actualizó la foto de perfil del usuario con ID: ${idUser}`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.SUCCESS,
      );

      return {
        status: 'success',
        message: 'Foto de perfil actualizada exitosamente',
        data: {
          id: usuarioActualizado.id,
          nombre:
            `${usuarioActualizado.nombre || ''} ${usuarioActualizado.apellidoPaterno || ''}`.trim() ||
            'Usuario',
        },
      };
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = {
        data: `UPDATE Usuarios SET FotoPerfil = ? WHERE Id = ${idUser}`,
      };
      await this.bitacoraLogger.logToBitacora(
        'Usuarios',
        `Error al actualizar la foto de perfil del usuario con ID: ${idUser}`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.USUARIOS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Hubo un problema al intentar subir la foto de perfil.',
      });
    }
  }
}
