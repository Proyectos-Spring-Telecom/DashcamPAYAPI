import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateVerificacionesDto } from './dto/create-verificaciones.dto';
import { UpdateVerificacionesDto } from './dto/update-verificaciones.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Verificaciones } from 'src/entities/Verificaciones';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Operadores } from 'src/entities/Operadores';
import { CatTipoVerificaciones } from 'src/entities/CatTipoVerificaciones';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { S3Service } from 'src/s3/s3.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { CatCategoriaMantenimientoMecanico } from 'src/entities/CatCategoriaMantenimientoMecanico';
import { Clientes } from 'src/entities/Clientes';

@Injectable()
export class VerificacionesService {
  constructor(
    @InjectRepository(Verificaciones)
    private readonly verificacionesRepository: Repository<Verificaciones>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(Operadores)
    private readonly operadoresRepository: Repository<Operadores>,
    @InjectRepository(CatTipoVerificaciones)
    private readonly catTipoVerificacionesRepository: Repository<CatTipoVerificaciones>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly s3Service: S3Service,
    @InjectRepository(CatCategoriaMantenimientoMecanico)
    private readonly catCategoriaMantenimientoMecanicoRepository: Repository<CatCategoriaMantenimientoMecanico>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
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
    createVerificacionesDto: CreateVerificacionesDto,
    idUser: number,
    notaVerificacionFile?: Express.Multer.File,
  ): Promise<ApiCrudResponse> {
    try {
      // Validar claves foráneas si se proporcionan
      if (
        createVerificacionesDto.idInstalacion !== undefined &&
        createVerificacionesDto.idInstalacion !== null
      ) {
        const instalacionExists = await this.instalacionesRepository.findOne({
          where: { id: createVerificacionesDto.idInstalacion },
        });
        if (!instalacionExists) {
          throw new BadRequestException(
            `La instalación con ID ${createVerificacionesDto.idInstalacion} no existe.`,
          );
        }
      }

      if (
        createVerificacionesDto.idOperador !== undefined &&
        createVerificacionesDto.idOperador !== null
      ) {
        const operadorExists = await this.operadoresRepository.findOne({
          where: { id: createVerificacionesDto.idOperador },
        });
        if (!operadorExists) {
          throw new BadRequestException(
            `El operador con ID ${createVerificacionesDto.idOperador} no existe.`,
          );
        }
      }

      if (
        createVerificacionesDto.idTipoVerificacion !== undefined &&
        createVerificacionesDto.idTipoVerificacion !== null
      ) {
        const tipoVerificacionExists =
          await this.catTipoVerificacionesRepository.findOne({
            where: { id: createVerificacionesDto.idTipoVerificacion },
          });
        if (!tipoVerificacionExists) {
          throw new BadRequestException(
            `El tipo de verificación con ID ${createVerificacionesDto.idTipoVerificacion} no existe.`,
          );
        }
      }

      // Subir imagen de notaVerificacion a S3 si se proporciona
      let notaVerificacionUrl: string | null = null;
      if (notaVerificacionFile) {
        const uploadResult = await this.s3Service.uploadFile(
          notaVerificacionFile,
          'Verificaciones',
          idUser,
          6, // ID del módulo de verificaciones (ajustar según corresponda)
        );
        notaVerificacionUrl = uploadResult.url;
      }

      // Convertir fechas de formato ISO a formato DATE (YYYY-MM-DD)
      const formatDateForDB = (
        dateString: string | undefined,
      ): string | undefined => {
        if (!dateString) return undefined;
        // Si ya está en formato YYYY-MM-DD, retornarlo
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
          return dateString;
        }
        // Si está en formato ISO, extraer solo la parte de la fecha
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return undefined;
        return date.toISOString().split('T')[0];
      };

      // Crear el registro con los datos del DTO
      const dataToCreate = {
        ...createVerificacionesDto,
        verificacionActual: formatDateForDB(
          createVerificacionesDto.verificacionActual,
        ),
        proximaVerificacion: formatDateForDB(
          createVerificacionesDto.proximaVerificacion,
        ),
        notaVerificacion: notaVerificacionUrl,
      };

      const create = this.verificacionesRepository.create(dataToCreate);
      const savedResult = await this.verificacionesRepository.save(create);
      const saved = Array.isArray(savedResult) ? savedResult[0] : savedResult;

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createVerificacionesDto };
      await this.bitacoraLogger.logToBitacora(
        'Verificaciones',
        `Se creó una verificación con ID: ${saved.id}`,
        'CREATE',
        querylogger,
        idUser,
        6, // ID del módulo de verificaciones
        EstatusEnumBitcora.SUCCESS,
      );

