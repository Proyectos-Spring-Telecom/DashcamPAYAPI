import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateMantenimientoVehicularDto } from './dto/create-mantenimiento-vehicular.dto';
import { UpdateMantenimientoVehicularDto } from './dto/update-mantenimiento-vehicular.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { MantenimientoVehicular } from 'src/entities/MantenimientoVehicular';
import { CatEstatusMantenimiento } from 'src/entities/CatEstatusMantenimiento';
import { Talleres } from 'src/entities/Talleres';
import { Instalaciones } from 'src/entities/Instalaciones';
import { CatReferenciaServicio } from 'src/entities/CatReferenciaServicio';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { S3Service } from 'src/s3/s3.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { Clientes } from 'src/entities/Clientes';

@Injectable()
export class MantenimientoVehicularService {
  constructor(
    @InjectRepository(MantenimientoVehicular)
    private readonly mantenimientoVehicularRepository: Repository<MantenimientoVehicular>,
    @InjectRepository(CatEstatusMantenimiento)
    private readonly catEstatusMantenimientoRepository: Repository<CatEstatusMantenimiento>,
    @InjectRepository(Talleres)
    private readonly talleresRepository: Repository<Talleres>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(CatReferenciaServicio)
    private readonly catReferenciaServicioRepository: Repository<CatReferenciaServicio>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly s3Service: S3Service,
  ) {}

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
    createMantenimientoVehicularDto: CreateMantenimientoVehicularDto,
    idUser: number,
    notaServicioFile?: Express.Multer.File,
  ): Promise<ApiCrudResponse> {
    try {
      // Validar claves foráneas si se proporcionan
      if (
        createMantenimientoVehicularDto.idEstatus !== undefined &&
        createMantenimientoVehicularDto.idEstatus !== null
      ) {
        const estatusExists =
          await this.catEstatusMantenimientoRepository.findOne({
            where: { id: createMantenimientoVehicularDto.idEstatus },
          });
        if (!estatusExists) {
          throw new BadRequestException(
            `El estatus de mantenimiento con ID ${createMantenimientoVehicularDto.idEstatus} no existe.`,
          );
        }
      }

      if (
        createMantenimientoVehicularDto.idTaller !== undefined &&
        createMantenimientoVehicularDto.idTaller !== null
      ) {
        const tallerExists = await this.talleresRepository.findOne({
          where: { id: createMantenimientoVehicularDto.idTaller },
        });
        if (!tallerExists) {
          throw new BadRequestException(
            `El taller con ID ${createMantenimientoVehicularDto.idTaller} no existe.`,
          );
        }
      }

      if (
        createMantenimientoVehicularDto.idInstalacion !== undefined &&
        createMantenimientoVehicularDto.idInstalacion !== null
      ) {
        const instalacionExists = await this.instalacionesRepository.findOne({
          where: { id: createMantenimientoVehicularDto.idInstalacion },
        });
        if (!instalacionExists) {
          throw new BadRequestException(
            `La instalación con ID ${createMantenimientoVehicularDto.idInstalacion} no existe.`,
          );
        }
      }

      if (
        createMantenimientoVehicularDto.idReferencia !== undefined &&
        createMantenimientoVehicularDto.idReferencia !== null
      ) {
        const referenciaExists =
          await this.catReferenciaServicioRepository.findOne({
            where: { id: createMantenimientoVehicularDto.idReferencia },
          });
        if (!referenciaExists) {
          throw new BadRequestException(
            `La referencia de servicio con ID ${createMantenimientoVehicularDto.idReferencia} no existe.`,
          );
        }
      }

      // Subir imagen de notaServicio a S3 si se proporciona
      let notaServicioUrl: string | null = null;
      if (notaServicioFile) {
        const uploadResult = await this.s3Service.uploadFile(
          notaServicioFile,
          'NotasServicioMantenimiento',
          idUser,
          33, // ID del módulo de mantenimiento vehicular
        );
        notaServicioUrl = uploadResult.url;
      }

      // Crear el registro con los datos del DTO (ya convertidos automáticamente)
      const dataToCreate = {
        ...createMantenimientoVehicularDto,
        notaServicio: notaServicioUrl,
      };

      const create = this.mantenimientoVehicularRepository.create(dataToCreate);
      const savedResult =
        await this.mantenimientoVehicularRepository.save(create);
      const saved = Array.isArray(savedResult) ? savedResult[0] : savedResult;

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createMantenimientoVehicularDto };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoVehicular',
        `Se creó un mantenimiento vehicular con ID: ${saved.id}`,
        'CREATE',
        querylogger,
        idUser,
        33,
        EstatusEnumBitcora.SUCCESS,
      );

      const idMantenimiento = saved.id;
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Mantenimiento vehicular creado correctamente',
        data: {
          id: Number(idMantenimiento),
          nombre: `Mantenimiento #${idMantenimiento}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createMantenimientoVehicularDto };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoVehicular',
        `Error al crear mantenimiento vehicular`,
        'CREATE',
        querylogger,
        idUser,
        33,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al crear el mantenimiento vehicular.',
      );
    }
  }

  async findAll(
    page: number,
    limit: number,
    idCliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let mantenimientos;
      let totalResult;

      switch (rol) {
        case 1:
        case 2:
          // Consulta de datos paginados Usuario SuperAdministrador/Administrador
          mantenimientos = await this.mantenimientoVehicularRepository.query(
            `
SELECT
  mv.Id AS id,
  mv.IdInstalacion AS idInstalacion,
  mv.IdReferencia AS idReferencia,
  mv.ServicioDescripcion AS servicioDescripcion,
  mv.NotaServicio AS notaServicio,
  mv.IdEstatus AS idEstatus,
  mv.FechaInicio AS fechaInicio,
  mv.FechaFinal AS fechaFinal,
  mv.IdTaller AS idTaller,
  mv.Costo AS costo,
  mv.Encargado AS encargado,
  mv.FHRegistro AS fhRegistro,
  mv.Estatus AS estatus,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  cem.Id AS estatusMantenimientoId,
  cem.Nombre AS estatusMantenimientoNombre,
  t.Id AS tallerId,
  t.Nombre AS tallerNombre,
  crs.Id AS referenciaServicioId,
  crs.Nombre AS referenciaServicioNombre,
  c.Id AS idClienteData,
  c.Nombre AS nombreClienteData,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente
FROM MantenimientoVehicular mv
INNER JOIN Instalaciones i ON mv.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN CatEstatusMantenimiento cem ON mv.IdEstatus = cem.Id
LEFT JOIN Talleres t ON mv.IdTaller = t.Id
LEFT JOIN CatReferenciaServicio crs ON mv.IdReferencia = crs.Id
ORDER BY mv.FHRegistro DESC
LIMIT ? OFFSET ?;
            `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.mantenimientoVehicularRepository.query(
            `
SELECT COUNT(*) AS total
FROM MantenimientoVehicular mv
INNER JOIN Instalaciones i ON mv.IdInstalacion = i.Id
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
          mantenimientos = await this.mantenimientoVehicularRepository.query(
            `
SELECT
  mv.Id AS id,
  mv.IdInstalacion AS idInstalacion,
  mv.IdReferencia AS idReferencia,
  mv.ServicioDescripcion AS servicioDescripcion,
  mv.NotaServicio AS notaServicio,
  mv.IdEstatus AS idEstatus,
  mv.FechaInicio AS fechaInicio,
  mv.FechaFinal AS fechaFinal,
  mv.IdTaller AS idTaller,
  mv.Costo AS costo,
  mv.Encargado AS encargado,
  mv.FHRegistro AS fhRegistro,
  mv.Estatus AS estatus,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  cem.Id AS estatusMantenimientoId,
  cem.Nombre AS estatusMantenimientoNombre,
  t.Id AS tallerId,
  t.Nombre AS tallerNombre,
  crs.Id AS referenciaServicioId,
  crs.Nombre AS referenciaServicioNombre
FROM MantenimientoVehicular mv
INNER JOIN Instalaciones i ON mv.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN CatEstatusMantenimiento cem ON mv.IdEstatus = cem.Id
LEFT JOIN Talleres t ON mv.IdTaller = t.Id
LEFT JOIN CatReferenciaServicio crs ON mv.IdReferencia = crs.Id
WHERE c.Id IN (${placeholders})
ORDER BY mv.FHRegistro DESC
LIMIT ? OFFSET ?;
            `,
            [...ids, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.mantenimientoVehicularRepository.query(
            `
SELECT COUNT(*) AS total
FROM MantenimientoVehicular mv
INNER JOIN Instalaciones i ON mv.IdInstalacion = i.Id
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
        idInstalacion: item.idInstalacion ? Number(item.idInstalacion) : null,
        idReferencia: item.idReferencia ? Number(item.idReferencia) : null,
        servicioDescripcion: item.servicioDescripcion,
        notaServicio: item.notaServicio,
        idEstatus: item.idEstatus ? Number(item.idEstatus) : null,
        fechaInicio: item.fechaInicio,
        fechaFinal: item.fechaFinal,
        idTaller: item.idTaller ? Number(item.idTaller) : null,
        costo: item.costo ? Number(item.costo) : null,
        encargado: item.encargado,
        fhRegistro: item.fhRegistro,
        estatus: item.estatus,
        placaVehiculo: item.placaVehiculo || null,
        imagenVehiculo: item.imagenVehiculo || null,
        instalacion: item.idInstalacion
          ? { id: Number(item.idInstalacion) }
          : null,
        estatusMantenimiento: item.estatusMantenimientoId
          ? {
              id: Number(item.estatusMantenimientoId),
              nombre: item.estatusMantenimientoNombre,
            }
          : null,
        taller: item.tallerId
          ? {
              id: Number(item.tallerId),
              nombre: item.tallerNombre,
            }
          : null,
        referenciaServicio: item.referenciaServicioId
          ? {
              id: Number(item.referenciaServicioId),
              nombre: item.referenciaServicioNombre,
            }
          : null,
        ...((rol === 1 || rol === 2) && item.idClienteData
          ? {
              cliente: {
                id: Number(item.idClienteData),
                nombre: item.nombreClienteData,
                apellidoPaterno: item.apellidoPaternoCliente,
                apellidoMaterno: item.apellidoMaternoCliente,
                estatus: item.estatusCliente,
              },
            }
          : {}),
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
        error.message || 'Error al obtener los mantenimientos vehiculares',
      );
    }
  }

  async findOne(
    id: number,
    idCliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      let mantenimientos;

      switch (rol) {
        case 1:
        case 2:
          // Consulta para SuperAdministrador/Administrador
          mantenimientos = await this.mantenimientoVehicularRepository.query(
            `
SELECT
  mv.Id AS id,
  mv.IdInstalacion AS idInstalacion,
  mv.IdReferencia AS idReferencia,
  mv.ServicioDescripcion AS servicioDescripcion,
  mv.NotaServicio AS notaServicio,
  mv.IdEstatus AS idEstatus,
  mv.FechaInicio AS fechaInicio,
  mv.FechaFinal AS fechaFinal,
  mv.IdTaller AS idTaller,
  mv.Costo AS costo,
  mv.Encargado AS encargado,
  mv.FHRegistro AS fhRegistro,
  mv.Estatus AS estatus,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  cem.Id AS estatusMantenimientoId,
  cem.Nombre AS estatusMantenimientoNombre,
  t.Id AS tallerId,
  t.Nombre AS tallerNombre,
  crs.Id AS referenciaServicioId,
  crs.Nombre AS referenciaServicioNombre,
  c.Id AS idClienteData,
  c.Nombre AS nombreClienteData,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente
FROM MantenimientoVehicular mv
INNER JOIN Instalaciones i ON mv.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN CatEstatusMantenimiento cem ON mv.IdEstatus = cem.Id
LEFT JOIN Talleres t ON mv.IdTaller = t.Id
LEFT JOIN CatReferenciaServicio crs ON mv.IdReferencia = crs.Id
WHERE mv.Id = ?
            `,
            [id],
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(idCliente);
          if (ids.length === 0) {
            throw new NotFoundException(
              'Mantenimiento vehicular no encontrado',
            );
          }

          // Consulta para resto de usuarios
          mantenimientos = await this.mantenimientoVehicularRepository.query(
            `
SELECT
  mv.Id AS id,
  mv.IdInstalacion AS idInstalacion,
  mv.IdReferencia AS idReferencia,
  mv.ServicioDescripcion AS servicioDescripcion,
  mv.NotaServicio AS notaServicio,
  mv.IdEstatus AS idEstatus,
  mv.FechaInicio AS fechaInicio,
  mv.FechaFinal AS fechaFinal,
  mv.IdTaller AS idTaller,
  mv.Costo AS costo,
  mv.Encargado AS encargado,
  mv.FHRegistro AS fhRegistro,
  mv.Estatus AS estatus,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  cem.Id AS estatusMantenimientoId,
  cem.Nombre AS estatusMantenimientoNombre,
  t.Id AS tallerId,
  t.Nombre AS tallerNombre,
  crs.Id AS referenciaServicioId,
  crs.Nombre AS referenciaServicioNombre
FROM MantenimientoVehicular mv
INNER JOIN Instalaciones i ON mv.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN CatEstatusMantenimiento cem ON mv.IdEstatus = cem.Id
LEFT JOIN Talleres t ON mv.IdTaller = t.Id
LEFT JOIN CatReferenciaServicio crs ON mv.IdReferencia = crs.Id
WHERE c.Id IN (${placeholders})
AND mv.Id = ?
            `,
            [...ids, id],
          );
          break;
      }

      if (mantenimientos.length === 0) {
        throw new NotFoundException('Mantenimiento vehicular no encontrado');
      }

      const item = mantenimientos[0];

      const result: ApiResponseCommon = {
        data: [
          {
            id: Number(item.id),
            idInstalacion: item.idInstalacion
              ? Number(item.idInstalacion)
              : null,
            idReferencia: item.idReferencia ? Number(item.idReferencia) : null,
            servicioDescripcion: item.servicioDescripcion,
            notaServicio: item.notaServicio,
            idEstatus: item.idEstatus ? Number(item.idEstatus) : null,
            fechaInicio: item.fechaInicio,
            fechaFinal: item.fechaFinal,
            idTaller: item.idTaller ? Number(item.idTaller) : null,
            costo: item.costo ? Number(item.costo) : null,
            encargado: item.encargado,
            fhRegistro: item.fhRegistro,
            estatus: item.estatus,
            placaVehiculo: item.placaVehiculo || null,
            imagenVehiculo: item.imagenVehiculo || null,
            instalacion: item.idInstalacion
              ? { id: Number(item.idInstalacion) }
              : null,
            estatusMantenimiento: item.estatusMantenimientoId
              ? {
                  id: Number(item.estatusMantenimientoId),
                  nombre: item.estatusMantenimientoNombre,
                }
              : null,
            taller: item.tallerId
              ? {
                  id: Number(item.tallerId),
                  nombre: item.tallerNombre,
                }
              : null,
            referenciaServicio: item.referenciaServicioId
              ? {
                  id: Number(item.referenciaServicioId),
                  nombre: item.referenciaServicioNombre,
                }
              : null,
            ...((rol === 1 || rol === 2) && item.idClienteData
              ? {
                  cliente: {
                    id: Number(item.idClienteData),
                    nombre: item.nombreClienteData,
                    apellidoPaterno: item.apellidoPaternoCliente,
                    apellidoMaterno: item.apellidoMaternoCliente,
                    estatus: item.estatusCliente,
                  },
                }
              : {}),
          },
        ],
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error interno al buscar el mantenimiento vehicular',
      );
    }
  }

  async update(
    id: number,
    updateMantenimientoVehicularDto: UpdateMantenimientoVehicularDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const mantenimiento = await this.mantenimientoVehicularRepository.findOne(
        {
          where: { id: id },
        },
      );
      if (!mantenimiento) {
        throw new NotFoundException('Mantenimiento vehicular no encontrado');
      }

      // Validar claves foráneas si se proporcionan
      if (
        updateMantenimientoVehicularDto.idEstatus !== undefined &&
        updateMantenimientoVehicularDto.idEstatus !== null
      ) {
        const estatusExists =
          await this.catEstatusMantenimientoRepository.findOne({
            where: { id: updateMantenimientoVehicularDto.idEstatus },
          });
        if (!estatusExists) {
          throw new BadRequestException(
            `El estatus de mantenimiento con ID ${updateMantenimientoVehicularDto.idEstatus} no existe.`,
          );
        }
      }

      if (
        updateMantenimientoVehicularDto.idTaller !== undefined &&
        updateMantenimientoVehicularDto.idTaller !== null
      ) {
        const tallerExists = await this.talleresRepository.findOne({
          where: { id: updateMantenimientoVehicularDto.idTaller },
        });
        if (!tallerExists) {
          throw new BadRequestException(
            `El taller con ID ${updateMantenimientoVehicularDto.idTaller} no existe.`,
          );
        }
      }

      if (
        updateMantenimientoVehicularDto.idInstalacion !== undefined &&
        updateMantenimientoVehicularDto.idInstalacion !== null
      ) {
        const instalacionExists = await this.instalacionesRepository.findOne({
          where: { id: updateMantenimientoVehicularDto.idInstalacion },
        });
        if (!instalacionExists) {
          throw new BadRequestException(
            `La instalación con ID ${updateMantenimientoVehicularDto.idInstalacion} no existe.`,
          );
        }
      }

      if (
        updateMantenimientoVehicularDto.idReferencia !== undefined &&
        updateMantenimientoVehicularDto.idReferencia !== null
      ) {
        const referenciaExists =
          await this.catReferenciaServicioRepository.findOne({
            where: { id: updateMantenimientoVehicularDto.idReferencia },
          });
        if (!referenciaExists) {
          throw new BadRequestException(
            `La referencia de servicio con ID ${updateMantenimientoVehicularDto.idReferencia} no existe.`,
          );
        }
      }

      await this.mantenimientoVehicularRepository.update(
        id,
        updateMantenimientoVehicularDto,
      );
      const _mantenimientoResult =
        await this.mantenimientoVehicularRepository.findOne({
          where: { id: id },
        });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateMantenimientoVehicularDto };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoVehicular',
        `Se actualizó el mantenimiento vehicular con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        33,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Mantenimiento vehicular actualizado correctamente',
        data: {
          id: id,
          nombre: `Mantenimiento #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateMantenimientoVehicularDto };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoVehicular',
        `Error al actualizar mantenimiento vehicular con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        33,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al actualizar el mantenimiento vehicular.',
      );
    }
  }

  async desactivar(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const mantenimiento = await this.mantenimientoVehicularRepository.findOne(
        {
          where: { id: id },
        },
      );

      if (!mantenimiento) {
        throw new NotFoundException('Mantenimiento vehicular no encontrado');
      }

      await this.mantenimientoVehicularRepository.update(id, { estatus: 0 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoVehicular',
        `Se desactivó el mantenimiento vehicular con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        33,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Mantenimiento vehicular desactivado correctamente',
        estatus: { estatus: 0 },
        data: {
          id: id,
          nombre: `Mantenimiento #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoVehicular',
        `Error al desactivar mantenimiento vehicular con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        33,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al desactivar el mantenimiento vehicular.',
        error: error.message,
      });
    }
  }

  async activar(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const mantenimiento = await this.mantenimientoVehicularRepository.findOne(
        {
          where: { id: id },
        },
      );

      if (!mantenimiento) {
        throw new NotFoundException('Mantenimiento vehicular no encontrado');
      }

      if (mantenimiento.estatus === 1) {
        throw new BadRequestException(
          'El mantenimiento vehicular ya está activo',
        );
      }

      await this.mantenimientoVehicularRepository.update(id, { estatus: 1 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 1 };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoVehicular',
        `Se activó el mantenimiento vehicular con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        33,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Mantenimiento vehicular activado correctamente',
        estatus: { estatus: 1 },
        data: {
          id: id,
          nombre: `Mantenimiento #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 1 };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoVehicular',
        `Error al activar mantenimiento vehicular con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        33,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al activar el mantenimiento vehicular.',
        error: error.message,
      });
    }
  }

  async updateStatus(
    idUser: number,
    idMantenimiento: number,
    estatus: number,
  ): Promise<ApiCrudResponse> {
    try {
      const mantenimiento = await this.mantenimientoVehicularRepository.findOne(
        {
          where: { id: idMantenimiento },
        },
      );

      if (!mantenimiento) {
        throw new NotFoundException('Mantenimiento vehicular no encontrado');
      }

      await this.mantenimientoVehicularRepository.update(idMantenimiento, {
        idEstatus: estatus,
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: idMantenimiento, estatus: estatus };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoVehicular',
        `Se actualizó el estatus del mantenimiento vehicular con ID: ${idMantenimiento} a ${estatus}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        33, // ID del módulo de mantenimiento vehicular
        EstatusEnumBitcora.SUCCESS,
      );

      return {
        status: 'success',
        message:
          'Estatus del mantenimiento vehicular actualizado correctamente',
        estatus: { estatus: estatus },
        data: {
          id: idMantenimiento,
          nombre: `Mantenimiento #${idMantenimiento}`,
        },
      };
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: idMantenimiento, estatus: estatus };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoVehicular',
        `Error al actualizar estatus del mantenimiento vehicular con ID: ${idMantenimiento}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        33, // ID del módulo de mantenimiento vehicular
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar el estatus del mantenimiento vehicular.',
        error: error.message,
      });
    }
  }
}
