import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateIncidentesDto } from './dto/create-incidentes.dto';
import { UpdateIncidentesDto } from './dto/update-incidentes.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Incidentes } from 'src/entities/Incidentes';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Operadores } from 'src/entities/Operadores';
import { Repository, In } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { S3Service } from 'src/s3/s3.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';

@Injectable()
export class IncidentesService {
  constructor(
    @InjectRepository(Incidentes)
    private readonly incidentesRepository: Repository<Incidentes>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(Operadores)
    private readonly operadoresRepository: Repository<Operadores>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly s3Service: S3Service,
  ) { }

  async create(
    createIncidentesDto: CreateIncidentesDto,
    idUser: number,
    imagenFile?: Express.Multer.File,
  ): Promise<ApiCrudResponse> {
    try {
      // Validar claves foráneas
      const instalacionExists = await this.instalacionesRepository.findOne({
        where: { id: createIncidentesDto.idInstalacion },
      });
      if (!instalacionExists) {
        throw new BadRequestException(
          `La instalación con ID ${createIncidentesDto.idInstalacion} no existe.`,
        );
      }

      const operadorExists = await this.operadoresRepository.findOne({
        where: { id: createIncidentesDto.idOperador },
      });
      if (!operadorExists) {
        throw new BadRequestException(
          `El operador con ID ${createIncidentesDto.idOperador} no existe.`,
        );
      }

      // Subir imagen a S3 si se proporciona
      let imagenUrl: string | null = null;
      if (imagenFile) {
        const uploadResult = await this.s3Service.uploadFile(
          imagenFile,
          'Incidentes',
          idUser,
          36, // ID del módulo de incidentes (ajustar según corresponda)
        );
        imagenUrl = uploadResult.url;
      }

      // Crear el registro con los datos del DTO
      const dataToCreate = {
        ...createIncidentesDto,
        imagen: imagenUrl,
      };

      const create = this.incidentesRepository.create(
        dataToCreate,
      );
      const savedResult = await this.incidentesRepository.save(create);
      const saved = Array.isArray(savedResult) ? savedResult[0] : savedResult;

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createIncidentesDto };
      await this.bitacoraLogger.logToBitacora(
        'Incidentes',
        `Se creó un incidente con ID: ${saved.id}`,
        'CREATE',
        querylogger,
        idUser,
        36, // ID del módulo de incidentes
        EstatusEnumBitcora.SUCCESS,
      );

      const idIncidente = saved.id;
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Incidente creado correctamente',
        data: {
          id: Number(idIncidente),
          nombre: `Incidente #${idIncidente}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createIncidentesDto };
      await this.bitacoraLogger.logToBitacora(
        'Incidentes',
        `Error al crear incidente`,
        'CREATE',
        querylogger,
        idUser,
        36, // ID del módulo de incidentes
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al crear el incidente.',
      );
    }
  }

  async findAll(page: number, limit: number, idCliente: number, rol: number): Promise<ApiResponseCommon> {
    try {
      const whereCondition: any = {};

      // Filtrar por idCliente si el rol no es 1 o 2
      if (rol !== 1 && rol !== 2) {
        // Obtener las instalaciones del cliente
        const instalaciones = await this.instalacionesRepository.find({
          where: { idCliente: idCliente },
          select: ['id'],
        });
        const idsInstalaciones = instalaciones.map(inst => inst.id);

        // Si no hay instalaciones, retornar vacío
        if (idsInstalaciones.length === 0) {
          return {
            data: [],
            paginated: {
              total: 0,
              page,
              lastPage: 0,
            },
          };
        }

        whereCondition.idInstalacion = In(idsInstalaciones);
      }

      const [data, total] = await this.incidentesRepository.findAndCount({
        where: Object.keys(whereCondition).length > 0 ? whereCondition : undefined,
        relations: ['instalacion', 'instalacion.vehiculos', 'instalacion.idCliente2', 'operador', 'operador.idUsuario2'],
        order: { fhRegistro: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      // Forzamos ids a number
      const incidentes = data.map((item) => {
        const nombreOperador = item.operador?.idUsuario2
          ? `${item.operador.idUsuario2.nombre || ''} ${item.operador.idUsuario2.apellidoPaterno || ''} ${item.operador.idUsuario2.apellidoMaterno || ''}`.trim() || null
          : null;

        const nombreCliente = item.instalacion?.idCliente2
          ? `${item.instalacion.idCliente2.nombre || ''} ${item.instalacion.idCliente2.apellidoPaterno || ''} ${item.instalacion.idCliente2.apellidoMaterno || ''}`.trim() || null
          : null;

        return {
          id: Number(item.id),
          idInstalacion: Number(item.idInstalacion),
          fhRegistro: item.fhRegistro,
          idOperador: Number(item.idOperador),
          incidente: item.incidente,
          idEstatus: item.idEstatus ? Number(item.idEstatus) : null,
          estatus: item.estatus,
          imagen: item.imagen,
          placaVehiculo: item.instalacion?.vehiculos?.placa || null,
          imagenVehiculo: item.instalacion?.vehiculos?.foto || null,
          nombreOperador: nombreOperador,
          nombreCliente: nombreCliente,
        };
      });

      const result: ApiResponseCommon = {
        data: incidentes,
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
        error.message || 'Error al obtener los incidentes',
      );
    }
  }

  async findOne(id: number, idCliente: number, rol: number): Promise<ApiResponseCommon> {
    try {
      const incidente = await this.incidentesRepository.findOne({
        where: { id: id },
        relations: ['instalacion', 'instalacion.vehiculos', 'instalacion.idCliente2', 'operador', 'operador.idUsuario2'],
      });

      // Verificar que el incidente pertenece al cliente si el rol no es 1 o 2
      if (rol !== 1 && rol !== 2) {
        if (!incidente || incidente.instalacion?.idCliente !== idCliente) {
          throw new NotFoundException('Incidente no encontrado');
        }
      }

      if (!incidente) {
        throw new NotFoundException('Incidente no encontrado');
      }

      const nombreOperador = incidente.operador?.idUsuario2
        ? `${incidente.operador.idUsuario2.nombre || ''} ${incidente.operador.idUsuario2.apellidoPaterno || ''} ${incidente.operador.idUsuario2.apellidoMaterno || ''}`.trim() || null
        : null;

      const nombreCliente = incidente.instalacion?.idCliente2
        ? `${incidente.instalacion.idCliente2.nombre || ''} ${incidente.instalacion.idCliente2.apellidoPaterno || ''} ${incidente.instalacion.idCliente2.apellidoMaterno || ''}`.trim() || null
        : null;

      const result: ApiResponseCommon = {
        data: [
          {
            id: Number(incidente.id),
            idInstalacion: Number(incidente.idInstalacion),
            fhRegistro: incidente.fhRegistro,
            idOperador: Number(incidente.idOperador),
            incidente: incidente.incidente,
            idEstatus: incidente.idEstatus ? Number(incidente.idEstatus) : null,
            estatus: incidente.estatus,
            imagen: incidente.imagen,
            placaVehiculo: incidente.instalacion?.vehiculos?.placa || null,
            imagenVehiculo: incidente.instalacion?.vehiculos?.foto || null,
            nombreOperador: nombreOperador,
            nombreCliente: nombreCliente,
          },
        ],
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error interno al buscar el incidente',
      );
    }
  }

  async update(
    id: number,
    updateIncidentesDto: UpdateIncidentesDto,
    idUser: number,
    imagenFile?: Express.Multer.File,
  ): Promise<ApiCrudResponse> {
    try {
      const incidente = await this.incidentesRepository.findOne({
        where: { id: id },
      });
      if (!incidente) {
        throw new NotFoundException('Incidente no encontrado');
      }

      // Subir imagen a S3 si se proporciona un archivo nuevo
      let imagenUrl: string | null = null;
      if (imagenFile) {
        const uploadResult = await this.s3Service.uploadFile(
          imagenFile,
          'Incidentes',
          idUser,
          36, // ID del módulo de incidentes
        );
        imagenUrl = uploadResult.url;
      }

      // Validar claves foráneas si se proporcionan
      if (updateIncidentesDto.idInstalacion !== undefined && updateIncidentesDto.idInstalacion !== null) {
        const instalacionExists = await this.instalacionesRepository.findOne({
          where: { id: updateIncidentesDto.idInstalacion },
        });
        if (!instalacionExists) {
          throw new BadRequestException(
            `La instalación con ID ${updateIncidentesDto.idInstalacion} no existe.`,
          );
        }
      }

      if (updateIncidentesDto.idOperador !== undefined && updateIncidentesDto.idOperador !== null) {
        const operadorExists = await this.operadoresRepository.findOne({
          where: { id: updateIncidentesDto.idOperador },
        });
        if (!operadorExists) {
          throw new BadRequestException(
            `El operador con ID ${updateIncidentesDto.idOperador} no existe.`,
          );
        }
      }

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

      // Verificar y agregar idInstalacion
      const idInstalacionNum = toNumber(updateIncidentesDto.idInstalacion);
      if (idInstalacionNum !== null) {
        dataToUpdate.idInstalacion = idInstalacionNum;
      }

      // Verificar y agregar idOperador
      const idOperadorNum = toNumber(updateIncidentesDto.idOperador);
      if (idOperadorNum !== null) {
        dataToUpdate.idOperador = idOperadorNum;
      }

      // Verificar y agregar incidente
      if (hasValue(updateIncidentesDto.incidente)) {
        dataToUpdate.incidente = String(updateIncidentesDto.incidente).trim();
      }

      // Verificar y agregar idEstatus
      const idEstatusNum = toNumber(updateIncidentesDto.idEstatus);
      if (idEstatusNum !== null) {
        dataToUpdate.idEstatus = idEstatusNum;
      }

      // Verificar y agregar estatus
      const estatusNum = toNumber(updateIncidentesDto.estatus);
      if (estatusNum !== null) {
        dataToUpdate.estatus = estatusNum;
      }

      // Verificar y agregar imagen
      // Si se subió un archivo nuevo, usar su URL
      // Si no, pero viene un string en el DTO, usar ese string (URL existente)
      // Si no viene nada, no actualizar este campo
      if (imagenUrl) {
        dataToUpdate.imagen = imagenUrl;
      } else if (hasValue(updateIncidentesDto.imagen)) {
        dataToUpdate.imagen = String(updateIncidentesDto.imagen).trim();
      }

      // Verificar y agregar fhRegistro
      if (hasValue(updateIncidentesDto.fhRegistro)) {
        dataToUpdate.fhRegistro = updateIncidentesDto.fhRegistro;
      }

      // Solo actualizar si hay campos para actualizar
      if (Object.keys(dataToUpdate).length > 0) {
        await this.incidentesRepository.update(
          id,
          dataToUpdate,
        );
      }
      const incidenteResult = await this.incidentesRepository.findOne({
        where: { id: id },
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateIncidentesDto };
      await this.bitacoraLogger.logToBitacora(
        'Incidentes',
        `Se actualizó el incidente con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        36, // ID del módulo de incidentes
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Incidente actualizado correctamente',
        data: {
          id: id,
          nombre: `Incidente #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateIncidentesDto };
      await this.bitacoraLogger.logToBitacora(
        'Incidentes',
        `Error al actualizar incidente con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        36, // ID del módulo de incidentes
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al actualizar el incidente.',
      );
    }
  }

