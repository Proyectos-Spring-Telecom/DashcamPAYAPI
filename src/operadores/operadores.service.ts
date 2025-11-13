import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { CreateOperadoreDto } from "./dto/create-operadore.dto";
import { UpdateOperadoreDto } from "./dto/update-operadore.dto";
import { UpdateOperadorStatusDto } from "./dto/update-operadores-estatus.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Operadores } from "src/entities/Operadores";
import { BitacoraLoggerService } from "src/bitacora/bitacora.service";
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from "src/common/ApiResponse";
import { Clientes } from "src/entities/Clientes";

@Injectable()
export class OperadoresService {
  constructor(
    @InjectRepository(Operadores)
    private readonly operadoresRepository: Repository<Operadores>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService
  ) {}
  //Crear operador
  async createOperador(
    createOperadoreDto: CreateOperadoreDto,
    idUser: number
  ): Promise<ApiCrudResponse> {
    try {
      const operadorExistente = await this.operadoresRepository.findOne({
        where: { numeroLicencia: createOperadoreDto.numeroLicencia },
      });
      if (operadorExistente) {
        throw new BadRequestException(
          `Operador con licencia: ${createOperadoreDto.numeroLicencia} esta registrado`
        );
      }

      //creamos al operador
      const newOperador =
        await this.operadoresRepository.create(createOperadoreDto);
      const operador = await this.operadoresRepository.save(newOperador);

      const operadorData = await this.operadoresRepository.findOne({
        where: { id: operador.id },
      });

      //-----Registro en la bitacora-----SUCCESS
      const querylogger = { createOperadoreDto };
      await this.bitacoraLogger.logToBitacora(
        "Operadores",
        `El operador fue creado correctamente con el número de licencia: ${createOperadoreDto.numeroLicencia}.`,
        "CREATE",
        querylogger,
        Number(idUser),
        9,
        EstatusEnumBitcora.SUCCESS
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "El operador ha sido creado correctamente.",
        data: {
          id: Number(operador.id),
          nombre:
            `ID de usuario: ${operador.idUsuario} | Número de licencia: ${operador.numeroLicencia}` ||
            "",
        },
      };
      return result;
    } catch (error) {
      console.log(error)
      //-----Registro en la bitacora-----SUCCESS
      const querylogger = { createOperadoreDto };
      await this.bitacoraLogger.logToBitacora(
        "Operadores",
        `El operador fue creado correctamente con el número de licencia: ${createOperadoreDto.numeroLicencia}.`,
        "CREATE",
        querylogger,
        Number(idUser),
        9,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Ocurrió un error al crear el operador.`,
        error: error.message,
      });
    }
  }

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    const clientesFiltrado = await this.clienteRepository.query(
      `CALL spGetClientes(?);`,
      [cliente],
    );

    const idsFiltrados = clientesFiltrado[0]; // El primer índice contiene los resultados
    const ids = idsFiltrados
      .map((clientesFiltrado: any) => Number(clientesFiltrado.Id))
      .filter(Boolean);
    if (ids.length === 0) {
      return { data: [] }; // No hay clientes que consultar
    }

    // 3. Construir el query dinámico con los IDs
    const placeholders = ids.map(() => '?').join(', ');
    return { ids, placeholders };
  }

  //Obtener todos los operadores
  async findAllOperadores(
    cliente: number,
    rol: number,
    page: number,
    limit: number
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      let operadores;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          operadores = await this.operadoresRepository.query(
            `
SELECT
  -- Datos del Operador
  o.Id AS id,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimiento,
  o.Identificacion AS identificacion,
  o.Licencia AS licencia,
  o.ComprobanteDomicilio AS comprobanteDomicilio,
  o.AntecedentesNoPenales AS antecedentesNoPenales,
  o.FechaCreacion AS fechaCreacion,
  o.FechaActualizacion AS fechaActualizacion,
  o.Estatus AS estatus,

  -- Datos del Usuario
  u.Id AS idUsuario,
  u.UserName AS userNameUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.Telefono AS telefonoUsuario,
  u.ValidadorId AS validadorIdId,
  u.FotoPerfil AS fotoPerfil,
  u.FechaCreacion AS fechaCreacionUsuario,
  u.FechaActualizacion AS fechaActualizacion,
  u.Estatus AS estatusUsuario,
  u.IdRol AS idRol,

  -- Datos del Cliente
  u.IdCliente AS idCliente

FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
WHERE u.Estatus = 1
ORDER BY o.Id DESC
LIMIT ? OFFSET ?;
        `,
            [limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.operadoresRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
WHERE u.Estatus = 1
  `
          );
          break;

        default:
          // Consulta de datos paginados resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente)
          operadores = await this.operadoresRepository.query(
            `
SELECT
  -- Datos del Operador
  o.Id AS id,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimiento,
  o.Identificacion AS identificacion,
  o.Licencia AS licencia,
  o.ComprobanteDomicilio AS comprobanteDomicilio,
  o.AntecedentesNoPenales AS antecedentesNoPenales,
  o.FechaCreacion AS fechaCreacion,
  o.FechaActualizacion AS fechaActualizacion,
  o.Estatus AS estatus,

  -- Datos del Usuario
  u.Id AS idUsuario,
  u.UserName AS userNameUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.Telefono AS telefonoUsuario,
  u.ValidadorId AS ValidadorId,
  u.FotoPerfil AS fotoPerfil,
  u.FechaCreacion AS fechaCreacionUsuario,
  u.FechaActualizacion AS fechaActualizacion,
  u.Estatus AS estatusUsuario,
  u.IdRol AS idRol,

  -- Datos del Cliente
  u.IdCliente AS idCliente

FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND u.Estatus = 1
ORDER BY o.Id DESC
LIMIT ? OFFSET ?;
        `,
            [...ids, limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.operadoresRepository.query(
            `
   SELECT COUNT(*) AS total
  FROM Operadores o
  INNER JOIN Usuarios u ON o.IdUsuario = u.Id
	WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND u.Estatus = 1
  `,
            [...ids],
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);
      //Forzamos a cambiar el id a number
      const data = operadores.map((item) => ({
        ...item,
        id: Number(item.id),
        idUsuario: Number(item.idUsuario),
        idRol: Number(item.idRol),
        idCliente: Number(item.idCliente),
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
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al obtener la paginación de los operadores.",
        error: error.message,
      });
    }
  }

  //Obtener todos los operadores
  async findAllListOperadores(
    cliente: number,
    rol: number
  ): Promise<ApiResponseCommon> {
    try {
      let operadores;
      switch (rol) {
        case 1:
          operadores = await this.operadoresRepository.query(
            `
SELECT
  -- Datos del Operador
  o.Id AS id,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimiento,
  o.Identificacion AS identificacion,
  o.Licencia AS licencia,
  o.ComprobanteDomicilio AS comprobanteDomicilio,
  o.AntecedentesNoPenales AS antecedentesNoPenales,
  o.FechaCreacion AS fechaCreacion,
  o.FechaActualizacion AS fechaActualizacion,
  o.Estatus AS estatus,

  -- Datos del Usuario
  u.Id AS idUsuario,
  u.UserName AS userNameUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.Telefono AS telefonoUsuario,
  u.ValidadorId AS ValidadorId,
  u.FotoPerfil AS fotoPerfil,
  u.FechaCreacion AS fechaCreacionUsuario,
  u.FechaActualizacion AS fechaActualizacion,
  u.Estatus AS estatusUsuario,
  u.IdRol AS idRol,

  -- Datos del Cliente
  u.IdCliente AS idCliente

FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
WHERE o.Estatus = 1
AND u.Estatus = 1
ORDER BY o.Id DESC;
        `
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(cliente)
          operadores = await this.operadoresRepository.query(
            `
SELECT
  -- Datos del Operador
  o.Id AS id,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimiento,
  o.Identificacion AS identificacion,
  o.Licencia AS licencia,
  o.ComprobanteDomicilio AS comprobanteDomicilio,
  o.AntecedentesNoPenales AS antecedentesNoPenales,
  o.FechaCreacion AS fechaCreacion,
  o.FechaActualizacion AS fechaActualizacion,
  o.Estatus AS estatus,

  -- Datos del Usuario
  u.Id AS idUsuario,
  u.UserName AS userNameUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.Telefono AS telefonoUsuario,
  u.ValidadorId AS ValidadorId,
  u.FotoPerfil AS fotoPerfil,
  u.FechaCreacion AS fechaCreacionUsuario,
  u.FechaActualizacion AS fechaActualizacion,
  u.Estatus AS estatusUsuario,
  u.IdRol AS idRol,

  -- Datos del Cliente
  u.IdCliente AS idCliente

FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND o.Estatus = 1
AND u.Estatus = 1
ORDER BY o.Id DESC;
        `,
            [...ids]
          );
          break;
      }

      //Forzamos a cambiar el id a number
      const data = operadores.map((item) => ({
        ...item,
        id: Number(item.id),
        idUsuario: Number(item.idUsuario),
        idRol: Number(item.idRol),
        idCliente: Number(item.idCliente),
      }));

      const result: ApiResponseCommon = {
        data: data,
      };
      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al obtener el listado de los operadores.",
        error: error.message,
      });
    }
  }

  //Obtener operador por ID
  async findOneOperador(id: number, cliente: number, rol: number) {
    try {
      let operador;
      switch (rol) {
        case 1:
          // Consulta de datos paginados resto Usuario
          operador = await this.operadoresRepository.query(
            `
SELECT
  -- Datos del Operador
  o.Id AS id,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimiento,
  o.Identificacion AS identificacion,
  o.Licencia AS licencia,
  o.ComprobanteDomicilio AS comprobanteDomicilio,
  o.AntecedentesNoPenales AS antecedentesNoPenales,
  o.FechaCreacion AS fechaCreacion,
  o.FechaActualizacion AS fechaActualizacion,
  o.Estatus AS estatus,

  -- Datos del Usuario
  u.Id AS idUsuario,
  u.UserName AS userNameUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.Telefono AS telefonoUsuario,
  u.ValidadorId AS ValidadorId,
  u.FotoPerfil AS fotoPerfil,
  u.FechaCreacion AS fechaCreacionUsuario,
  u.FechaActualizacion AS fechaActualizacion,
  u.Estatus AS estatusUsuario,
  u.IdRol AS idRol,

  -- Datos del Cliente
  u.IdCliente AS idCliente

FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
WHERE o.Id = ?
ORDER BY o.Id DESC;
        `,
            [id]
          );
          break;

        default:
          // Consulta de datos paginados resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente)
          operador = await this.operadoresRepository.query(
            `
SELECT
  -- Datos del Operador
  o.Id AS id,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimiento,
  o.Identificacion AS identificacion,
  o.Licencia AS licencia,
  o.ComprobanteDomicilio AS comprobanteDomicilio,
  o.AntecedentesNoPenales AS antecedentesNoPenales,
  o.FechaCreacion AS fechaCreacion,
  o.FechaActualizacion AS fechaActualizacion,
  o.Estatus AS estatus,

  -- Datos del Usuario
  u.Id AS idUsuario,
  u.UserName AS userNameUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.Telefono AS telefonoUsuario,
  u.ValidadorId AS ValidadorId,
  u.FotoPerfil AS fotoPerfil,
  u.FechaCreacion AS fechaCreacionUsuario,
  u.FechaActualizacion AS fechaActualizacion,
  u.Estatus AS estatusUsuario,
  u.IdRol AS idRol,

  -- Datos del Cliente
  u.IdCliente AS idCliente

FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND o.Id = ?
ORDER BY o.Id DESC;
        `,
            [...ids, id]
          );
          break;
      }
      if (operador.length == 0) {
        throw new NotFoundException(`Operador con ID ${id} no encontrado.`);
      }

      //Forzamos a cambiar el id a number
      const data = operador.map((item) => ({
        ...item,
        id: Number(item.id),
        idUsuario: Number(item.idUsuario),
        idRol: Number(item.idRol),
        idCliente: Number(item.idCliente),
      }));

      return {
        data: data,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al obtener operador.",
        error: error.message,
      });
    }
  }

  //Actualizar el estatus del operador
  async updateOperadorEstatus(
    id: number,
    idUser: number,
    updateOperadorStatusDto: UpdateOperadorStatusDto
  ): Promise<ApiCrudResponse> {
    try {
      const operador = await this.operadoresRepository.findOne({
        where: { id: id },
      });
      if (!operador) {
        throw new NotFoundException(
          `Operador id: ${id} con rol no encontrado.`
        );
      }
      const { estatus } = updateOperadorStatusDto;
      await this.operadoresRepository.update(id, { estatus: estatus });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateOperadorStatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Operadores",
        `Se cambió el estatus a: ${estatus} del operador con ID: ${id}.`,
        "UPDATE",
        querylogger,
        idUser,
        9,
        EstatusEnumBitcora.SUCCESS
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: "success",
        message: "Estatus del operador actualizado correctamente.",
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre:
            `ID usuario: ${operador.idUsuario} con número de licencia: ${operador.numeroLicencia}.` ||
            "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateOperadorStatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Operadores",
        `Se cambió el estatus a: ${updateOperadorStatusDto.estatus} del operador con ID: ${id}.`,
        "UPDATE",
        querylogger,
        idUser,
        9,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: " Error al actualizar el estatus al operador.",
        error: error.message,
      });
    }
  }
  
  //Actualizar datos del operador
  async updateOperador(
    id: number,
    idUser: number,
    updateOperadoreDto: UpdateOperadoreDto
  ) {
    try {
      const operador = await this.operadoresRepository.findOne({
        where: { id: id },
      });
      if (!operador) {
        throw new NotFoundException(`Operador con id: ${id} no encontrado`);
      }
      const operadorData =
        await this.operadoresRepository.create(updateOperadoreDto);
      await this.operadoresRepository.update(id, operadorData);

      //-----Registro en la bitacora-----SUCCESS
      const querylogger = { updateOperadoreDto };
      await this.bitacoraLogger.logToBitacora(
        "Operadores",
        `Se actualizó el Operador con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        9,
        EstatusEnumBitcora.SUCCESS
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: "success",
        message: "Operador actualizado correctamente",
        data: {
          id: id,
          nombre:
            `id usuario:${operador.idUsuario} con numero de licencia:${operador.numeroLicencia} ` ||
            "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora-----ERROR
      const querylogger = { updateOperadoreDto };
      await this.bitacoraLogger.logToBitacora(
        "Operadores",
        `Se actualizó el Operador con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        9,
        EstatusEnumBitcora.ERROR,
        error.message
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar al operador.",
        error: error.message,
      });
    }
  }

  //Eliminar Operador
  async removeOperador(id: number, idUser: number) {
    try {
      const operador = await this.operadoresRepository.findOne({
        where: { id: id },
      });
      if (!operador) {
        throw new NotFoundException(`Operador con id: ${id} no encontrado`);
      }
      await this.operadoresRepository.update(id, { estatus: 0 });

      //-----Registro en la bitacora-----SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Operadores",
        `Se eliminó el operador con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        9,
        EstatusEnumBitcora.SUCCESS
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: "success",
        message: "Operador eliminado correctamente",
        data: {
          id: id,
          nombre:
            `id usuario:${operador.idUsuario} con numero de licencia:${operador.numeroLicencia} ` ||
            "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora-----SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Operadores",
        `Se eliminó el operador con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        9,
        EstatusEnumBitcora.ERROR,
        error.message
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al eliminar al operador",
        error: error.message,
      });
    }
  }
}
