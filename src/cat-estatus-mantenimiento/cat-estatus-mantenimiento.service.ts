import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCatEstatusMantenimientoDto } from './dto/create-cat-estatus-mantenimiento.dto';
import { UpdateCatEstatusMantenimientoDto } from './dto/update-cat-estatus-mantenimiento.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { CatEstatusMantenimiento } from 'src/entities/CatEstatusMantenimiento';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';

@Injectable()
export class CatEstatusMantenimientoService {
  constructor(
    @InjectRepository(CatEstatusMantenimiento)
    private readonly catEstatusMantenimientoRepository: Repository<CatEstatusMantenimiento>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(
    createCatEstatusMantenimientoDto: CreateCatEstatusMantenimientoDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const estatusMantenimiento = await this.catEstatusMantenimientoRepository.findOne({
        where: { nombre: createCatEstatusMantenimientoDto.nombre },
      });
      if (estatusMantenimiento) {
        throw new BadRequestException('El estatus de mantenimiento ya existe');
      }
      const create = await this.catEstatusMantenimientoRepository.create(
        createCatEstatusMantenimientoDto,
      );
      const saved = await this.catEstatusMantenimientoRepository.save(create);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createCatEstatusMantenimientoDto };
      await this.bitacoraLogger.logToBitacora(
        'CatEstatusMantenimiento',
        `Se creó un estatus de mantenimiento con nombre: ${createCatEstatusMantenimientoDto.nombre}`,
        'CREATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      const idEstatus = saved.id;
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Estatus de mantenimiento creado correctamente',
        data: {
          id: Number(idEstatus),
          nombre: saved.nombre || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createCatEstatusMantenimientoDto };
      await this.bitacoraLogger.logToBitacora(
        'CatEstatusMantenimiento',
        `Error al crear estatus de mantenimiento con nombre: ${createCatEstatusMantenimientoDto.nombre}`,
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
        'Se produjo un error al crear el estatus de mantenimiento.',
      );
    }
  }

  async findAllList(): Promise<ApiResponseCommon> {
    try {
      const estatusMantenimientos = await this.catEstatusMantenimientoRepository.find({
        order: { nombre: 'ASC' },
      });

      // Forzamos ids a number
      const data = estatusMantenimientos.map((item) => ({
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
        'Se produjo un error al obtener el listado de estatus de mantenimiento.',
      );
    }
  }

  async findAll(page: number, limit: number): Promise<ApiResponseCommon> {
    try {
      const [data, total] = await this.catEstatusMantenimientoRepository.findAndCount({
        order: { nombre: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      // Forzamos ids a number
      const estatusMantenimientos = data.map((item) => ({
        id: Number(item.id),
        nombre: item.nombre,
      }));

      const result: ApiResponseCommon = {
        data: estatusMantenimientos,
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
        error.message || 'Error al obtener los estatus de mantenimiento',
      );
    }
  }

  async findOne(id: number): Promise<ApiResponseCommon> {
    try {
      const estatusMantenimiento = await this.catEstatusMantenimientoRepository.findOne({
        where: { id: id },
      });
      if (!estatusMantenimiento) {
        throw new NotFoundException('Estatus de mantenimiento no encontrado');
      }

      const result: ApiResponseCommon = {
        data: [
          {
            id: Number(estatusMantenimiento.id),
            nombre: estatusMantenimiento.nombre,
          },
        ],
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error interno al buscar el estatus de mantenimiento',
      );
    }
  }

  async update(
    id: number,
    updateCatEstatusMantenimientoDto: UpdateCatEstatusMantenimientoDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const estatusMantenimiento = await this.catEstatusMantenimientoRepository.findOne({
        where: { id: id },
      });
      if (!estatusMantenimiento) {
        throw new NotFoundException('Estatus de mantenimiento no encontrado');
      }

      // Verificar si el nombre ya existe en otro registro
      if (updateCatEstatusMantenimientoDto.nombre) {
        const existing = await this.catEstatusMantenimientoRepository.findOne({
          where: { nombre: updateCatEstatusMantenimientoDto.nombre },
        });
        if (existing && existing.id !== id) {
          throw new BadRequestException('El nombre del estatus de mantenimiento ya existe');
        }
      }

      await this.catEstatusMantenimientoRepository.update(
        id,
        updateCatEstatusMantenimientoDto,
      );
      const estatusMantenimientoResult = await this.catEstatusMantenimientoRepository.findOne({
        where: { id: id },
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateCatEstatusMantenimientoDto };
      await this.bitacoraLogger.logToBitacora(
        'CatEstatusMantenimiento',
        `Se actualizó el estatus de mantenimiento con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Estatus de mantenimiento actualizado correctamente',
        data: {
          id: id,
          nombre: estatusMantenimientoResult?.nombre || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateCatEstatusMantenimientoDto };
      await this.bitacoraLogger.logToBitacora(
        'CatEstatusMantenimiento',
        `Error al actualizar estatus de mantenimiento con ID: ${id}`,
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
        'Se produjo un error al actualizar el estatus de mantenimiento.',
      );
    }
  }

  async remove(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const estatusMantenimiento = await this.catEstatusMantenimientoRepository.findOne({
        where: { id: id },
      });

      if (!estatusMantenimiento) {
        throw new NotFoundException('Estatus de mantenimiento no encontrado');
      }

      await this.catEstatusMantenimientoRepository.delete(id);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id };
      await this.bitacoraLogger.logToBitacora(
        'CatEstatusMantenimiento',
        `Se eliminó el estatus de mantenimiento con ID: ${id}`,
        'DELETE',
        querylogger,
        Number(idUser),
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Estatus de mantenimiento eliminado correctamente',
        data: {
          id: id,
          nombre: estatusMantenimiento.nombre || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id };
      await this.bitacoraLogger.logToBitacora(
        'CatEstatusMantenimiento',
        `Error al eliminar estatus de mantenimiento con ID: ${id}`,
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
        message: 'Error al eliminar el estatus de mantenimiento.',
        error: error.message,
      });
    }
  }
}
