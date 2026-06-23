import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateMantenimientoCombustibleDto } from './dto/create-mantenimiento-combustible.dto';
import { UpdateMantenimientoCombustibleDto } from './dto/update-mantenimiento-combustible.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { MantenimientoCombustible } from 'src/entities/MantenimientoCombustible';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Clientes } from 'src/entities/Clientes';
import { Repository, In } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';

@Injectable()
export class MantenimientoCombustibleService {
  constructor(
    @InjectRepository(MantenimientoCombustible)
    private readonly mantenimientoCombustibleRepository: Repository<MantenimientoCombustible>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) { }

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
      return { ids: [], placeholders: '' }; // No hay clientes que consultar
    }

    // Construir el query dinámico con los IDs
    const placeholders = ids.map(() => '?').join(', ');
    return { ids, placeholders };
  }

  async create(
    createMantenimientoCombustibleDto: CreateMantenimientoCombustibleDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const create = await this.mantenimientoCombustibleRepository.create(
        createMantenimientoCombustibleDto,
      );
      const saved = await this.mantenimientoCombustibleRepository.save(create);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createMantenimientoCombustibleDto };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoCombustible',
        `Se creó un registro de mantenimiento de combustible con ID: ${saved.id}`,
        'CREATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      const idMantenimiento = saved.id;
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Mantenimiento de combustible creado correctamente',
        data: {
          id: Number(idMantenimiento),
          nombre: `Abastecimiento #${idMantenimiento}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createMantenimientoCombustibleDto };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoCombustible',
        `Error al crear mantenimiento de combustible`,
        'CREATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al crear el mantenimiento de combustible.',
      );
    }
  }

  async findAll(page: number, limit: number, idCliente: number, rol: number): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let mantenimientos;
      let totalResult;

      switch (rol) {
        case 1:
        case 2:
          // Consulta de datos paginados Usuario SuperAdministrador/Administrador
          mantenimientos = await this.mantenimientoCombustibleRepository.query(
            `
SELECT
  mc.Id AS id,
  mc.IdTipoCombustible AS idTipoCombustible,
  mc.CantidadCombustible AS cantidadCombustible,
  mc.PrecioCombustible AS precioCombustible,
  mc.IdInstalacion AS idInstalacion,
  mc.Estatus AS estatus,
  mc.FechaHora AS fechaHora,
  mc.FHRegistro AS fhRegistro,
  mc.Kilometraje AS kilometraje,
  mc.IdOperador AS idOperador,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  CONCAT(
    IFNULL(u.Nombre, ''),
    IFNULL(CONCAT(' ', u.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', u.ApellidoMaterno), '')
  ) AS nombreOperador,
  ctc.Id AS tipoCombustibleId,
  ctc.Nombre AS tipoCombustibleNombre,
  c.Id AS idClienteData,
  c.Nombre AS nombreClienteData,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente
FROM MantenimientoCombustible mc
INNER JOIN Instalaciones i ON mc.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN Operadores o ON mc.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id
LEFT JOIN CatTipoCombustible ctc ON mc.IdTipoCombustible = ctc.Id
ORDER BY mc.FHRegistro DESC
LIMIT ? OFFSET ?;
            `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.mantenimientoCombustibleRepository.query(
            `
SELECT COUNT(*) AS total
FROM MantenimientoCombustible mc
INNER JOIN Instalaciones i ON mc.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
            `,
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(idCliente);
          if (ids.length === 0) {
            return {
              data: [],
              paginated: {
                total: 0,
                page,
                lastPage: 0,
              },
            };
          }

          // Consulta de datos paginados resto Usuario
          mantenimientos = await this.mantenimientoCombustibleRepository.query(
            `
SELECT
  mc.Id AS id,
  mc.IdTipoCombustible AS idTipoCombustible,
  mc.CantidadCombustible AS cantidadCombustible,
  mc.PrecioCombustible AS precioCombustible,
  mc.IdInstalacion AS idInstalacion,
  mc.Estatus AS estatus,
  mc.FechaHora AS fechaHora,
  mc.FHRegistro AS fhRegistro,
  mc.Kilometraje AS kilometraje,
  mc.IdOperador AS idOperador,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  CONCAT(
    IFNULL(u.Nombre, ''),
    IFNULL(CONCAT(' ', u.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', u.ApellidoMaterno), '')
  ) AS nombreOperador,
  ctc.Id AS tipoCombustibleId,
  ctc.Nombre AS tipoCombustibleNombre
FROM MantenimientoCombustible mc
INNER JOIN Instalaciones i ON mc.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN Operadores o ON mc.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id
LEFT JOIN CatTipoCombustible ctc ON mc.IdTipoCombustible = ctc.Id
WHERE c.Id IN (${placeholders})
ORDER BY mc.FHRegistro DESC
LIMIT ? OFFSET ?;
            `,
            [...ids, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.mantenimientoCombustibleRepository.query(
            `
SELECT COUNT(*) AS total
FROM MantenimientoCombustible mc
INNER JOIN Instalaciones i ON mc.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
WHERE c.Id IN (${placeholders})
            `,
            [...ids],
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      // Transformar los datos
      const mantenimientosTransformados = mantenimientos.map((item: any) => ({
        id: Number(item.id),
        idTipoCombustible: item.idTipoCombustible ? Number(item.idTipoCombustible) : null,
        cantidadCombustible: item.cantidadCombustible ? Number(item.cantidadCombustible) : null,
        precioCombustible: item.precioCombustible ? Number(item.precioCombustible) : null,
        idInstalacion: item.idInstalacion ? Number(item.idInstalacion) : null,
        estatus: item.estatus,
        fechaHora: item.fechaHora,
        fhRegistro: item.fhRegistro,
        kilometraje: item.kilometraje ? Number(item.kilometraje) : null,
        idOperador: item.idOperador ? Number(item.idOperador) : null,
        placaVehiculo: item.placaVehiculo || null,
        imagenVehiculo: item.imagenVehiculo || null,
        nombreOperador: item.nombreOperador?.trim() || null,
        tipoCombustible: item.tipoCombustibleId ? {
          id: Number(item.tipoCombustibleId),
          nombre: item.tipoCombustibleNombre,
        } : null,
        instalacion: item.idInstalacion ? { id: Number(item.idInstalacion) } : null,
        operador: item.idOperador ? { id: Number(item.idOperador) } : null,
        ...(rol === 1 || rol === 2) && item.idClienteData ? {
          cliente: {
            id: Number(item.idClienteData),
            nombre: item.nombreClienteData,
            apellidoPaterno: item.apellidoPaternoCliente,
            apellidoMaterno: item.apellidoMaternoCliente,
            estatus: item.estatusCliente,
          },
        } : {},
      }));

      const result: ApiResponseCommon = {
        data: mantenimientosTransformados,
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
      throw new BadRequestException(
        error.message || 'Error al obtener los mantenimientos de combustible',
      );
    }
  }

  async findOne(id: number, idCliente: number, rol: number): Promise<ApiResponseCommon> {
    try {
      let mantenimientos;

      switch (rol) {
        case 1:
        case 2:
          // Consulta para SuperAdministrador/Administrador
          mantenimientos = await this.mantenimientoCombustibleRepository.query(
            `
SELECT
  mc.Id AS id,
  mc.IdTipoCombustible AS idTipoCombustible,
  mc.CantidadCombustible AS cantidadCombustible,
  mc.PrecioCombustible AS precioCombustible,
  mc.IdInstalacion AS idInstalacion,
  mc.Estatus AS estatus,
  mc.FechaHora AS fechaHora,
  mc.FHRegistro AS fhRegistro,
  mc.Kilometraje AS kilometraje,
  mc.IdOperador AS idOperador,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  CONCAT(
    IFNULL(u.Nombre, ''),
    IFNULL(CONCAT(' ', u.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', u.ApellidoMaterno), '')
  ) AS nombreOperador,
  ctc.Id AS tipoCombustibleId,
  ctc.Nombre AS tipoCombustibleNombre,
  c.Id AS idClienteData,
  c.Nombre AS nombreClienteData,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente
FROM MantenimientoCombustible mc
INNER JOIN Instalaciones i ON mc.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN Operadores o ON mc.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id
LEFT JOIN CatTipoCombustible ctc ON mc.IdTipoCombustible = ctc.Id
WHERE mc.Id = ?
            `,
            [id],
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(idCliente);
          if (ids.length === 0) {
            throw new NotFoundException('Mantenimiento de combustible no encontrado');
          }

          // Consulta para resto de usuarios
          mantenimientos = await this.mantenimientoCombustibleRepository.query(
            `
SELECT
  mc.Id AS id,
  mc.IdTipoCombustible AS idTipoCombustible,
  mc.CantidadCombustible AS cantidadCombustible,
  mc.PrecioCombustible AS precioCombustible,
  mc.IdInstalacion AS idInstalacion,
  mc.Estatus AS estatus,
  mc.FechaHora AS fechaHora,
  mc.FHRegistro AS fhRegistro,
  mc.Kilometraje AS kilometraje,
  mc.IdOperador AS idOperador,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  CONCAT(
    IFNULL(u.Nombre, ''),
    IFNULL(CONCAT(' ', u.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', u.ApellidoMaterno), '')
  ) AS nombreOperador,
  ctc.Id AS tipoCombustibleId,
  ctc.Nombre AS tipoCombustibleNombre
FROM MantenimientoCombustible mc
INNER JOIN Instalaciones i ON mc.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN Operadores o ON mc.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id
LEFT JOIN CatTipoCombustible ctc ON mc.IdTipoCombustible = ctc.Id
WHERE c.Id IN (${placeholders})
AND mc.Id = ?
            `,
            [...ids, id],
          );
          break;
      }

      if (mantenimientos.length === 0) {
        throw new NotFoundException('Mantenimiento de combustible no encontrado');
      }

      const item = mantenimientos[0];

      const result: ApiResponseCommon = {
        data: [
          {
            id: Number(item.id),
            idTipoCombustible: item.idTipoCombustible ? Number(item.idTipoCombustible) : null,
            cantidadCombustible: item.cantidadCombustible ? Number(item.cantidadCombustible) : null,
            precioCombustible: item.precioCombustible ? Number(item.precioCombustible) : null,
            idInstalacion: item.idInstalacion ? Number(item.idInstalacion) : null,
            estatus: item.estatus,
            fechaHora: item.fechaHora,
            fhRegistro: item.fhRegistro,
            kilometraje: item.kilometraje ? Number(item.kilometraje) : null,
            idOperador: item.idOperador ? Number(item.idOperador) : null,
            placaVehiculo: item.placaVehiculo || null,
            imagenVehiculo: item.imagenVehiculo || null,
            nombreOperador: item.nombreOperador?.trim() || null,
            tipoCombustible: item.tipoCombustibleId ? {
              id: Number(item.tipoCombustibleId),
              nombre: item.tipoCombustibleNombre,
            } : null,
            instalacion: item.idInstalacion ? { id: Number(item.idInstalacion) } : null,
            operador: item.idOperador ? { id: Number(item.idOperador) } : null,
            ...(rol === 1 || rol === 2) && item.idClienteData ? {
              cliente: {
                id: Number(item.idClienteData),
                nombre: item.nombreClienteData,
                apellidoPaterno: item.apellidoPaternoCliente,
                apellidoMaterno: item.apellidoMaternoCliente,
                estatus: item.estatusCliente,
              },
            } : {},
          },
        ],
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error interno al buscar el mantenimiento de combustible',
      );
    }
  }

  async update(
    id: number,
    updateMantenimientoCombustibleDto: UpdateMantenimientoCombustibleDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const mantenimiento = await this.mantenimientoCombustibleRepository.findOne({
        where: { id: id },
      });
      if (!mantenimiento) {
        throw new NotFoundException('Mantenimiento de combustible no encontrado');
      }

      await this.mantenimientoCombustibleRepository.update(
        id,
        updateMantenimientoCombustibleDto,
      );
      const mantenimientoResult = await this.mantenimientoCombustibleRepository.findOne({
        where: { id: id },
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateMantenimientoCombustibleDto };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoCombustible',
        `Se actualizó el mantenimiento de combustible con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Mantenimiento de combustible actualizado correctamente',
        data: {
          id: id,
          nombre: `Abastecimiento #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateMantenimientoCombustibleDto };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoCombustible',
        `Error al actualizar mantenimiento de combustible con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al actualizar el mantenimiento de combustible.',
      );
    }
  }

  async desactivar(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const mantenimiento = await this.mantenimientoCombustibleRepository.findOne({
        where: { id: id },
      });

      if (!mantenimiento) {
        throw new NotFoundException('Mantenimiento de combustible no encontrado');
      }

      await this.mantenimientoCombustibleRepository.update(id, { estatus: 0 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoCombustible',
        `Se desactivó el mantenimiento de combustible con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Mantenimiento de combustible desactivado correctamente',
        estatus: { estatus: 0 },
        data: {
          id: id,
          nombre: `Abastecimiento #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoCombustible',
        `Error al desactivar mantenimiento de combustible con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        5,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al desactivar el mantenimiento de combustible.',
        error: error.message,
      });
    }
  }

  async activar(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const mantenimiento = await this.mantenimientoCombustibleRepository.findOne({
        where: { id: id },
      });

      if (!mantenimiento) {
        throw new NotFoundException('Mantenimiento de combustible no encontrado');
      }

      if (mantenimiento.estatus === 1) {
        throw new BadRequestException('El mantenimiento de combustible ya está activo');
      }

      await this.mantenimientoCombustibleRepository.update(id, { estatus: 1 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 1 };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoCombustible',
        `Se activó el mantenimiento de combustible con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Mantenimiento de combustible activado correctamente',
        estatus: { estatus: 1 },
        data: {
          id: id,
          nombre: `Abastecimiento #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 1 };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoCombustible',
        `Error al activar mantenimiento de combustible con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        5,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al activar el mantenimiento de combustible.',
        error: error.message,
      });
    }
  }
}
