import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateZonasDto } from './dto/create-zona.dto';
import { UpdateZonaDto } from './dto/update-zona.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Zonas } from 'src/entities/Zonas';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { UpdateZonasEstatusDto } from './dto/update-zona-estatus.dto';
import { Clientes } from 'src/entities/Clientes';

@Injectable()
export class ZonasService {
  constructor(
    @InjectRepository(Zonas)
    private readonly zonasRepository: Repository<Zonas>,
    @InjectRepository(UsuariosZonas)
    private readonly usuarioszonasRepository: Repository<UsuariosZonas>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  //Crear Zona
  async create(
    idUser: number,
    cliente: number,
    rol: number,
    createZonasDto: CreateZonasDto,
  ): Promise<ApiCrudResponse> {
    try {
      let rootPermisos;
      createZonasDto.nombre = createZonasDto.nombre.toUpperCase();

      const newZona = await this.zonasRepository.create(createZonasDto);
      const zonaSave = await this.zonasRepository.save(newZona);

      //Asignamos a root la zona
      switch (rol) {
        case 1:
          rootPermisos = {
            idUsuario: 1, //Se asigna al usuario supremo
            idZona: zonaSave.id,
          };
          await this.usuarioszonasRepository.save(rootPermisos);
          break;

        case 2:
          rootPermisos = {
            idUsuario: 1, //Se asigna al usuario supremo SuperAdministrador
            idZona: zonaSave.id,
          };
          await this.usuarioszonasRepository.save(rootPermisos);
          const userPermisos = {
            idUsuario: idUser, //Se asigna al Administrador
            idZona: zonaSave.id,
          };
          await this.usuarioszonasRepository.save(userPermisos);
          break;

        default:
          rootPermisos = {
            idUsuario: 1, //Se asigna al usuario supremo SuperAdministrador
            idZona: zonaSave.id,
          };
          await this.usuarioszonasRepository.save(rootPermisos);
          break;
      }

      // Registro en la bitácora SUCCESS
      const querylogger = { createZonasDto };
      await this.bitacoraLogger.logToBitacora(
        'Zonas',
        `Se creó una Zona con nombre: ${zonaSave.nombre}`,
        'CREATE',
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response (con mensajes corregidos)
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Zona creada correctamente',
        data: {
          id: Number(zonaSave.id),
          nombre: `Zona ${zonaSave.id} Nombre: ${zonaSave.nombre} Descripción:${zonaSave.descripcion}`, // ✅ Mejorado
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora en caso ERROR
      const querylogger = { createZonasDto };
      await this.bitacoraLogger.logToBitacora(
        'Zonas',
        `Se creó una Zona con nombre: ${createZonasDto.nombre}`,
        'CREATE',
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: 'Error al crear Zona',
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

  //Funcion para obtener paginado por clientes
  private async consultarZonasPagina(
    cliente: number,
    limit: number,
    offset: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
  -- Zona
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

WHERE 
  r.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

ORDER BY r.Id DESC
  LIMIT ? OFFSET ?;
    `;
    return this.zonasRepository.query(query, [...ids, limit, offset]);
  }

  //Obtener total para la funcion de paginado
  private async consultarTotalZonasPaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
  SELECT COUNT(*) AS total
  FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id
WHERE 
  r.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

`;
    return await this.zonasRepository.query(query, [...ids]);
  }

  //Paginado
  async findAll(
    cliente: number,
    idUser: number,
    rol: number,
    page: number,
    limit: number,
  ) {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      let zonas;
      //Obtenemos ConteoPasajeros
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las zonas
          zonas = await this.zonasRepository.query(
            `
SELECT
  -- Zona
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
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.zonasRepository.query(
            `
  SELECT COUNT(*) AS total
  FROM Zonas r
INNER JOIN Clientes c ON r.IdCliente = c.Id

  `,
          );
          break;

        case 2:
          // Usuario administrador - obtiene todas las zonas de su cliente
          zonas = await this.consultarZonasPagina(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalZonasPaginados(cliente);
          break;

        case 3:
          // Usuario operador - obtiene todas las zonas de su cliente
          zonas = await this.consultarZonasPagina(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalZonasPaginados(cliente);
          break;

        case 8:
          // Usuario Reportes - obtiene todas las zonas de su cliente
          zonas = await this.consultarZonasPagina(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalZonasPaginados(cliente);
          break;

        case 10:
          // Usuario Capturistas - obtiene todas las zonas de su cliente
          zonas = await this.consultarZonasPagina(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalZonasPaginados(cliente);
          break;

        default:
          // Usuarios normales - solo sus zonas asignadas
          zonas = await this.zonasRepository.query(
            `
SELECT
  -- Zona
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
            [idUser, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.zonasRepository.query(
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
            [idUser],
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      // 🔥 Forzamos ids a number y agregamos nombreCompleto
      const data = zonas.map((item) => ({
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
        message: 'Error al obtener paginado Zonas',
        error: error.message,
      });
    }
  }

  //Funcion Obtener listado por cliente
  private async consultarZonasListado(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
  -- Zona
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

WHERE 
  r.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND r.Estatus = 1
  AND c.Estatus = 1

ORDER BY r.Id DESC
    `;
    return this.zonasRepository.query(query, [...ids]);
  }

  //Obtener listado por idCliente recibido por ruta (solo del cliente, sin hijos)
  async findByCliente(idCliente: number, _idUser: number, _rol: number) {
    try {
      // Consulta directa sin incluir clientes hijos
      const zonas = await this.zonasRepository.query(
        `
SELECT
  -- Región
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

WHERE 
  r.IdCliente = ?
  AND r.Estatus = 1
  AND c.Estatus = 1

ORDER BY r.Id DESC
        `,
        [idCliente],
      );

      // 🔥 Forzamos ids a number
      const data = zonas.map((item) => ({
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
        message: 'Error al obtener zonas por cliente',
        error: error.message,
      });
    }
  }

  //Obtener listado
  async findAllList(cliente: number, idUser: number, rol: number) {
    try {
      let zonas;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las zonas
          zonas = await this.zonasRepository.query(
            `
SELECT
  -- Zona
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

WHERE 
  r.Estatus = 1
  AND c.Estatus = 1
  

ORDER BY r.Id DESC;

            `,
          );
          break;

        case 2:
          // Usuario administrador - obtiene todas las zonas de su cliente
          zonas = await this.consultarZonasListado(cliente);
          break;
        case 3:
          // Usuario Operador - obtiene todas las zonas de su cliente
          zonas = await this.consultarZonasListado(cliente);
          break;
        case 8:
          // Usuario Reportes - obtiene todas las zonas de su cliente
          zonas = await this.consultarZonasListado(cliente);
          break;

        case 10:
          // Usuario Capturistas - obtiene todas las zonas de su cliente
          zonas = await this.consultarZonasListado(cliente);
          break;

        default:
          // Usuarios normales - solo sus zonas asignadas
          console.log(rol);
          zonas = await this.zonasRepository.query(
            `
SELECT
  -- Zona
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
 ur.Estatus = 1
  AND r.Estatus = 1
  AND c.Estatus = 1

ORDER BY r.Id DESC;

            `,
            [idUser],
          );
          break;
      }

      // 🔥 Forzamos ids a number y agregamos nombreCompleto
      const data = zonas.map((item) => ({
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
        message: 'Error al obtener listado Zonas',
        error: error.message,
      });
    }
  }

  private async consultarZonasOne(cliente: number, id: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
  -- Zona
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

WHERE 
  r.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND r.Id = ?

ORDER BY r.Id DESC
    `;
    return this.zonasRepository.query(query, [...ids, id]);
  }

  async findOne(idUser: number, id: number, cliente: number, rol: number) {
    try {
      let zonas;
      //Obtenemos ConteoPasajeros

      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las zonas
          zonas = await this.zonasRepository.query(
            `
SELECT
  -- Zona
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

WHERE 
  r.Id = ?
  

ORDER BY r.Id DESC;

            `,
            [id],
          );
          break;

        case 2:
          // Usuario administrador - obtiene todas las zonas de su cliente
          zonas = await this.consultarZonasOne(cliente, id);
          break;
        case 3:
          // Usuario operador - obtiene todas las zonas de su cliente
          zonas = await this.consultarZonasOne(cliente, id);
          break;
        case 8:
          // Usuario Reportes - obtiene todas las zonas de su cliente
          zonas = await this.consultarZonasOne(cliente, id);
          break;

        case 10:
          // Usuario Capturistas - obtiene todas las zonas de su cliente
          zonas = await this.consultarZonasOne(cliente, id);
          break;

        default:
          // Usuarios normales - solo sus zonas asignadas
          zonas = await this.zonasRepository.query(
            `
SELECT
  -- Zona
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
            [idUser, id],
          );
          break;
      }

      if (zonas.length === 0) {
        throw new NotFoundException('zona no encontrada');
      }

      // 🔥 Forzamos ids a number y agregamos nombreCompleto
      const data = zonas.map((item) => ({
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
        message: 'Error al obtener una zona',
        error: error.message,
      });
    }
  }

  async updateEstatus(
    id: number,
    idUser: number,
    cliente: number,
    rol: number,
    updateZonasEstatusDto: UpdateZonasEstatusDto,
  ) {
    try {
      let zonas;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las zonas
          zonas = await this.zonasRepository.findOne({
            where: { id: id },
          });
          break;

        case 2:
          // Usuario administrador - obtiene todas las zonas
          zonas = await this.zonasRepository.findOne({
            where: { id: id, idCliente: cliente },
          });
          break;

        default:
          // Usuarios normales - solo sus zonas asignadas
          zonas = await this.zonasRepository.findOne({
            where: { id: id },
          });
          break;
      }
      if (!zonas) {
        throw new NotFoundException('Zona no encontrada');
      }

      const estatus = updateZonasEstatusDto.estatus;

      await this.zonasRepository.update(id, { estatus: estatus });

      // Registro en la bitácora SUCESS
      const querylogger = { updateZonasEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Zonas',
        `Se actualizo estatus a ${estatus} una Zona con nombre: ${zonas.nombre}  y Id ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response (con mensajes corregidos)
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Estatus de zona actualizado correctamente', // ✅ Corregido
        data: {
          id: id,
          nombre: `Zona ${id} Nombre: ${zonas.nombre} Descripción:${zonas.descripcion}`, // ✅ Mejorado
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { updateZonasEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Zonas',
        `Se actualizo estatus a ${updateZonasEstatusDto.estatus} en Zona con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar estatus de una zona',
        error: error.message,
      });
    }
  }

  async update(
    id: number,
    cliente: number,
    idUser: number,
    rol: number,
    updateZonaDto: UpdateZonaDto,
  ): Promise<ApiCrudResponse> {
    try {
      let zonas;

      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las zonas
          zonas = await this.zonasRepository.findOne({
            where: { id: id },
          });
          break;

        case 2:
          // Usuario Administrador - obtiene todas las zonas
          zonas = await this.zonasRepository.findOne({
            where: { id: id, idCliente: cliente },
          });
          break;

        default:
          // Usuarios normales - solo sus zonas asignadas
          zonas = await this.zonasRepository.findOne({
            where: { id: id, idCliente: cliente },
          });
          break;
      }
      if (!zonas) {
        throw new NotFoundException('Zona no encontrada');
      }

      //actualizamos datos
      await this.zonasRepository.update(id, updateZonaDto);

      // Registro en la bitácora SUCCESS
      const querylogger = { updateZonaDto };
      await this.bitacoraLogger.logToBitacora(
        'Zonas',
        `Se actualizo una Zona con nombre: ${updateZonaDto.nombre} y Id ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Zona actualizada correctamente', // ✅ Corregido
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
        'Zonas',
        `Se actualizo una Zona con nombre: ${updateZonaDto.nombre}  y Id ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar una zona',
        error: error.message,
      });
    }
  }

  async remove(id: number, cliente: number, idUser: number, rol: number) {
    try {
      let zonas;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las zonas
          zonas = await this.zonasRepository.findOne({
            where: { id: id },
          });
          break;

        case 2:
          // Usuario administrador - obtiene todas las zonas
          zonas = await this.zonasRepository.findOne({
            where: { id: id, idCliente: cliente },
          });
          break;

        default:
          // Usuarios normales - solo sus zonas asignadas
          zonas = await this.zonasRepository.findOne({
            where: { id: id, idCliente: cliente },
          });
          break;
      }
      if (!zonas) {
        throw new NotFoundException('Zona no encontrada');
      }

      await this.zonasRepository.update(id, { estatus: 0 });

      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Zonas',
        `Se elimino una Zona con nombre: ${zonas.nombre} y Id ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response (con mensajes corregidos)
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Zona eliminada correctamente', // ✅ Corregido
        data: {
          id: id,
          nombre: `Zona ${id} Nombre: ${zonas.nombre} Descripción:${zonas.descripcion}`, // ✅ Mejorado
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Zonas',
        `Se elimino una Zona con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        16,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al eliminar una zona',
        error: error.message,
      });
    }
  }
}
