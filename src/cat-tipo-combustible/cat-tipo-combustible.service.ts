import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCatTipoCombustibleDto } from './dto/create-cat-tipo-combustible.dto';
import { UpdateCatTipoCombustibleDto } from './dto/update-cat-tipo-combustible.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { CatTipoCombustible } from 'src/entities/CatTipoCombustible';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';

@Injectable()
export class CatTipoCombustibleService {
  constructor(
    @InjectRepository(CatTipoCombustible)
    private readonly catTipoCombustibleRepository: Repository<CatTipoCombustible>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(
    createCatTipoCombustibleDto: CreateCatTipoCombustibleDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const tipoCombustible = await this.catTipoCombustibleRepository.findOne({
        where: { nombre: createCatTipoCombustibleDto.nombre },
      });
      if (tipoCombustible) {
        throw new BadRequestException('El tipo de combustible ya existe');
      }
      const create = await this.catTipoCombustibleRepository.create(
        createCatTipoCombustibleDto,
      );
      const saved = await this.catTipoCombustibleRepository.save(create);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createCatTipoCombustibleDto };
      await this.bitacoraLogger.logToBitacora(
        'CatTipoCombustible',
        `Se creó un tipo de combustible con nombre: ${createCatTipoCombustibleDto.nombre}`,
        'CREATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      const idTipoCombustible = saved.id;
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Tipo de combustible creado correctamente',
        data: {
          id: Number(idTipoCombustible),
          nombre: saved.nombre || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createCatTipoCombustibleDto };
      await this.bitacoraLogger.logToBitacora(
        'CatTipoCombustible',
        `Error al crear tipo de combustible con nombre: ${createCatTipoCombustibleDto.nombre}`,
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
        'Se produjo un error al crear el tipo de combustible.',
      );
    }
  }

  async findAllList(): Promise<ApiResponseCommon> {
    try {
      const tiposCombustible = await this.catTipoCombustibleRepository.find({
        order: { nombre: 'ASC' },
      });

      // Forzamos ids a number
      const data = tiposCombustible.map((item) => ({
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
        'Se produjo un error al obtener el listado de tipos de combustible.',
      );
    }
  }

  async findAll(page: number, limit: number): Promise<ApiResponseCommon> {
    try {
      const [data, total] =
        await this.catTipoCombustibleRepository.findAndCount({
          order: { nombre: 'ASC' },
          skip: (page - 1) * limit,
          take: limit,
        });

      // Forzamos ids a number
      const tiposCombustible = data.map((item) => ({
        id: Number(item.id),
        nombre: item.nombre,
      }));

      const result: ApiResponseCommon = {
        data: tiposCombustible,
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
        error.message || 'Error al obtener los tipos de combustible',
      );
    }
  }

  async findOne(id: number): Promise<ApiResponseCommon> {
    try {
      const tipoCombustible = await this.catTipoCombustibleRepository.findOne({
        where: { id: id },
      });
      if (!tipoCombustible) {
        throw new NotFoundException('Tipo de combustible no encontrado');
      }

      const result: ApiResponseCommon = {
        data: [
          {
            id: Number(tipoCombustible.id),
            nombre: tipoCombustible.nombre,
          },
        ],
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error interno al buscar el tipo de combustible',
      );
    }
  }

  async update(
    id: number,
    updateCatTipoCombustibleDto: UpdateCatTipoCombustibleDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const tipoCombustible = await this.catTipoCombustibleRepository.findOne({
        where: { id: id },
      });
      if (!tipoCombustible) {
        throw new NotFoundException('Tipo de combustible no encontrado');
      }

      // Verificar si el nombre ya existe en otro registro
      if (updateCatTipoCombustibleDto.nombre) {
        const existing = await this.catTipoCombustibleRepository.findOne({
          where: { nombre: updateCatTipoCombustibleDto.nombre },
        });
        if (existing && existing.id !== id) {
          throw new BadRequestException(
            'El nombre del tipo de combustible ya existe',
          );
        }
      }

      await this.catTipoCombustibleRepository.update(
        id,
        updateCatTipoCombustibleDto,
      );
      const tipoCombustibleResult =
        await this.catTipoCombustibleRepository.findOne({
          where: { id: id },
        });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateCatTipoCombustibleDto };
      await this.bitacoraLogger.logToBitacora(
        'CatTipoCombustible',
        `Se actualizó el tipo de combustible con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Tipo de combustible actualizado correctamente',
        data: {
          id: id,
          nombre: tipoCombustibleResult?.nombre || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateCatTipoCombustibleDto };
      await this.bitacoraLogger.logToBitacora(
        'CatTipoCombustible',
        `Error al actualizar tipo de combustible con ID: ${id}`,
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
        'Se produjo un error al actualizar el tipo de combustible.',
      );
    }
  }

  async remove(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const tipoCombustible = await this.catTipoCombustibleRepository.findOne({
        where: { id: id },
      });

      if (!tipoCombustible) {
        throw new NotFoundException('Tipo de combustible no encontrado');
      }

      await this.catTipoCombustibleRepository.delete(id);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id };
      await this.bitacoraLogger.logToBitacora(
        'CatTipoCombustible',
        `Se eliminó el tipo de combustible con ID: ${id}`,
        'DELETE',
        querylogger,
        Number(idUser),
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Tipo de combustible eliminado correctamente',
        data: {
          id: id,
          nombre: tipoCombustible.nombre || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id };
      await this.bitacoraLogger.logToBitacora(
        'CatTipoCombustible',
        `Error al eliminar tipo de combustible con ID: ${id}`,
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
        message: 'Error al eliminar el tipo de combustible.',
        error: error.message,
      });
    }
  }
}
