import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCatTipoVerificacionesDto } from './dto/create-cat-tipo-verificaciones.dto';
import { UpdateCatTipoVerificacionesDto } from './dto/update-cat-tipo-verificaciones.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { CatTipoVerificaciones } from 'src/entities/CatTipoVerificaciones';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';

@Injectable()
export class CatTipoVerificacionesService {
  constructor(
    @InjectRepository(CatTipoVerificaciones)
    private readonly catTipoVerificacionesRepository: Repository<CatTipoVerificaciones>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(
    createCatTipoVerificacionesDto: CreateCatTipoVerificacionesDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const tipoVerificacion =
        await this.catTipoVerificacionesRepository.findOne({
          where: { nombre: createCatTipoVerificacionesDto.nombre },
        });
      if (tipoVerificacion) {
        throw new BadRequestException('El tipo de verificación ya existe');
      }
      const create = await this.catTipoVerificacionesRepository.create(
        createCatTipoVerificacionesDto,
      );
      const saved = await this.catTipoVerificacionesRepository.save(create);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createCatTipoVerificacionesDto };
      await this.bitacoraLogger.logToBitacora(
        'CatTipoVerificaciones',
        `Se creó un tipo de verificación con nombre: ${createCatTipoVerificacionesDto.nombre}`,
        'CREATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      const idTipoVerificacion = saved.id;
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Tipo de verificación creado correctamente',
        data: {
          id: Number(idTipoVerificacion),
          nombre: saved.nombre || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createCatTipoVerificacionesDto };
      await this.bitacoraLogger.logToBitacora(
        'CatTipoVerificaciones',
        `Error al crear tipo de verificación con nombre: ${createCatTipoVerificacionesDto.nombre}`,
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
        'Se produjo un error al crear el tipo de verificación.',
      );
    }
  }

  async findAllList(): Promise<ApiResponseCommon> {
    try {
      const tiposVerificacion = await this.catTipoVerificacionesRepository.find(
        {
          order: { nombre: 'ASC' },
        },
      );

      // Forzamos ids a number
      const data = tiposVerificacion.map((item) => ({
        id: Number(item.id),
        nombre: item.nombre,
      }));

      const result: ApiResponseCommon = {
        data: data,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al obtener el listado de tipos de verificación.',
      );
    }
  }

  async findAll(page: number, limit: number): Promise<ApiResponseCommon> {
    try {
      const [data, total] =
        await this.catTipoVerificacionesRepository.findAndCount({
          order: { nombre: 'ASC' },
          skip: (page - 1) * limit,
          take: limit,
        });

      // Forzamos ids a number
      const tiposVerificacion = data.map((item) => ({
        id: Number(item.id),
        nombre: item.nombre,
      }));

      const result: ApiResponseCommon = {
        data: tiposVerificacion,
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
        error.message || 'Error al obtener los tipos de verificación',
      );
    }
  }

  async findOne(id: number): Promise<ApiResponseCommon> {
    try {
      const tipoVerificacion =
        await this.catTipoVerificacionesRepository.findOne({
          where: { id: id },
        });
      if (!tipoVerificacion) {
        throw new NotFoundException('Tipo de verificación no encontrado');
      }

      const result: ApiResponseCommon = {
        data: [
          {
            id: Number(tipoVerificacion.id),
            nombre: tipoVerificacion.nombre,
          },
        ],
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error interno al buscar el tipo de verificación',
      );
    }
  }

  async update(
    id: number,
    updateCatTipoVerificacionesDto: UpdateCatTipoVerificacionesDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const tipoVerificacion =
        await this.catTipoVerificacionesRepository.findOne({
          where: { id: id },
        });
      if (!tipoVerificacion) {
        throw new NotFoundException('Tipo de verificación no encontrado');
      }

      // Verificar si el nombre ya existe en otro registro
      if (updateCatTipoVerificacionesDto.nombre) {
        const existing = await this.catTipoVerificacionesRepository.findOne({
          where: { nombre: updateCatTipoVerificacionesDto.nombre },
        });
        if (existing && existing.id !== id) {
          throw new BadRequestException(
            'El nombre del tipo de verificación ya existe',
          );
        }
      }

      await this.catTipoVerificacionesRepository.update(
        id,
        updateCatTipoVerificacionesDto,
      );
      const tipoVerificacionResult =
        await this.catTipoVerificacionesRepository.findOne({
          where: { id: id },
        });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateCatTipoVerificacionesDto };
      await this.bitacoraLogger.logToBitacora(
        'CatTipoVerificaciones',
        `Se actualizó el tipo de verificación con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Tipo de verificación actualizado correctamente',
        data: {
          id: id,
          nombre: tipoVerificacionResult?.nombre || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateCatTipoVerificacionesDto };
      await this.bitacoraLogger.logToBitacora(
        'CatTipoVerificaciones',
        `Error al actualizar tipo de verificación con ID: ${id}`,
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
        'Se produjo un error al actualizar el tipo de verificación.',
      );
    }
  }

  async remove(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const tipoVerificacion =
        await this.catTipoVerificacionesRepository.findOne({
          where: { id: id },
        });

      if (!tipoVerificacion) {
        throw new NotFoundException('Tipo de verificación no encontrado');
      }

      await this.catTipoVerificacionesRepository.delete(id);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id };
      await this.bitacoraLogger.logToBitacora(
        'CatTipoVerificaciones',
        `Se eliminó el tipo de verificación con ID: ${id}`,
        'DELETE',
        querylogger,
        Number(idUser),
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Tipo de verificación eliminado correctamente',
        data: {
          id: id,
          nombre: tipoVerificacion.nombre || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id };
      await this.bitacoraLogger.logToBitacora(
        'CatTipoVerificaciones',
        `Error al eliminar tipo de verificación con ID: ${id}`,
        'DELETE',
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
        message: 'Error al eliminar el tipo de verificación.',
        error: error.message,
      });
    }
  }
}
