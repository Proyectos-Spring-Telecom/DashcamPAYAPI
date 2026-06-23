import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCatReferenciaServicioDto } from './dto/create-cat-referencia-servicio.dto';
import { UpdateCatReferenciaServicioDto } from './dto/update-cat-referencia-servicio.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { CatReferenciaServicio } from 'src/entities/CatReferenciaServicio';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';

@Injectable()
export class CatReferenciaServicioService {
  constructor(
    @InjectRepository(CatReferenciaServicio)
    private readonly catReferenciaServicioRepository: Repository<CatReferenciaServicio>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(
    createCatReferenciaServicioDto: CreateCatReferenciaServicioDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const referenciaServicio =
        await this.catReferenciaServicioRepository.findOne({
          where: { nombre: createCatReferenciaServicioDto.nombre },
        });
      if (referenciaServicio) {
        throw new BadRequestException('La referencia de servicio ya existe');
      }
      const create = await this.catReferenciaServicioRepository.create(
        createCatReferenciaServicioDto,
      );
      const saved = await this.catReferenciaServicioRepository.save(create);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createCatReferenciaServicioDto };
      await this.bitacoraLogger.logToBitacora(
        'CatReferenciaServicio',
        `Se creó una referencia de servicio con nombre: ${createCatReferenciaServicioDto.nombre}`,
        'CREATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      const idReferencia = saved.id;
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Referencia de servicio creada correctamente',
        data: {
          id: Number(idReferencia),
          nombre: saved.nombre || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createCatReferenciaServicioDto };
      await this.bitacoraLogger.logToBitacora(
        'CatReferenciaServicio',
        `Error al crear referencia de servicio con nombre: ${createCatReferenciaServicioDto.nombre}`,
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
        'Se produjo un error al crear la referencia de servicio.',
      );
    }
  }

  async findAllList(): Promise<ApiResponseCommon> {
    try {
      const referenciasServicio =
        await this.catReferenciaServicioRepository.find({
          where: { estatus: 1 },
          order: { nombre: 'ASC' },
        });

      // Forzamos ids a number
      const data = referenciasServicio.map((item) => ({
        id: Number(item.id),
        nombre: item.nombre,
        estatus: item.estatus,
        fhRegistro: item.fhRegistro,
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
        'Se produjo un error al obtener el listado de referencias de servicio.',
      );
    }
  }

  async findAll(page: number, limit: number): Promise<ApiResponseCommon> {
    try {
      const [data, total] =
        await this.catReferenciaServicioRepository.findAndCount({
          order: { nombre: 'ASC' },
          skip: (page - 1) * limit,
          take: limit,
        });

      // Forzamos ids a number
      const referenciasServicio = data.map((item) => ({
        id: Number(item.id),
        nombre: item.nombre,
        estatus: item.estatus,
        fhRegistro: item.fhRegistro,
      }));

      const result: ApiResponseCommon = {
        data: referenciasServicio,
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
        error.message || 'Error al obtener las referencias de servicio',
      );
    }
  }

  async findOne(id: number): Promise<ApiResponseCommon> {
    try {
      const referenciaServicio =
        await this.catReferenciaServicioRepository.findOne({
          where: { id: id },
        });
      if (!referenciaServicio) {
        throw new NotFoundException('Referencia de servicio no encontrada');
      }

      const result: ApiResponseCommon = {
        data: [
          {
            id: Number(referenciaServicio.id),
            nombre: referenciaServicio.nombre,
            estatus: referenciaServicio.estatus,
            fhRegistro: referenciaServicio.fhRegistro,
          },
        ],
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error interno al buscar la referencia de servicio',
      );
    }
  }

  async update(
    id: number,
    updateCatReferenciaServicioDto: UpdateCatReferenciaServicioDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const referenciaServicio =
        await this.catReferenciaServicioRepository.findOne({
          where: { id: id },
        });
      if (!referenciaServicio) {
        throw new NotFoundException('Referencia de servicio no encontrada');
      }

      // Verificar si el nombre ya existe en otro registro
      if (updateCatReferenciaServicioDto.nombre) {
        const existing = await this.catReferenciaServicioRepository.findOne({
          where: { nombre: updateCatReferenciaServicioDto.nombre },
        });
        if (existing && existing.id !== id) {
          throw new BadRequestException(
            'El nombre de la referencia de servicio ya existe',
          );
        }
      }

      await this.catReferenciaServicioRepository.update(
        id,
        updateCatReferenciaServicioDto,
      );
      const referenciaServicioResult =
        await this.catReferenciaServicioRepository.findOne({
          where: { id: id },
        });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateCatReferenciaServicioDto };
      await this.bitacoraLogger.logToBitacora(
        'CatReferenciaServicio',
        `Se actualizó la referencia de servicio con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Referencia de servicio actualizada correctamente',
        data: {
          id: id,
          nombre: referenciaServicioResult?.nombre || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateCatReferenciaServicioDto };
      await this.bitacoraLogger.logToBitacora(
        'CatReferenciaServicio',
        `Error al actualizar referencia de servicio con ID: ${id}`,
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
        'Se produjo un error al actualizar la referencia de servicio.',
      );
    }
  }

  async remove(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const referenciaServicio =
        await this.catReferenciaServicioRepository.findOne({
          where: { id: id },
        });

      if (!referenciaServicio) {
        throw new NotFoundException('Referencia de servicio no encontrada');
      }

      await this.catReferenciaServicioRepository.delete(id);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id };
      await this.bitacoraLogger.logToBitacora(
        'CatReferenciaServicio',
        `Se eliminó la referencia de servicio con ID: ${id}`,
        'DELETE',
        querylogger,
        Number(idUser),
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Referencia de servicio eliminada correctamente',
        data: {
          id: id,
          nombre: referenciaServicio.nombre || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id };
      await this.bitacoraLogger.logToBitacora(
        'CatReferenciaServicio',
        `Error al eliminar referencia de servicio con ID: ${id}`,
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
        message: 'Error al eliminar la referencia de servicio.',
        error: error.message,
      });
    }
  }
}