      const idVerificacion = saved.id;
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Verificación creada correctamente',
        data: {
          id: Number(idVerificacion),
          nombre: `Verificación #${idVerificacion}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createVerificacionesDto };
      await this.bitacoraLogger.logToBitacora(
        'Verificaciones',
        `Error al crear verificación`,
        'CREATE',
        querylogger,
        idUser,
        6, // ID del módulo de verificaciones
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al crear la verificación.',
      );
    }
  }

  private async transformEvaluacion(evaluacion: any): Promise<any> {
    if (!evaluacion || typeof evaluacion !== 'object') {
      return null;
    }

    // Si evaluacion tiene categorías, expandirlas con sus nombres y características
    if (Array.isArray(evaluacion.categorias) || evaluacion.categoria) {
      // Obtener todas las categorías con sus características
      const categorias =
        await this.catCategoriaMantenimientoMecanicoRepository.find({
          relations: ['caracteristicasEvaluacion'],
        });

      // Crear un mapa de categorías por ID
      const categoriasMap = new Map();
      categorias.forEach((cat) => {
        categoriasMap.set(cat.id, {
          id: Number(cat.id),
          nombre: cat.nombre,
          caracteristicasEvaluacion:
            cat.caracteristicasEvaluacion?.map((car) => ({
              id: Number(car.id),
              nombre: car.nombre,
              idCatCategoriaMantenimientoMecanico: Number(
                car.idCatCategoriaMantenimientoMecanico,
              ),
              validado: false,
            })) || [],
        });
      });

      // Si evaluacion tiene un array de categorías
      if (Array.isArray(evaluacion.categorias)) {
        return {
          categorias: evaluacion.categorias.map((catEval: any) => {
            const categoria = categoriasMap.get(
              catEval.id || catEval.categoria,
            );
            if (categoria) {
              return {
                ...categoria,
                caracteristicasEvaluacion:
                  categoria.caracteristicasEvaluacion.map((car: any) => {
                    const carEval = catEval.caracteristicas?.find(
                      (c: any) => c.id === car.id,
                    );
                    return {
                      ...car,
                      validado: carEval?.validado || false,
                      valor: carEval?.valor || null,
                    };
                  }),
              };
            }
            return catEval;
          }),
        };
      }

      // Si evaluacion tiene una sola categoría
      if (evaluacion.categoria) {
        const categoria = categoriasMap.get(evaluacion.categoria);
        if (categoria) {
          return {
            categoria: {
              ...categoria,
              caracteristicasEvaluacion:
                categoria.caracteristicasEvaluacion.map((car: any) => {
                  const carEval = evaluacion.caracteristicas?.find(
                    (c: any) => c.id === car.id,
                  );
                  return {
                    ...car,
                    validado: carEval?.validado || false,
                    valor: carEval?.valor || null,
                  };
                }),
            },
          };
        }
      }
    }

    // Si no tiene el formato esperado, devolver el JSON original
    return evaluacion;
  }

  async findAll(
    page: number,
    limit: number,
    idCliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let verificaciones;
      let totalResult;

      switch (rol) {
        case 1:
        case 2:
          // Consulta de datos paginados Usuario SuperAdministrador/Administrador
          verificaciones = await this.verificacionesRepository.query(
            `
SELECT
  v.Id AS id,
  DATE_FORMAT(v.VerificacionActual, '%Y-%m-%d') AS verificacionActual,
  DATE_FORMAT(v.ProximaVerificacion, '%Y-%m-%d') AS proximaVerificacion,
  v.IdInstalacion AS idInstalacion,
  v.IdOperador AS idOperador,
  v.Estatus AS estatus,
  v.NotaVerificacion AS notaVerificacion,
  v.FHRegistro AS fhRegistro,
  v.IdTipoVerificacion AS idTipoVerificacion,
  NULL AS evaluacion,
  ct.Nombre AS nombreTipoVerificacion,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  CONCAT(
    IFNULL(u.Nombre, ''),
    IFNULL(CONCAT(' ', u.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', u.ApellidoMaterno), '')
  ) AS nombreOperador,
  CONCAT(
    IFNULL(c.Nombre, ''),
    IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
  ) AS nombreCliente,
  c.Id AS idClienteData,
  c.Nombre AS nombreClienteData,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente
FROM Verificaciones v
INNER JOIN Instalaciones i ON v.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN Operadores o ON v.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id
LEFT JOIN CatTipoVerificaciones ct ON v.IdTipoVerificacion = ct.Id
ORDER BY v.FHRegistro DESC
LIMIT ? OFFSET ?;
            `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.verificacionesRepository.query(
            `
SELECT COUNT(*) AS total
FROM Verificaciones v
INNER JOIN Instalaciones i ON v.IdInstalacion = i.Id
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
          verificaciones = await this.verificacionesRepository.query(
            `
SELECT
  v.Id AS id,
  DATE_FORMAT(v.VerificacionActual, '%Y-%m-%d') AS verificacionActual,
  DATE_FORMAT(v.ProximaVerificacion, '%Y-%m-%d') AS proximaVerificacion,
  v.IdInstalacion AS idInstalacion,
  v.IdOperador AS idOperador,
  v.Estatus AS estatus,
  v.NotaVerificacion AS notaVerificacion,
  v.FHRegistro AS fhRegistro,
  v.IdTipoVerificacion AS idTipoVerificacion,
  NULL AS evaluacion,
  ct.Nombre AS nombreTipoVerificacion,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  CONCAT(
    IFNULL(u.Nombre, ''),
    IFNULL(CONCAT(' ', u.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', u.ApellidoMaterno), '')
  ) AS nombreOperador,
  CONCAT(
    IFNULL(c.Nombre, ''),
    IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
  ) AS nombreCliente
FROM Verificaciones v
INNER JOIN Instalaciones i ON v.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN Operadores o ON v.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id
LEFT JOIN CatTipoVerificaciones ct ON v.IdTipoVerificacion = ct.Id
WHERE c.Id IN (${placeholders})
ORDER BY v.FHRegistro DESC
LIMIT ? OFFSET ?;
            `,
            [...ids, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.verificacionesRepository.query(
            `
SELECT COUNT(*) AS total
FROM Verificaciones v
INNER JOIN Instalaciones i ON v.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
WHERE c.Id IN (${placeholders})
            `,
            [...ids],
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      // Transformar evaluacion al formato de categorias-mantenimiento-mecanico
      const verificacionesTransformadas = await Promise.all(
        verificaciones.map(async (item: any) => {
          let evaluacionTransformada = null;
          if (item.evaluacion) {
            try {
              const evaluacionJson =
                typeof item.evaluacion === 'string'
                  ? JSON.parse(item.evaluacion)
                  : item.evaluacion;
              evaluacionTransformada =
                await this.transformEvaluacion(evaluacionJson);
            } catch {
              evaluacionTransformada = item.evaluacion;
            }
          }

          return {
            id: Number(item.id),
            verificacionActual: item.verificacionActual,
            proximaVerificacion: item.proximaVerificacion,
            idInstalacion: item.idInstalacion
              ? Number(item.idInstalacion)
              : null,
            idOperador: item.idOperador ? Number(item.idOperador) : null,
            estatus: item.estatus,
            notaVerificacion: item.notaVerificacion,
            fhRegistro: item.fhRegistro,
            idTipoVerificacion: item.idTipoVerificacion
              ? Number(item.idTipoVerificacion)
              : null,
            evaluacion: evaluacionTransformada,
            nombreTipoVerificacion: item.nombreTipoVerificacion?.trim() || null,
            placaVehiculo: item.placaVehiculo || null,
            imagenVehiculo: item.imagenVehiculo || null,
            nombreOperador: item.nombreOperador?.trim() || null,
            nombreCliente: item.nombreCliente?.trim() || null,
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
          };
        }),
      );

      const result: ApiResponseCommon = {
        data: verificacionesTransformadas,
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
        error.message || 'Error al obtener las verificaciones',
      );
    }
  }

  async findOne(
    id: number,
    idCliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      let verificaciones;

      switch (rol) {
        case 1:
        case 2:
          // Consulta para SuperAdministrador/Administrador
          verificaciones = await this.verificacionesRepository.query(
            `
SELECT
  v.Id AS id,
  DATE_FORMAT(v.VerificacionActual, '%Y-%m-%d') AS verificacionActual,
  DATE_FORMAT(v.ProximaVerificacion, '%Y-%m-%d') AS proximaVerificacion,
  v.IdInstalacion AS idInstalacion,
  v.IdOperador AS idOperador,
  v.Estatus AS estatus,
  v.NotaVerificacion AS notaVerificacion,
  v.FHRegistro AS fhRegistro,
  v.IdTipoVerificacion AS idTipoVerificacion,
  NULL AS evaluacion,
  ct.Nombre AS nombreTipoVerificacion,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  CONCAT(
    IFNULL(u.Nombre, ''),
    IFNULL(CONCAT(' ', u.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', u.ApellidoMaterno), '')
  ) AS nombreOperador,
  CONCAT(
    IFNULL(c.Nombre, ''),
    IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
  ) AS nombreCliente,
  c.Id AS idClienteData,
  c.Nombre AS nombreClienteData,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente
FROM Verificaciones v
INNER JOIN Instalaciones i ON v.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN Operadores o ON v.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id
LEFT JOIN CatTipoVerificaciones ct ON v.IdTipoVerificacion = ct.Id
WHERE v.Id = ?
            `,
            [id],
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(idCliente);
          if (ids.length === 0) {
            throw new NotFoundException('Verificación no encontrada');
          }

          // Consulta para resto de usuarios
          verificaciones = await this.verificacionesRepository.query(
            `
SELECT
  v.Id AS id,
  DATE_FORMAT(v.VerificacionActual, '%Y-%m-%d') AS verificacionActual,
  DATE_FORMAT(v.ProximaVerificacion, '%Y-%m-%d') AS proximaVerificacion,
  v.IdInstalacion AS idInstalacion,
  v.IdOperador AS idOperador,
  v.Estatus AS estatus,
  v.NotaVerificacion AS notaVerificacion,
  v.FHRegistro AS fhRegistro,
  v.IdTipoVerificacion AS idTipoVerificacion,
  NULL AS evaluacion,
  ct.Nombre AS nombreTipoVerificacion,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  CONCAT(
    IFNULL(u.Nombre, ''),
    IFNULL(CONCAT(' ', u.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', u.ApellidoMaterno), '')
  ) AS nombreOperador,
  CONCAT(
    IFNULL(c.Nombre, ''),
    IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
  ) AS nombreCliente
FROM Verificaciones v
INNER JOIN Instalaciones i ON v.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN Operadores o ON v.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id
LEFT JOIN CatTipoVerificaciones ct ON v.IdTipoVerificacion = ct.Id
WHERE c.Id IN (${placeholders})
AND v.Id = ?
            `,
            [...ids, id],
          );
          break;
      }

      if (verificaciones.length === 0) {
        throw new NotFoundException('Verificación no encontrada');
      }

      const item = verificaciones[0];

      // Transformar evaluacion al formato de categorias-mantenimiento-mecanico
      let evaluacionTransformada = null;
      if (item.evaluacion) {
        try {
          const evaluacionJson =
            typeof item.evaluacion === 'string'
              ? JSON.parse(item.evaluacion)
              : item.evaluacion;
          evaluacionTransformada =
            await this.transformEvaluacion(evaluacionJson);
        } catch {
          evaluacionTransformada = item.evaluacion;
        }
      }

      const result: ApiResponseCommon = {
        data: [
          {
            id: Number(item.id),
            verificacionActual: item.verificacionActual,
            proximaVerificacion: item.proximaVerificacion,
            idInstalacion: item.idInstalacion
              ? Number(item.idInstalacion)
              : null,
            idOperador: item.idOperador ? Number(item.idOperador) : null,
            estatus: item.estatus,
            notaVerificacion: item.notaVerificacion,
            fhRegistro: item.fhRegistro,
            idTipoVerificacion: item.idTipoVerificacion
              ? Number(item.idTipoVerificacion)
              : null,
            evaluacion: evaluacionTransformada,
            nombreTipoVerificacion: item.nombreTipoVerificacion?.trim() || null,
            placaVehiculo: item.placaVehiculo || null,
            imagenVehiculo: item.imagenVehiculo || null,
            nombreOperador: item.nombreOperador?.trim() || null,
            nombreCliente: item.nombreCliente?.trim() || null,
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
        'Error interno al buscar la verificación',
      );
    }
  }

  async update(
    id: number,
    updateVerificacionesDto: UpdateVerificacionesDto,
    idUser: number,
    notaVerificacionFile?: Express.Multer.File,
  ): Promise<ApiCrudResponse> {
    try {
      const verificacion = await this.verificacionesRepository.findOne({
        where: { id: id },
      });
      if (!verificacion) {
        throw new NotFoundException('Verificación no encontrada');
      }

      // Validar claves foráneas si se proporcionan
      if (
        updateVerificacionesDto.idInstalacion !== undefined &&
        updateVerificacionesDto.idInstalacion !== null
      ) {
        const instalacionExists = await this.instalacionesRepository.findOne({
          where: { id: updateVerificacionesDto.idInstalacion },
        });
        if (!instalacionExists) {
          throw new BadRequestException(
            `La instalación con ID ${updateVerificacionesDto.idInstalacion} no existe.`,
          );
        }
      }

      if (
        updateVerificacionesDto.idOperador !== undefined &&
        updateVerificacionesDto.idOperador !== null
      ) {
        const operadorExists = await this.operadoresRepository.findOne({
          where: { id: updateVerificacionesDto.idOperador },
        });
        if (!operadorExists) {
          throw new BadRequestException(
            `El operador con ID ${updateVerificacionesDto.idOperador} no existe.`,
          );
        }
      }

      if (
        updateVerificacionesDto.idTipoVerificacion !== undefined &&
        updateVerificacionesDto.idTipoVerificacion !== null
      ) {
        const tipoVerificacionExists =
          await this.catTipoVerificacionesRepository.findOne({
            where: { id: updateVerificacionesDto.idTipoVerificacion },
          });
        if (!tipoVerificacionExists) {
          throw new BadRequestException(
            `El tipo de verificación con ID ${updateVerificacionesDto.idTipoVerificacion} no existe.`,
          );
        }
      }

      // Subir imagen de notaVerificacion a S3 si se proporciona un archivo nuevo
      let notaVerificacionUrl: string | null = null;
      if (notaVerificacionFile) {
        const uploadResult = await this.s3Service.uploadFile(
          notaVerificacionFile,
          'Verificaciones',
          idUser,
          6, // ID del módulo de verificaciones (ajustar según corresponda)
        );
        notaVerificacionUrl = uploadResult.url;
      }

      // Convertir fechas de formato ISO a formato DATE (YYYY-MM-DD)
      const formatDateForDB = (
        dateString: string | undefined,
      ): string | undefined => {
        if (!dateString) return undefined;
        // Si ya está en formato YYYY-MM-DD, retornarlo
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
          return dateString;
        }
        // Si está en formato ISO, extraer solo la parte de la fecha
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return undefined;
        return date.toISOString().split('T')[0];
      };

      // Preparar datos para actualizar, filtrando campos undefined, null y strings vacíos
      // (FormData puede enviar strings vacíos en lugar de undefined)
      const dataToUpdate: any = {};

      // Helper para verificar si un valor está presente y no es vacío
      const hasValue = (value: any): boolean => {
        return value !== undefined && value !== null && value !== '';
      };

      // Helper para convertir a número si es posible
      const toNumber = (value: any): number | null => {
        if (value === null || value === undefined || value === '') return null;
        const num = Number(value);
        return isNaN(num) ? null : num;
      };

      // Verificar y agregar verificacionActual
      if (hasValue(updateVerificacionesDto.verificacionActual)) {
        const fechaFormateada = formatDateForDB(
          String(updateVerificacionesDto.verificacionActual),
        );
        if (fechaFormateada) {
          dataToUpdate.verificacionActual = fechaFormateada;
        }
      }

      // Verificar y agregar proximaVerificacion
      if (hasValue(updateVerificacionesDto.proximaVerificacion)) {
        const fechaFormateada = formatDateForDB(
          String(updateVerificacionesDto.proximaVerificacion),
        );
        if (fechaFormateada) {
          dataToUpdate.proximaVerificacion = fechaFormateada;
        }
      }

      // Verificar y agregar idInstalacion
      const idInstalacionNum = toNumber(updateVerificacionesDto.idInstalacion);
      if (idInstalacionNum !== null) {
        dataToUpdate.idInstalacion = idInstalacionNum;
      }

      // Verificar y agregar idOperador
      const idOperadorNum = toNumber(updateVerificacionesDto.idOperador);
      if (idOperadorNum !== null) {
        dataToUpdate.idOperador = idOperadorNum;
      }

      // Verificar y agregar estatus
      const estatusNum = toNumber(updateVerificacionesDto.estatus);
      if (estatusNum !== null) {
        dataToUpdate.estatus = estatusNum;
      }

      // Verificar y agregar notaVerificacion
      // Si se subió un archivo nuevo, usar su URL
      // Si no, pero viene un string en el DTO, usar ese string (URL existente)
      // Si no viene nada, no actualizar este campo
      if (notaVerificacionUrl) {
        dataToUpdate.notaVerificacion = notaVerificacionUrl;
      } else if (hasValue(updateVerificacionesDto.notaVerificacion)) {
        dataToUpdate.notaVerificacion = String(
          updateVerificacionesDto.notaVerificacion,
        ).trim();
      }

      // Verificar y agregar idTipoVerificacion
      const idTipoVerificacionNum = toNumber(
        updateVerificacionesDto.idTipoVerificacion,
      );
      if (idTipoVerificacionNum !== null) {
        dataToUpdate.idTipoVerificacion = idTipoVerificacionNum;
      }

      // Verificar y agregar evaluacion
      if (
        updateVerificacionesDto.evaluacion !== undefined &&
        updateVerificacionesDto.evaluacion !== null
      ) {
        // Si es string, intentar parsearlo como JSON
        const evaluacionValue: any = updateVerificacionesDto.evaluacion;
        if (typeof evaluacionValue === 'string') {
          const trimmed = String(evaluacionValue).trim();
          if (trimmed !== '') {
            try {
              dataToUpdate.evaluacion = JSON.parse(trimmed);
            } catch {
              // Si no es JSON válido, no agregarlo
            }
          }
        } else if (typeof evaluacionValue === 'object') {
          dataToUpdate.evaluacion = evaluacionValue;
        }
      }

      // Solo actualizar si hay campos para actualizar
      if (Object.keys(dataToUpdate).length > 0) {
        await this.verificacionesRepository.update(id, dataToUpdate);
      }

      const _verificacionResult = await this.verificacionesRepository.findOne({
        where: { id: id },
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateVerificacionesDto };
      await this.bitacoraLogger.logToBitacora(
        'Verificaciones',
        `Se actualizó la verificación con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        6, // ID del módulo de verificaciones
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Verificación actualizada correctamente',
        data: {
          id: id,
          nombre: `Verificación #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateVerificacionesDto };
      await this.bitacoraLogger.logToBitacora(
        'Verificaciones',
        `Error al actualizar verificación con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        6, // ID del módulo de verificaciones
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al actualizar la verificación.',
      );
    }
  }

  async desactivar(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const verificacion = await this.verificacionesRepository.findOne({
        where: { id: id },
      });

      if (!verificacion) {
        throw new NotFoundException('Verificación no encontrada');
      }

      await this.verificacionesRepository.update(id, { estatus: 0 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Verificaciones',
        `Se desactivó la verificación con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        6, // ID del módulo de verificaciones
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Verificación desactivada correctamente',
        estatus: { estatus: 0 },
        data: {
          id: id,
          nombre: `Verificación #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Verificaciones',
        `Error al desactivar verificación con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        6, // ID del módulo de verificaciones
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al desactivar la verificación.',
        error: error.message,
      });
    }
  }

  async activar(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const verificacion = await this.verificacionesRepository.findOne({
        where: { id: id },
      });

      if (!verificacion) {
        throw new NotFoundException('Verificación no encontrada');
      }

      if (verificacion.estatus === 1) {
        throw new BadRequestException('La verificación ya está activa');
      }

      await this.verificacionesRepository.update(id, { estatus: 1 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 1 };
      await this.bitacoraLogger.logToBitacora(
        'Verificaciones',
        `Se activó la verificación con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        6, // ID del módulo de verificaciones
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Verificación activada correctamente',
        estatus: { estatus: 1 },
        data: {
          id: id,
          nombre: `Verificación #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 1 };
      await this.bitacoraLogger.logToBitacora(
        'Verificaciones',
        `Error al activar verificación con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        6, // ID del módulo de verificaciones
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al activar la verificación.',
        error: error.message,
      });
    }
  }

  async getCategoriasMantenimientoMecanico(): Promise<ApiResponseCommon> {
    try {
      const categorias =
        await this.catCategoriaMantenimientoMecanicoRepository.find({
          relations: ['caracteristicasEvaluacion'],
        });

      // Transformar los datos para asegurar que los IDs sean números
      const categoriasTransformadas = categorias.map((categoria) => ({
        id: Number(categoria.id),
        nombre: categoria.nombre,
        caracteristicasEvaluacion:
          categoria.caracteristicasEvaluacion?.map((caracteristica) => ({
            id: Number(caracteristica.id),
            nombre: caracteristica.nombre,
            idCatCategoriaMantenimientoMecanico: Number(
              caracteristica.idCatCategoriaMantenimientoMecanico,
            ),
            validado: false,
          })) || [],
      }));

      return {
        data: categoriasTransformadas,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        error.message ||
          'Error al obtener las categorías de mantenimiento mecánico',
      );
    }
  }
}
