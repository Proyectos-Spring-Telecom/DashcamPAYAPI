//Servicio usuario
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Usuarios } from "src/entities/Usuarios";
import { CreateUsuarioDto } from "./dto/create-usuario.dto";
import { UpdateUsuarioDto } from "./dto/update-usuario.dto";
import { UpdateUsuarioEstatusDto } from "./dto/update-usuario-estatus.dto";
import * as bcrypt from "bcrypt";
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from "src/common/ApiResponse";
import { BitacoraLoggerService } from "src/bitacora/bitacora.service";
import { ClientesService } from "src/clientes/clientes.service";
import { UsuariosPermisos } from "src/entities/UsuariosPermisos";
import { UpdateUsuarioOperadorDto } from "./dto/update-usuario-operador.dto";
import { UpdateUsuarioContrasena } from "./dto/update-usuario-contrasena.dto";
import { MailService } from "src/mail/mail.service";
import { JwtService } from "@nestjs/jwt";
import { Clientes } from "src/entities/Clientes";
import { EstatusEnum } from "src/common/estado-componente.enum";

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuarios)
    private readonly usuarioRepository: Repository<Usuarios>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly clientesService: ClientesService,
    @InjectRepository(UsuariosPermisos)
    private usuariosPermisosRepository: Repository<UsuariosPermisos>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly emailService: MailService,
    private readonly jwtService: JwtService
  ) {}

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    const clientesFiltrado = await this.clienteRepository.query(
      `CALL spGetClientes(?);`,
      [cliente]
    );

    const idsFiltrados = clientesFiltrado[0]; // El primer índice contiene los resultados
    const ids = idsFiltrados
      .map((clientesFiltrado: any) => Number(clientesFiltrado.Id))
      .filter(Boolean);
    if (ids.length === 0) {
      return { data: [] }; // No hay clientes que consultar
    }

    // 3. Construir el query dinámico con los IDs
    const placeholders = ids.map(() => "?").join(", ");
    return { ids, placeholders };
  }

  // Obtener todos los usuarios con paginación
  async getAllUsuario(
    cliente: number,
    rol: number,
    page: number,
    limit: number
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
            [limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.usuarioRepository.query(
            `
  SELECT COUNT(*) AS total
  FROM Usuarios u
  INNER JOIN Clientes c ON u.IdCliente = c.Id

  `
          );
          break;

        default:
          // Consulta de datos paginados resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
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
ORDER BY u.Id DESC
LIMIT ? OFFSET ?;
        `,
            [...ids, limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.usuarioRepository.query(
            `
  SELECT COUNT(*) AS total
  FROM Usuarios u
  INNER JOIN Clientes c ON u.IdCliente = c.Id
	WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  `,
            [...ids]
          );
          break;
      }

      if (usuarios.length === 0) {
        throw new NotFoundException(`No se encontraron usuarios.`);
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
        message: "Ocurrió un error al obtener la paginación de usuarios.",
        error: error.message,
      });
    }
  }

  //Obtener todos los usuarios
  async getAllListUsuarios(
    cliente: number,
    rol: number
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
        `
          );
          break;

        default:
          // Consulta de datos listado resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
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
            [...ids]
          );

          break;
      }

      if (usuarios.length === 0) {
        throw new NotFoundException("Usuarios no encontrados");
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
        message: "Ocurrió un error al obtener el listado de usuarios.",
        error: error.message,
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
            [id]
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
        message: "Ocurrió un error al obtener los usuarios por roles.",
        error: error.message,
      });
    }
  }

  //Obtener usuarios por cliente
  async getAllListUsuariosCliente(
    id: number,
    cliente: number
  ): Promise<ApiResponseCommon> {
    try {
      const usuarios = await this.usuarioRepository.find({
        where: { estatus: 1, idCliente: cliente },
      });
      if (usuarios.length === 0) {
        throw new NotFoundException("No se encontraron usuarios.");
      }
      const usuariosSinPassword = usuarios.map(
        ({ passwordHash, ...rest }) => rest
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
          "Se produjo un error al intentar obtener los usuarios asociados al cliente.",
        error: error.message,
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
  u.ValidadorId AS ValidadorId,
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
            [id]
          );
          break;

        default:
          // Consulta de datos paginados resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
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
  u.ValidadorId AS ValidadorId,
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
ORDER BY u.Id DESC
        `,
            [id, ...ids]
          );
          break;
      }

      if (usuarioData.length === 0) {
        throw new NotFoundException("Usuario no encontrado.");
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
        message: "Ocurrió un error al obtener al usuario.",
        error: error.message,
      });
    }
  }

  //Creacion de codigo operador
  async createCodigo(
    userName: string,
    idUser: number,
    updateUsuarioOperadorDto: UpdateUsuarioOperadorDto
  ): Promise<ApiCrudResponse> {
    try {
      //Buscamos al usuario
      const usuario = await this.usuarioRepository.findOne({
        where: { userName: userName, id: idUser },
      });
      if (!usuario) {
        throw new NotFoundException(
          `Usuario con nombre de usuario: ${userName} no encontrado.`
        );
      }

      if (updateUsuarioOperadorDto.userName !== usuario.userName)
        throw new BadRequestException(
          "El usuario está intentando ingresar con datos pertenecientes a otro usuario."
        );

      //encriptamos la contraseña
      const codigoPassword = await bcrypt.hash(
        updateUsuarioOperadorDto.codigoHash,
        10
      );
      updateUsuarioOperadorDto.codigoHash = codigoPassword;

      //Agregamos le fecha de la actualizacion
      function pad(n: number) {
        return n < 10 ? "0" + n : n;
      }

      const ahora = new Date();
      const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas en milisegundos
      const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);

      const fechaActual = `${fechaDesfasada.getFullYear()}-${pad(fechaDesfasada.getMonth() + 1)}-${pad(fechaDesfasada.getDate())} ${pad(fechaDesfasada.getHours())}:${pad(fechaDesfasada.getMinutes())}:${pad(fechaDesfasada.getSeconds())}`;
      console.log(fechaActual);
      updateUsuarioOperadorDto.actualizacionCodigo = fechaActual;

      //Agregamos el codigo al updateUsuarioOperadorDto
      const newcodigo = await this.usuarioRepository.update(
        usuario.id,
        updateUsuarioOperadorDto
      );

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateUsuarioOperadorDto };
      await this.bitacoraLogger.logToBitacora(
        "Usuarios",
        `Se creó el codigo para el usuario con ID: ${usuario.id}.`,
        "UPDATE",
        querylogger,
        idUser,
        2,
        EstatusEnumBitcora.SUCCESS
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "codigo creado correctamente",
        data: {
          id: Number(usuario.id),
          nombre: `${usuario.nombre} ${usuario.apellidoPaterno} ` || "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateUsuarioOperadorDto };
      await this.bitacoraLogger.logToBitacora(
        "Usuarios",
        `Se creó el codigo para el usuario con ID: ${idUser}.`,
        "UPDATE",
        querylogger,
        idUser,
        2,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al crear el codigo del usuario.",
        error: error.message,
      });
    }
  }

  //Creacion de un usuario
  async createUsuario(
    createUsuarioDto: CreateUsuarioDto,
    idUser: string
  ): Promise<ApiCrudResponse> {
    try {
      const existUsuario = await this.usuarioRepository.findOne({
        //Buscamos si existe usuario
        where: { userName: createUsuarioDto.userName },
      });
      if (existUsuario) {
        throw new BadRequestException("El usuario ya existe");
      }

      const hashedPassword = await bcrypt.hash(
        createUsuarioDto.passwordHash,
        10
      ); //encriptamos la contraseña
      createUsuarioDto.passwordHash = hashedPassword;
      createUsuarioDto.emailConfirmado = 1

      const newUser = await this.usuarioRepository.create(createUsuarioDto);

      const userSave = await this.usuarioRepository.save(newUser); //creamos el usuario

      if (createUsuarioDto.permisosIds.length > 0) {
        const usuariosPermisos = createUsuarioDto.permisosIds.map((permisoId) =>
          this.usuariosPermisosRepository.create({
            idUsuario: userSave.id,
            idPermiso: permisoId,
          })
        );

        await this.usuariosPermisosRepository.save(usuariosPermisos);
      }

      const payload = {
        id: userSave.id,
        email: userSave.userName,
      };

      //datos del correo
      const token = this.jwtService.sign(payload, {
        expiresIn: `${process.env.JWT_CONFIRMACION}`,
      } as any);
      const name = `${userSave.nombre} ${userSave.apellidoPaterno} ${userSave.apellidoMaterno}`;
      //await this.emailService.sendConfirmationEmail(userSave.userName, name,token);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createUsuarioDto };
      await this.bitacoraLogger.logToBitacora(
        "Usuarios",
        `Se creó un usuarios con nombre: ${createUsuarioDto.nombre}`,
        "CREATE",
        querylogger,
        Number(idUser),
        2,
        EstatusEnumBitcora.SUCCESS
      );

      const { passwordHash: _, ...usuarioSinPassword } = newUser;

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Usuario creado correctamente",
        data: {
          id: Number(usuarioSinPassword.id),
          nombre:
            `${usuarioSinPassword.nombre} ${usuarioSinPassword.apellidoPaterno} ` ||
            "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createUsuarioDto };
      await this.bitacoraLogger.logToBitacora(
        "Usuarios",
        `Se creó un usuarios con nombre: ${createUsuarioDto.nombre}`,
        "CREATE",
        querylogger,
        Number(idUser),
        2,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Ocurrió un error al intentar crear el usuario.",
        error: error.message,
      });
    }
  }

  //Actualizar contraseña
  async updateContrasena(
    id: number,
    idUser: string,
    updateUsuarioContrasena: UpdateUsuarioContrasena
  ) {
    try {
      const usuario = await this.usuarioRepository.findOne({
        where: { id: id },
      });
      if (!usuario) {
        throw new NotFoundException(`Usuario con ID: ${id} no encontrado.`);
      }
      if (
        updateUsuarioContrasena.passwordNueva ===
        updateUsuarioContrasena.passwordNuevaConfirmacion
      ) {
        if (
          !usuario ||
          !(await bcrypt.compare(
            updateUsuarioContrasena.passwordActual,
            usuario.passwordHash
          ))
        ) {
          console.log({
            user: usuario,
            message: "Entré a verificar los valores y no son iguales.",
          });
          throw new BadRequestException("Credenciales inválidas.");
        }
        const hashedPassword = await bcrypt.hash(
          updateUsuarioContrasena.passwordNueva,
          10
        ); //encriptamos la contraseña
        updateUsuarioContrasena.passwordNueva = hashedPassword;
      }
      //Agregamos le fecha de la actualizacion
      function pad(n: number) {
        return n < 10 ? "0" + n : n;
      }

      const ahora = new Date();
      const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas en milisegundos
      const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);

      const fechaActual = `${fechaDesfasada.getFullYear()}-${pad(fechaDesfasada.getMonth() + 1)}-${pad(fechaDesfasada.getDate())} ${pad(fechaDesfasada.getHours())}:${pad(fechaDesfasada.getMinutes())}:${pad(fechaDesfasada.getSeconds())}`;
      console.log(fechaActual);

      //actualiza en usuario contraseña
      await this.usuarioRepository.update(id, {
        passwordHash: updateUsuarioContrasena.passwordNueva,
      });

      await this.usuarioRepository.update(id, {
        actualizacionPassword: fechaActual,
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id };
      await this.bitacoraLogger.logToBitacora(
        "Usuarios",
        `Se actualizó contraseña un usuario con ID: ${id}.`,
        "UPDATE",
        querylogger,
        Number(idUser),
        2,
        EstatusEnumBitcora.SUCCESS
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Contraseña actualizada correctamente",
        data: {
          id: id,
          nombre: `${usuario.nombre} ${usuario.apellidoPaterno} ` || "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id };
      await this.bitacoraLogger.logToBitacora(
        "Usuarios",
        `Se actualizó contraseña un usuario con ID: ${id}.`,
        "UPDATE",
        querylogger,
        Number(idUser),
        2,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar la contraseña.",
        error: error.message,
      });
    }
  }

  //Actualizar usuario
  async updateUsuario(
    id: number,
    updateUsuarioDto: UpdateUsuarioDto,
    idUser: string
  ): Promise<ApiCrudResponse> {
    try {
      const usuario = await this.usuarioRepository.findOne({
        where: { id: id },
      });
      if (!usuario) {
        throw new NotFoundException(`Usuario con ID:${id} no encontrado`);
      }

      if (updateUsuarioDto.idCliente) {
        const cliente = await this.clientesService.getOneCliente(
          Number(updateUsuarioDto.idCliente)
        );
        if (!cliente) throw new BadRequestException("Cliente Invalido");
      }
      updateUsuarioDto.emailConfirmado = EstatusEnum.ACTIVO
      const { permisosIds, ...usuarioUpdate } = updateUsuarioDto;
      // ----- ACTUALIZACIÓN DE USUARIO -----
      await this.usuarioRepository.update(id, usuarioUpdate);
      const newUser = await this.usuarioRepository.findOne({
        where: { id: id },
      });
      if (!newUser) {
        throw new NotFoundException(`Usuario con ID:${id} no encontrado`);
      }
      const { passwordHash: _, ...usuarioSinPassword } = newUser;

      // ----- ACTUALIZACIÓN DE PERMISOS -----
      if (
        updateUsuarioDto.permisosIds &&
        Array.isArray(updateUsuarioDto.permisosIds)
      ) {
        const nuevaLista: number[] = updateUsuarioDto.permisosIds.map(Number); // lista nueva de permisos (ej. [1,2,3])

        // Permisos actuales en BD
        const creadaLista = await this.usuariosPermisosRepository.find({
          where: { idUsuario: id },
        });

        const nuevaSet = new Set<number>(nuevaLista);
        const creadaMap = new Map<number, any>(
          creadaLista.map((p) => [Number(p.idPermiso), p] as const)
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
        "Usuarios",
        `Se actualizó el usuario: ${newUser.nombre} con ID: ${newUser.id}.`,
        "UPDATE",
        querylogger,
        Number(idUser),
        2,
        EstatusEnumBitcora.SUCCESS
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: "success",
        message: "Usuario actualizado correctamente",
        data: {
          id: id,
          nombre:
            `${usuarioSinPassword.nombre} ${usuarioSinPassword.apellidoPaterno} ` ||
            "",
        },
      };
      return result;
    } catch (error) {
      // ----- Registro en la bitácora ----- ERROR
      const querylogger = { updateUsuarioDto };
      await this.bitacoraLogger.logToBitacora(
        "Usuarios",
        `Se actualizó el usuario con ID: ${id}.`,
        "UPDATE",
        querylogger,
        Number(idUser),
        2,
        EstatusEnumBitcora.ERROR,
        error.message
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar el usuario.",
        error: error.message,
      });
    }
  }

  //Actualizar Estatus
  async updateUsuarioEstatus(
    id: number,
    updateUsuarioEstatusDto: UpdateUsuarioEstatusDto,
    idUser: number
  ): Promise<ApiCrudResponse> {
    try {
      const usuario = await this.usuarioRepository.findOne({
        where: { id: id },
      });
      if (!usuario) {
        throw new NotFoundException(`Usuario con ID:${id} no encontrado`);
      }
      const { estatus } = updateUsuarioEstatusDto;

      await this.usuarioRepository.update(id, { estatus: estatus });
      const usuarioResult = await this.usuarioRepository.findOne({
        where: { id: id },
      });
      if (!usuarioResult) {
        throw new NotFoundException(`Usuario con ID:${id} no encontrado`);
      }
      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateUsuarioEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Usuarios",
        `Se cambió el estatus del usuario ${usuarioResult.nombre} con ID: ${id} a estatus: ${estatus}.`,
        "UPDATE",
        querylogger,
        idUser,
        2,
        EstatusEnumBitcora.SUCCESS
      );

      //Api Response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Estatus usuario actualizado correctamente",
        estatus: {
          estatus: estatus,
        },
        data: {
          id: id,
          nombre:
            `${usuarioResult.nombre} ${usuarioResult.apellidoPaterno} ` || "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateUsuarioEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Usuarios",
        `Se cambió el estatus del usuario con ID: ${id} a estatus: ${updateUsuarioEstatusDto.estatus}.`,
        "UPDATE",
        querylogger,
        idUser,
        2,
        EstatusEnumBitcora.ERROR,
        error.message
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "No se pudo actualizar el estatus del usuario.",
        error: error.message,
      });
    }
  }

  //Eliminamos usuario
  async deleteUsuario(id: number, idUser: string): Promise<ApiCrudResponse> {
    try {
      const usuario = await this.usuarioRepository.findOne({
        where: { id: id },
      });
      if (!usuario) {
        throw new NotFoundException(`No se encontró el usuario con ID: ${id}.`);
      }
      //Se hacer eliminado logico
      //Cambiamos el estatus del usuario a 0
      await this.usuarioRepository.update(id, { estatus: 0 });

      //buscamos sus permisos
      const permisos = await this.usuariosPermisosRepository.find({
        where: { idUsuario: id },
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Usuarios",
        `Se eliminó el usuario con ID: ${id}.`,
        "UPDATE",
        querylogger,
        Number(idUser),
        2,
        EstatusEnumBitcora.SUCCESS
      );
      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Usuario eliminado correctamente",
        data: {
          id: id,
          nombre: `${usuario.nombre} ${usuario.apellidoPaterno} ` || "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Usuarios",
        `Se eliminó el usuario con ID: ${id}.`,
        "UPDATE",
        querylogger,
        Number(idUser),
        2,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Hubo un problema al intentar eliminar el usuario.",
        error: error.message,
      });
    }
  }
}
