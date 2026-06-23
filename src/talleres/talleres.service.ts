import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateTallereDto } from './dto/create-tallere.dto';
import { UpdateTallereDto } from './dto/update-tallere.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Talleres } from 'src/entities/Talleres';
import { Repository } from 'typeorm';
import { ApiCrudResponse, EstatusEnumBitcora, ApiResponseCommon } from 'src/common/ApiResponse';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { Clientes } from 'src/entities/Clientes';

@Injectable()
export class TalleresService {
  constructor(
    private readonly bitacoraLogger: BitacoraLoggerService,
    @InjectRepository(Talleres)
    private readonly talleresRepository: Repository<Talleres>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
  ) {}
  async create(createTallereDto: CreateTallereDto, idUser) {
    try {
      const create = await this.talleresRepository.create(createTallereDto);
      const saved = await this.talleresRepository.save(create);
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El taller ha sido creado correctamente.',
        data: {
          id: Number(saved.id),
          nombre: `${saved.nombre} ${saved.descripcion} ` || '',
        },
      };
      const querylogger = { createTallereDto };
      await this.bitacoraLogger.logToBitacora(
        'Talleres',
        `Se ha creado un taller con el nombre: ${createTallereDto.nombre}.`,
        'CREATE',
        querylogger,
        idUser,
        37,
        EstatusEnumBitcora.SUCCESS,
      );
      return result;
    } catch (error) {
      const querylogger = { createTallereDto };
      await this.bitacoraLogger.logToBitacora(
        'Talleres',
        `Se ha creado un talleres con el nombre: ${createTallereDto.nombre}.`,
        'CREATE',
        querylogger,
        idUser,
        37,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Ha ocurrido un error durante el proceso de creación del taller.',
      );
    }
  }

  private async clienteHijos(cliente: number) {
    const clientesFiltrado = await this.clienteRepository.query(
      `CALL spGetClientes(?);`,
      [cliente],
    );
    const idsFiltrados = clientesFiltrado[0];
    const ids = idsFiltrados
      .map((clientesFiltrado: any) => Number(clientesFiltrado.Id))
      .filter(Boolean);
    if (ids.length === 0) {
      return { data: [] };
    }
    const placeholders = ids.map(() => '?').join(',');

    return { ids, placeholders };
  }

  async findAll(req: any) {
    try {
      const { ids, placeholders } = await this.clienteHijos(
        Number(req.user.cliente),
      );

      const talleres = await this.talleresRepository.query(
        `
        SELECT 
          t.*, 
          c.nombre AS nombreCliente
        FROM Talleres t
        JOIN Clientes c ON t.idCliente = c.id
        WHERE t.idCliente IN (?)
        `,
        [ids],
      );
      return talleres;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException({
        message: 'Ocurrió un error al obtener los talleres.',
      });
    }
  }

  async findAllPaginated(
    req: any,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const { ids, placeholders } = await this.clienteHijos(
        Number(req.user.cliente),
      );

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

      const offset = (page - 1) * limit;

      // Query paginada
      const talleres = await this.talleresRepository.query(
        `
        SELECT 
          t.*, 
          c.nombre AS nombreCliente
        FROM Talleres t
        JOIN Clientes c ON t.idCliente = c.id
        WHERE t.idCliente IN (?)
        ORDER BY t.id DESC
        LIMIT ? OFFSET ?
        `,
        [ids, limit, offset],
      );

      // Query para obtener el total
      const totalResult = await this.talleresRepository.query(
        `
        SELECT COUNT(*) AS total
        FROM Talleres t
        JOIN Clientes c ON t.idCliente = c.id
        WHERE t.idCliente IN (?)
        `,
        [ids],
      );

      const total = totalResult[0]?.total || 0;

      const result: ApiResponseCommon = {
        data: talleres,
        paginated: {
          total: Number(total),
          page,
          lastPage: Math.ceil(Number(total) / limit),
        },
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException({
        message: 'Ocurrió un error al obtener los talleres.',
      });
    }
  }

  async findOne(id: number) {
    try {
      const data = await this.talleresRepository.findOne({ where: { id: id } });
      if (!data)
        throw new NotFoundException('No se ha encontrado el taller solicitado');
      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException({
        message: 'Ocurrió un error al obtener los talleres.',
      });
    }
  }

  async update(id: number, updateTallereDto: UpdateTallereDto, idUser: number) {
    try {
      const exist = await this.talleresRepository.findOne({
        where: { id: id },
      });
      if (!exist)
        throw new NotFoundException('No se ha encontrado el taller solicitado');
      await this.talleresRepository.update(id, updateTallereDto);
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El taller ha sido creado correctamente.',
        data: {
          id: Number(id),
          nombre:
            `${updateTallereDto.nombre} ${updateTallereDto.descripcion} ` || '',
        },
      };
      const querylogger = { updateTallereDto };
      await this.bitacoraLogger.logToBitacora(
        'Talleres',
        `Se ha actualizado un taller con el nombre: ${updateTallereDto.nombre}.`,
        'UPDATE',
        querylogger,
        idUser,
        37,
        EstatusEnumBitcora.SUCCESS,
      );
      return result;
    } catch (error) {
      const querylogger = { updateTallereDto };
      await this.bitacoraLogger.logToBitacora(
        'Talleres',
        `Error al actualizar el taller: ${updateTallereDto.nombre}.`,
        'UPDATE',
        querylogger,
        idUser,
        37,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Ha ocurrido un error durante el proceso de actualización del taller.',
      );
    }
  }

  async remove(id: number, idUser: number) {
    let exist: any; // Declaramos fuera del try para poder usarlo en el catch
  
    try {
      exist = await this.talleresRepository.findOne({ where: { id } });
      if (!exist)
        throw new NotFoundException('No se ha encontrado el taller solicitado');
  
      exist.estatus = 0;
      await this.talleresRepository.update(id, exist);
  
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El taller ha sido actualizado correctamente.',
        data: {
          id: Number(id),
          nombre: `${exist.nombre} ${exist.descripcion || ''}`,
        },
      };
  
      const querylogger = { exist };
      await this.bitacoraLogger.logToBitacora(
        'Talleres',
        `Se ha actualizado un taller con el nombre: ${exist.nombre}.`,
        'UPDATE',
        querylogger,
        idUser,
        37,
        EstatusEnumBitcora.SUCCESS,
      );
  
      return result;
    } catch (error) {
      const querylogger = { exist };
      await this.bitacoraLogger.logToBitacora(
        'Talleres',
        `Error al actualizar el taller: ${exist?.nombre || 'desconocido'}.`,
        'UPDATE',
        querylogger,
        idUser,
        37,
        EstatusEnumBitcora.ERROR,
        error?.message,
      );
  
      if (error instanceof HttpException) {
        throw error;
      }
  
      throw new InternalServerErrorException(
        'Ha ocurrido un error durante el proceso de actualización del taller.',
      );
    }
  }

  async activar(id: number, idUser: number) {
    let exist: any; // Declaramos fuera del try para poder usarlo en el catch
  
    try {
      exist = await this.talleresRepository.findOne({ where: { id } });
      if (!exist)
        throw new NotFoundException('No se ha encontrado el taller solicitado');
  
      exist.estatus = 1;
      await this.talleresRepository.update(id, exist);
  
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El taller ha sido actualizado correctamente.',
        data: {
          id: Number(id),
          nombre: `${exist.nombre} ${exist.descripcion || ''}`,
        },
      };
  
      const querylogger = { exist };
      await this.bitacoraLogger.logToBitacora(
        'Talleres',
        `Se ha actualizado un taller con el nombre: ${exist.nombre}.`,
        'UPDATE',
        querylogger,
        idUser,
        37,
        EstatusEnumBitcora.SUCCESS,
      );
  
      return result;
    } catch (error) {
      const querylogger = { exist };
      await this.bitacoraLogger.logToBitacora(
        'Talleres',
        `Error al actualizar el taller: ${exist?.nombre || 'desconocido'}.`,
        'UPDATE',
        querylogger,
        idUser,
        37,
        EstatusEnumBitcora.ERROR,
        error?.message,
      );
  
      if (error instanceof HttpException) {
        throw error;
      }
  
      throw new InternalServerErrorException(
        'Ha ocurrido un error durante el proceso de actualización del taller.',
      );
    }
  }
}