  async desactivar(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const incidente = await this.incidentesRepository.findOne({
        where: { id: id },
      });

      if (!incidente) {
        throw new NotFoundException('Incidente no encontrado');
      }

      await this.incidentesRepository.update(id, { estatus: 0 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Incidentes',
        `Se desactivó el incidente con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        36, // ID del módulo de incidentes
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Incidente desactivado correctamente',
        estatus: { estatus: 0 },
        data: {
          id: id,
          nombre: `Incidente #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Incidentes',
        `Error al desactivar incidente con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        36, // ID del módulo de incidentes
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al desactivar el incidente.',
        error: error.message,
      });
    }
  }

  async activar(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const incidente = await this.incidentesRepository.findOne({
        where: { id: id },
      });

      if (!incidente) {
        throw new NotFoundException('Incidente no encontrado');
      }

      if (incidente.estatus === 1) {
        throw new BadRequestException('El incidente ya está activo');
      }

      await this.incidentesRepository.update(id, { estatus: 1 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 1 };
      await this.bitacoraLogger.logToBitacora(
        'Incidentes',
        `Se activó el incidente con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        36, // ID del módulo de incidentes
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Incidente activado correctamente',
        estatus: { estatus: 1 },
        data: {
          id: id,
          nombre: `Incidente #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 1 };
      await this.bitacoraLogger.logToBitacora(
        'Incidentes',
        `Error al activar incidente con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        36, // ID del módulo de incidentes
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al activar el incidente.',
        error: error.message,
      });
    }
  }

  async updateStatus(idUser: number, idIncidente: number, estatus: number): Promise<ApiCrudResponse> {
    try {
      const incidente = await this.incidentesRepository.findOne({
        where: { id: idIncidente },
      });

      if (!incidente) {
        throw new NotFoundException('Incidente no encontrado');
      }

      await this.incidentesRepository.update(idIncidente, { idEstatus: estatus });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: idIncidente, estatus: estatus };
      await this.bitacoraLogger.logToBitacora(
        'Incidentes',
        `Se actualizó el estatus del incidente con ID: ${incidente.incidente} a ${estatus}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        36, // ID del módulo de incidentes
        EstatusEnumBitcora.SUCCESS,
      );

      return {
        status: 'success',
        message: 'Estatus del incidente actualizado correctamente',
        estatus: { estatus: estatus },
        data: {
          id: idIncidente,
          nombre: `Incidente #${incidente.incidente}`,
        },
      };
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: idIncidente, estatus: estatus };
      await this.bitacoraLogger.logToBitacora(
        'Incidentes',
        `Error al actualizar estatus del incidente con ID: ${idIncidente}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        36, // ID del módulo de incidentes
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar el estatus del incidente.',
        error: error.message,
      });
    }
  }
}
