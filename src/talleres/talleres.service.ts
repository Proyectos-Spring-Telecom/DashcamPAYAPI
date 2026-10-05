import { clienteHijosDesdeSp, clientesPermitidos, tieneIdsTenant } from 'src/common/tenant/ownership-resolvers';
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateTallereDto } from './dto/create-tallere.dto';
import { UpdateTallereDto } from './dto/update-tallere.dto';
import { forbidTenantMove } from 'src/common/tenant/forbid-tenant-move';
import { InjectRepository } from '@nestjs/typeorm';
import { Talleres } from 'src/entities/Talleres';
import { Repository } from 'typeorm';
import {
  ApiCrudResponse,
  EstatusEnumBitcora,
  ApiResponseCommon,
} from 'src/common/ApiResponse';
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
  async create(
    createTallereDto: CreateTallereDto,
    idUser,
    clienteActor = 0,
    rol = 1,
  ) {
    try {
      if (Number(rol) !== 1) {
        const permitidos = await clientesPermitidos(
          this.clienteRepository.manager,
          clienteActor,
        );
        if (!permitidos.includes(Number(createTallereDto.idCliente))) {
          throw new NotFoundException('Cliente no encontrado');
        }
      }

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
    return clienteHijosDesdeSp(this.clienteRepository.manager, cliente);
  }

  private async assertTallerTenant(
    taller: { idCliente?: number | null },
    id: number,
    cliente: number,
    rol: number,
  ) {
    if (Number(rol) === 1) return;
    const { ids } = await this.clienteHijos(cliente);
    if (!tieneIdsTenant(ids) || !ids.includes(Number(taller.idCliente))) {
      throw new NotFoundException('No se ha encontrado el taller solicitado');
    }
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
        WHERE t.idCliente IN (${placeholders})
        `,
        [...ids],
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

      if (!tieneIdsTenant(ids)) {
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
        WHERE t.idCliente IN (${placeholders})
        ORDER BY t.id DESC
        LIMIT ? OFFSET ?
        `,
        [...ids, limit, offset],
      );

      // Query para obtener el total
      const totalResult = await this.talleresRepository.query(
        `
        SELECT COUNT(*) AS total
        FROM Talleres t
        JOIN Clientes c ON t.idCliente = c.id
        WHERE t.idCliente IN (${placeholders})
        `,
        [...ids],
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

  async findOne(id: number, cliente = 0, rol = 1) {
    try {
      if (Number(rol) === 1) {
        const data = await this.talleresRepository.findOne({
          where: { id: id },
        });
        if (!data) {
          throw new NotFoundException(
            'No se ha encontrado el taller solicitado',
          );
        }
        return data;
      }

      const { ids, placeholders } = await this.clienteHijos(cliente);
      if (!tieneIdsTenant(ids)) {
        throw new NotFoundException('No se ha encontrado el taller solicitado');
      }

      const rows = await this.talleresRepository.query(
        `
        SELECT t.*
        FROM Talleres t
        WHERE t.Id = ? AND t.IdCliente IN (${placeholders})
        LIMIT 1
        `,
        [id, ...ids],
      );
      if (!rows?.length) {
        throw new NotFoundException('No se ha encontrado el taller solicitado');
      }
      return rows[0];
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException({
        message: 'Ocurrió un error al obtener los talleres.',
      });
    }
  }

  async update(
    id: number,
    updateTallereDto: UpdateTallereDto,
    idUser: number,
    cliente = 0,
    rol = 1,
  ) {
    try {
      const exist = await this.talleresRepository.findOne({
        where: { id: id },
      });
      if (!exist)
        throw new NotFoundException('No se ha encontrado el taller solicitado');
      await this.assertTallerTenant(exist, id, cliente, rol);
      forbidTenantMove(
        exist.idCliente,
        updateTallereDto as any,
        'idCliente',
        'Taller no encontrado',
      );
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

  async remove(id: number, idUser: number, cliente = 0, rol = 1) {
    let exist: any; // Declaramos fuera del try para poder usarlo en el catch

    try {
      exist = await this.talleresRepository.findOne({ where: { id } });
      if (!exist)
        throw new NotFoundException('No se ha encontrado el taller solicitado');
      await this.assertTallerTenant(exist, id, cliente, rol);

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

  async activar(id: number, idUser: number, cliente = 0, rol = 1) {
    let exist: any; // Declaramos fuera del try para poder usarlo en el catch

    try {
      exist = await this.talleresRepository.findOne({ where: { id } });
      if (!exist)
        throw new NotFoundException('No se ha encontrado el taller solicitado');
      await this.assertTallerTenant(exist, id, cliente, rol);

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
