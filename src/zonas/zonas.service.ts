import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { CreateZonasDto } from "./dto/create-zonas.dto";
import { UpdateZonasDto } from "./dto/update-zonas.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Zonas } from "src/entities/Zonas";
import { Repository } from "typeorm";
import { BitacoraLoggerService } from "src/bitacora/bitacora.service";
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from "src/common/ApiResponse";
import { UsuariosZonas } from "src/entities/UsuariosZonas";
import { UpdateZonasEstatusDto } from "./dto/update-zonas-estatus.dto";
import { Clientes } from "src/entities/Clientes";

@Injectable()
export class ZonasService {
  constructor(
    @InjectRepository(Zonas)
    private readonly ZonasRepository: Repository<Zonas>,
    @InjectRepository(UsuariosZonas)
    private readonly usuarioZonasRepository: Repository<UsuariosZonas>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService
  ) {}

  async create(
    idUser: number,
    cliente: number,
    rol: number,
    createZonasDto: CreateZonasDto
  ): Promise<ApiCrudResponse> {
    try {
      let rootPermisos;
      createZonasDto.nombre = createZonasDto.nombre.toUpperCase();

      const newZona = await this.ZonasRepository.create(createZonasDto);
      const ZonaSave = await this.ZonasRepository.save(newZona);

      //Asignamos a root la Zona
      switch (rol) {
        case 1:
          rootPermisos = {
            idUsuario: 1, //Se asigna al usuario supremo
            idZona: ZonaSave.id,
          };
          await this.usuarioZonasRepository.save(rootPermisos);
          break;

        case 2:
          rootPermisos = {
            idUsuario: 1, //Se asigna al usuario supremo SuperAdministrador
            idZona: ZonaSave.id,
          };
          await this.usuarioZonasRepository.save(rootPermisos);
          const userPermisos = {
            idUsuario: idUser, //Se asigna al Administrador
            idZona: ZonaSave.id,
          };
          await this.usuarioZonasRepository.save(userPermisos);
          break;

        default:
          rootPermisos = {
            idUsuario: 1, //Se asigna al usuario supremo SuperAdministrador
            idZona: ZonaSave.id,
          };
          await this.usuarioZonasRepository.save(rootPermisos);
          break;
      }

      // Registro en la bitácora SUCCESS
      const querylogger = { createZonasDto };
      await this.bitacoraLogger.logToBitacora(
        "Zonas",
        `Se creó una Zona con nombre: ${ZonaSave.nombre}`,
        "CREATE",
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.SUCCESS
      );

      // API response (con mensajes corregidos)
      const result: ApiCrudResponse = {
        status: "success",
        message: "Zona creada correctamente.",
        data: {
          id: Number(ZonaSave.id),
          nombre: `Zona ${ZonaSave.id} Nombre: ${ZonaSave.nombre} Descripción: ${ZonaSave.descripcion}`, // ✅ Mejorado
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora en caso ERROR
      const querylogger = { createZonasDto };
      await this.bitacoraLogger.logToBitacora(
        "Zonas",
        `Se creó una Zona con nombre: ${createZonasDto.nombre}`,
        "CREATE",
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: "Error al crear Zona.",
        error: error.message,
      });
    }
  }

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

  private async consultarZonasPaginado(
    cliente: number,
    limit: number,
    offset: number
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
  -- Zonas
  r.Id AS id,
  r.Nombre AS nombre,
  r.Descripcion AS descripcion,
  r.Geocerca AS geocerca,
  r.FechaCreacion AS fechaCreacion,
  r.FechaActualizacion AS fechaActualizacion,
  r.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id
WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consulta

ORDER BY r.Id DESC

  LIMIT ? OFFSET ?;
    `;
    return this.usuarioZonasRepository.query(query, [...ids, limit, offset]);
  }

  private async consultarTotalZonasPaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
    SELECT COUNT(*) AS total
FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id
WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
`;
    return await this.usuarioZonasRepository.query(query, [...ids]);
  }

  //Paginado
  async findAll(
    cliente: number,
    idUser: number,
    rol: number,
    page: number,
    limit: number
  ) {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      let Zonas;
      //Obtenemos ConteoPasajeros
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las Zonas
          Zonas = await this.ZonasRepository.query(
            `
SELECT
  -- Zonas
  r.Id AS id,
  r.Nombre AS nombre,
  r.Descripcion AS descripcion,
  r.Geocerca AS geocerca,
  r.FechaCreacion AS fechaCreacion,
  r.FechaActualizacion AS fechaActualizacion,
  r.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id


ORDER BY r.Id DESC
  LIMIT ? OFFSET ?;

            `,
            [limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.ZonasRepository.query(
            `
    SELECT COUNT(*) AS total
FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id


  `
          );
          break;

        case 2:
          // Usuario administrador - obtiene todas las Zonas de su cliente
          Zonas = await this.consultarZonasPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalZonasPaginados(cliente);
          break;

        case 8:
          // Usuario Reportes - obtiene todas las Zonas de su cliente
          Zonas = await this.consultarZonasPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalZonasPaginados(cliente);
          break;

        case 10:
          // Usuario Capturistas - obtiene todas las Zonas de su cliente
          Zonas = await this.consultarZonasPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalZonasPaginados(cliente);
          break;

        default:
          // Usuarios normales - solo sus Zonas asignadas
          Zonas = await this.ZonasRepository.query(
            `
SELECT
  -- Zonas
  r.Id AS id,
  r.Nombre AS nombre,
  r.Descripcion AS descripcion,
  r.Geocerca AS geocerca,
  r.FechaCreacion AS fechaCreacion,
  r.FechaActualizacion AS fechaActualizacion,
  r.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id
INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id
INNER JOIN Usuarios u ON ur.IdUsuario = u.Id

WHERE 
  ur.IdUsuario = ?       -- 🔹 ID del usuario a filtrar
  AND ur.Estatus = 1

ORDER BY r.Id DESC
  LIMIT ? OFFSET ?;

            `,
            [idUser, limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.ZonasRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id
INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id
INNER JOIN Usuarios u ON ur.IdUsuario = u.Id

WHERE 
  ur.IdUsuario = ?       -- 🔹 ID del usuario a filtrar
  AND ur.Estatus = 1

  `,
            [idUser]
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      // 🔥 Forzamos ids a number y agregamos nombreCompleto
      const data = Zonas.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
      }));

      //APi response
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
        message: "Error al obtener paginado Zonas.",
        error: error.message,
      });
    }
  }

  private async consultarZonasListado(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
  -- Zonas
  r.Id AS id,
  r.Nombre AS nombre,
  r.Descripcion AS descripcion,
  r.Geocerca AS geocerca,
  r.FechaCreacion AS fechaCreacion,
  r.FechaActualizacion AS fechaActualizacion,
  r.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id
WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND r.Estatus = 1
AND c.Estatus = 1

ORDER BY r.Id DESC
    `;
    return this.usuarioZonasRepository.query(query, [...ids]);
  }

  async findAllList(cliente: number, idUser: number, rol: number) {
    try {
      let Zonas;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las Zonas
          Zonas = await this.ZonasRepository.query(
            `
SELECT
  -- Zonas
  r.Id AS id,
  r.Nombre AS nombre,
  r.Descripcion AS descripcion,
  r.Geocerca AS geocerca,
  r.FechaCreacion AS fechaCreacion,
  r.FechaActualizacion AS fechaActualizacion,
  r.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id
WHERE r.Estatus = 1
AND c.Estatus = 1

ORDER BY r.Id DESC

            `
          );
          break;

        case 2:
          // Usuario administrador - obtiene todas las Zonas de su cliente
          Zonas = await this.consultarZonasListado(cliente);
          break;
        case 8:
          // Usuario Reportes - obtiene todas las Zonas de su cliente
          Zonas = await this.consultarZonasListado(cliente);
          break;

        case 10:
          // Usuario Capturistas - obtiene todas las Zonas de su cliente
          Zonas = await this.consultarZonasListado(cliente);
          break;

        default:
          // Usuarios normales - solo sus Zonas asignadas
          Zonas = await this.ZonasRepository.query(
            `
SELECT
  -- Zonas
  r.Id AS id,
  r.Nombre AS nombre,
  r.Descripcion AS descripcion,
  r.Geocerca AS geocerca,
  r.FechaCreacion AS fechaCreacion,
  r.FechaActualizacion AS fechaActualizacion,
  r.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id
INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id
INNER JOIN Usuarios u ON ur.IdUsuario = u.Id

WHERE 
  ur.IdUsuario = ?       -- 🔹 ID del usuario a filtrar
  AND ur.Estatus = 1
  AND r.Estatus = 1
  AND c.Estatus = 1

ORDER BY r.Id DESC;

            `,
            [idUser]
          );
          break;
      }

      // 🔥 Forzamos ids a number y agregamos nombreCompleto
      const data = Zonas.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
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
        message: "Error al obtener listado Zonas",
        error: error.message,
      });
    }
  }

  private async consultarZonasOne(id: number, cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
  -- Zonas
  r.Id AS id,
  r.Nombre AS nombre,
  r.Descripcion AS descripcion,
  r.Geocerca AS geocerca,
  r.FechaCreacion AS fechaCreacion,
  r.FechaActualizacion AS fechaActualizacion,
  r.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id
WHERE r.Id = ?
AND c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

ORDER BY r.Id DESC
    `;
    return this.usuarioZonasRepository.query(query, [id, ...ids]);
  }

  async findOne(idUser: number, id: number, cliente: number, rol: number) {
    try {
      let Zonas;
      //Obtenemos ConteoPasajeros

      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las Zonas
          Zonas = await this.ZonasRepository.query(
            `
SELECT
  -- Zonas
  r.Id AS id,
  r.Nombre AS nombre,
  r.Descripcion AS descripcion,
  r.Geocerca AS geocerca,
  r.FechaCreacion AS fechaCreacion,
  r.FechaActualizacion AS fechaActualizacion,
  r.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id
WHERE r.Id = ?

ORDER BY r.Id DESC

            `,
            [id]
          );
          break;

        case 2:
          // Usuario administrador - obtiene todas las Zonas de su cliente
          Zonas = await this.consultarZonasOne(id, cliente);
          break;
        case 8:
          // Usuario Reportes - obtiene todas las Zonas de su cliente
          Zonas = await this.consultarZonasOne(id, cliente);
          break;

        case 10:
          // Usuario Capturistas - obtiene todas las Zonas de su cliente
          Zonas = await this.consultarZonasOne(id, cliente);
          break;

        default:
          // Usuarios normales - solo sus Zonas asignadas
          Zonas = await this.ZonasRepository.query(
            `
SELECT
  -- Zonas
  r.Id AS id,
  r.Nombre AS nombre,
  r.Descripcion AS descripcion,
  r.Geocerca AS geocerca,
  r.FechaCreacion AS fechaCreacion,
  r.FechaActualizacion AS fechaActualizacion,
  r.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id
INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id
INNER JOIN Usuarios u ON ur.IdUsuario = u.Id

WHERE 
  ur.IdUsuario = ?       -- 🔹 ID del usuario a filtrar
  AND ur.Estatus = 1
  AND r.Id = ?

ORDER BY r.Id DESC;

            `,
            [id, idUser]
          );
          break;
      }

      if (Zonas.length === 0) {
        throw new NotFoundException("Zona no encontrado");
      }

      // 🔥 Forzamos ids a number y agregamos nombreCompleto
      const data = Zonas.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
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
        message: "Error al obtener una Zona",
        error: error.message,
      });
    }
  }

  async updateEstatus(
    id: number,
    idUser: number,
    cliente: number,
    rol: number,
    updateZonasEstatusDto: UpdateZonasEstatusDto
  ) {
    try {
      let Zonas;
      Zonas = await this.ZonasRepository.findOne({
        where: { id: id },
      });

      if (!Zonas) {
        throw new NotFoundException("Zona no encontrado");
      }

      const estatus = updateZonasEstatusDto.estatus;

      await this.ZonasRepository.update(id, { estatus: estatus });

      // Registro en la bitácora SUCESS
      const querylogger = { updateZonasEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Zonas",
        `Se actualizo estatus a ${estatus} una Zona con nombre: ${Zonas.nombre}  y Id ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.SUCCESS
      );

      // API response (con mensajes corregidos)
      const result: ApiCrudResponse = {
        status: "success",
        message: "Estatus de Zona actualizado correctamente", // ✅ Corregido
        data: {
          id: id,
          nombre: `Zona ${id} Nombre: ${Zonas.nombre} Descripción: ${Zonas.descripcion}`, // ✅ Mejorado
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { updateZonasEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Zonas",
        `Se actualizo estatus a ${updateZonasEstatusDto.estatus} en Zona con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar estatus de una Zona",
        error: error.message,
      });
    }
  }

  async update(
    id: number,
    cliente: number,
    idUser: number,
    rol: number,
    updateZonaDto: UpdateZonasDto
  ): Promise<ApiCrudResponse> {
    try {
      let Zonas;

      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las Zonas
          Zonas = await this.ZonasRepository.findOne({
            where: { id: id },
          });
          break;

        case 2:
          // Usuario Administrador - obtiene todas las Zonas
          Zonas = await this.ZonasRepository.findOne({
            where: { id: id, idCliente: cliente },
          });
          break;

        default:
          // Usuarios normales - solo sus Zonas asignadas
          Zonas = await this.ZonasRepository.findOne({
            where: { id: id, idCliente: cliente },
          });
          break;
      }
      if (!Zonas) {
        throw new NotFoundException("Zona no encontrado");
      }

      //actualizamos datos
      await this.ZonasRepository.update(id, updateZonaDto);

      // Registro en la bitácora SUCCESS
      const querylogger = { updateZonaDto };
      await this.bitacoraLogger.logToBitacora(
        "Zonas",
        `Se actualizo una Zona con nombre: ${updateZonaDto.nombre} y Id ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.SUCCESS
      );

      // API response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Zona actualizada correctamente", // ✅ Corregido
        data: {
          id: id,
          nombre: `Zona ${id} Nombre: ${updateZonaDto.nombre} Descripción: ${updateZonaDto.descripcion}`, // ✅ Mejorado
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { updateZonaDto };
      await this.bitacoraLogger.logToBitacora(
        "Zonas",
        `Se actualizo una Zona con nombre: ${updateZonaDto.nombre}  y Id ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar una Zona",
        error: error.message,
      });
    }
  }

  async remove(id: number, cliente: number, idUser: number, rol: number) {
    try {
      let Zonas;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las Zonas
          Zonas = await this.ZonasRepository.findOne({
            where: { id: id },
          });
          break;

        case 2:
          // Usuario administrador - obtiene todas las Zonas
          Zonas = await this.ZonasRepository.findOne({
            where: { id: id, idCliente: cliente },
          });
          break;

        default:
          // Usuarios normales - solo sus Zonas asignadas
          Zonas = await this.ZonasRepository.findOne({
            where: { id: id, idCliente: cliente },
          });
          break;
      }
      if (!Zonas) {
        throw new NotFoundException("Zona no encontrado");
      }

      await this.ZonasRepository.update(id, { estatus: 0 });

      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Zonas",
        `Se elimino una Zona con nombre: ${Zonas.nombre} y Id ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.SUCCESS
      );

      // API response (con mensajes corregidos)
      const result: ApiCrudResponse = {
        status: "success",
        message: "Zona eliminada correctamente", // ✅ Corregido
        data: {
          id: id,
          nombre: `Zona ${id} Nombre: ${Zonas.nombre} Descripción: ${Zonas.descripcion}`, // ✅ Mejorado
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Zonas",
        `Se elimino una Zona con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al eliminar una Zona.",
        error: error.message,
      });
    }
  }
}
