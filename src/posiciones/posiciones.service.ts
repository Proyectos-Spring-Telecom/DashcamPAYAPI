import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreatePosicionesDto } from './dto/create-posicione.dto';
import { ApiCrudResponse, ApiResponseCommon, EstatusEnumBitcora } from 'src/common/ApiResponse';
import { InjectRepository } from '@nestjs/typeorm';
import { Posiciones } from 'src/entities/Posiciones';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';

@Injectable()
export class PosicionesService {
  constructor(
    @InjectRepository(Posiciones)
    private readonly posicionesRepository: Repository<Posiciones>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(
    idUser: number,
    createPosicionesDto: CreatePosicionesDto,
  ): Promise<ApiCrudResponse> {
    try {
      //Creamos la posicion
      const newPosicion =  await this.posicionesRepository.create(createPosicionesDto);
      const posicionSave = await this.posicionesRepository.save(newPosicion);

      // Registro en la bitácora----- SUCCESS
      const querylogger = { createPosicionesDto };
      await this.bitacoraLogger.logToBitacora(
        'Posiciones',
        `Se creó una Posicion con Numero de serie Validador: ${posicionSave.numeroSerieValidador}`,
        'CREATE',
        querylogger,
        idUser,
        24,
        EstatusEnumBitcora.SUCCESS,
      );

      //APis Response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Posicion creada correctamente',
        data: {
          id: Number(posicionSave.id),
          nombre: `${posicionSave.id} ${posicionSave.numeroSerieValidador}` || '',
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora----- ERROR
      const querylogger = { createPosicionesDto };
      await this.bitacoraLogger.logToBitacora(
        'Posiciones',
        `Se creó una Posicion con Numero de serie Validador: ${createPosicionesDto.numeroSerieValidador}`,
        'CREATE',
        querylogger,
        idUser,
        24,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al crear Posicion',
        error,
      });
    }
  }

  async findAll(page: number, limit: number): Promise<ApiResponseCommon> {
    try {
      //Obtenemos ConteoPasajeros
      const posicionesFind = await this.posicionesRepository.find({
        order: { id: 'DESC' },
      });
      if (posicionesFind.length === 0) {
        throw new NotFoundException('Datos de posiciones no encontrado');
      }
      const [data, total] = await this.posicionesRepository.findAndCount({
        skip: (page - 1) * limit,
        take: limit,
        order: { fechaHora: 'DESC' },
      });

      //Forzamos a cambiar el id a number
      const posiciones = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      //APi response
      const result: ApiResponseCommon = {
        data: posiciones,
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
        message: 'Error al obtener paginado Posiciones',
        error,
      });
    }
  }

  async findAllList(): Promise<ApiResponseCommon> {
    try {
      //Obtenemos ConteoPasajeros
      const posiciones = await this.posicionesRepository.find({
        order: { fechaHora: 'DESC' },
      });
      if (posiciones.length === 0) {
        throw new NotFoundException('Datos de posiciones no encontrado');
      }

      //Forzamos a cambiar el id a number
      const data = posiciones.map((item) => ({
        ...item,
        id: Number(item.id),
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
        message: 'Error al obtener listado Posiciones',
        error,
      });
    }
  }

  async findOne(id: number) {
    try {
      const posicion = await this.posicionesRepository.findOne({
        where: { id: id },
      });
      if (!posicion) {
        throw new NotFoundException('Datos de posicion no encontrado');
      }

      //cambiamos el id a number
      posicion.id = Number(posicion.id);

      return { data: posicion };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener Posicion por ID',
        error,
      });
    }
  }
}
