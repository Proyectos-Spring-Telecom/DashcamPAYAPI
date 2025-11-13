import {
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateViajesconteoDto } from './dto/create-viajesconteo.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ViajesConteos } from 'src/entities/ViajesConteos';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { ApiCrudResponse, ApiResponseCommon, EstatusEnumBitcora } from 'src/common/ApiResponse';

@Injectable()
export class ViajesconteosService {
  constructor(
    @InjectRepository(ViajesConteos)
    private readonly viajesconteosRepository: Repository<ViajesConteos>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(idUser: number, createViajesconteoDto: CreateViajesconteoDto) {
    try {
      const newViajesConteos = await this.viajesconteosRepository.create(
        createViajesconteoDto,
      );
      const viajesconteosSave =
        await this.viajesconteosRepository.save(newViajesConteos);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createViajesconteoDto };
      await this.bitacoraLogger.logToBitacora(
        'ViajesConteos',
        `Se creó el viajesconteos con viaje ID: ${createViajesconteoDto.idViaje} y conteo ID: ${createViajesconteoDto.idConteo}`,
        'CREATE',
        querylogger,
        idUser,
        26,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
            const result: ApiCrudResponse = {
              status: 'success',
              message: 'El viajeconteo ha sido creado exitosamente.',
              data: {
                id: Number(viajesconteosSave.idConteo),
                nombre: `Viaje ID: ${viajesconteosSave.idConteo} Transaccion ID: ${viajesconteosSave.idViaje} ` || '',
              },
            };
            return result;
    } catch (error) {
      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createViajesconteoDto };
      await this.bitacoraLogger.logToBitacora(
        'ViajesConteos',
        `Se creó el viajesconteos con viaje ID: ${createViajesconteoDto.idViaje} y conteo ID: ${createViajesconteoDto.idConteo}`,
        'CREATE',
        querylogger,
        idUser,
        26,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Se produjo un error al crear el viajesconteo.`,
        error: error.message,
      });
    }
  }

  async findAllList() {
    try {
      const viajesconteos = await this.viajesconteosRepository.query(
        `
SELECT 
  v.Id AS idViaje,
  v.Inicio AS inicioViaje,
  v.Fin AS finViaje,
  v.FechaCreacion AS fechaCreacionViaje,
  v.FechaActualizacion AS fechaActualizacionViaje,
  v.Estatus AS estatusViaje,
  v.IdCliente AS idCliente,
  v.IdTurno AS idTurno,
  v.IdOperador AS idOperador,
  v.IdVariante AS idVariante,

  c.Id AS idConteo,
  c.Entradas AS entradas,
  c.Salidas AS salidas,
  c.Diferencia AS diferencia,
  c.FechaHora AS fechaConteo,
  c.FHRegistro AS fechaRegistroConteo,
  c.NumeroSerieContador AS numeroSerieContador

FROM ViajesConteos vc
INNER JOIN Viajes v ON v.Id = vc.IdViaje
INNER JOIN ConteoPasajeros c ON c.Id = vc.IdConteo
ORDER BY v.Id DESC
        `,
      );
      const data = viajesconteos.map((item) => ({
        ...item,
        idViaje: Number(item.idViaje),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idOperador: Number(item.idOperador),
        idVariante: Number(item.idVariante),
        idConteo: Number(item.idConteo),
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
        message:
          'Ocurrió un error al intentar obtener un listado de viajesconteos.',
        error: error.message,
      });
    }
  }

  async findAll(page: number, limit: number) {
    try {
      const offset = (page - 1) * limit;
      let viajesconteos;
      let totalResult;
      viajesconteos = await this.viajesconteosRepository.query(
        `
SELECT 
  v.Id AS idViaje,
  v.Inicio AS inicioViaje,
  v.Fin AS finViaje,
  v.FechaCreacion AS fechaCreacionViaje,
  v.FechaActualizacion AS fechaActualizacionViaje,
  v.Estatus AS estatusViaje,
  v.IdCliente AS idCliente,
  v.IdTurno AS idTurno,
  v.IdOperador AS idOperador,
  v.IdVariante AS idVariante,

  c.Id AS idConteo,
  c.Entradas AS entradas,
  c.Salidas AS salidas,
  c.Diferencia AS diferencia,
  c.FechaHora AS fechaConteo,
  c.FHRegistro AS fechaRegistroConteo,
  c.NumeroSerieContador AS numeroSerieContador

FROM ViajesConteos vc
INNER JOIN Viajes v ON v.Id = vc.IdViaje
INNER JOIN ConteoPasajeros c ON c.Id = vc.IdConteo
ORDER BY v.Id DESC
LIMIT ? OFFSET ?;
        `,
        [limit, offset],
      );

      // Query para total (sin paginación)
      totalResult = await this.viajesconteosRepository.query(
        `
   SELECT COUNT(*) AS total
FROM ViajesConteos vc
INNER JOIN Viajes v ON v.Id = vc.IdViaje
INNER JOIN ConteoPasajeros c ON c.Id = vc.IdConteo
ORDER BY v.Id DESC
  `,
      );

      const total = Number(totalResult[0]?.total || 0);
      const data = viajesconteos.map((item) => ({
        ...item,
        idViaje: Number(item.idViaje),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idOperador: Number(item.idOperador),
        idVariante: Number(item.idVariante),
        idConteo: Number(item.idConteo),
      }));
      const result: ApiResponseCommon = {
        data: data,
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
        message: `Se produjo un error al obtener la paginación de viajesconteos.`,
        error: error.message,
      });
    }
  }

  async findOneConteos(id: number) {
    try {
      const viajesconteos = await this.viajesconteosRepository.query(
        `
SELECT 
  v.Id AS idViaje,
  v.Inicio AS inicioViaje,
  v.Fin AS finViaje,
  v.FechaCreacion AS fechaCreacionViaje,
  v.FechaActualizacion AS fechaActualizacionViaje,
  v.Estatus AS estatusViaje,
  v.IdCliente AS idCliente,
  v.IdTurno AS idTurno,
  v.IdOperador AS idOperador,
  v.IdVariante AS idVariante,

  c.Id AS idConteo,
  c.Entradas AS entradas,
  c.Salidas AS salidas,
  c.Diferencia AS diferencia,
  c.FechaHora AS fechaConteo,
  c.FHRegistro AS fechaRegistroConteo,
  c.NumeroSerieContador AS numeroSerieContador

FROM ViajesConteos vc
INNER JOIN Viajes v ON v.Id = vc.IdViaje
INNER JOIN ConteoPasajeros c ON c.Id = vc.IdConteo
WHERE c.Id = ?
ORDER BY v.Id DESC
        `,
        [id],
      );
      const data = viajesconteos.map((item) => ({
        ...item,
        idViaje: Number(item.idViaje),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idOperador: Number(item.idOperador),
        idVariante: Number(item.idVariante),
        idConteo: Number(item.idConteo),
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
        message:
          'Ocurrió un error al intentar obtener un listado de viajesconteos.',
        error: error.message,
      });
    }
  }

  async findOneViajes(id: number) {
    try {
      const viajesconteos = await this.viajesconteosRepository.query(
        `
SELECT 
  v.Id AS idViaje,
  v.Inicio AS inicioViaje,
  v.Fin AS finViaje,
  v.FechaCreacion AS fechaCreacionViaje,
  v.FechaActualizacion AS fechaActualizacionViaje,
  v.Estatus AS estatusViaje,
  v.IdCliente AS idCliente,
  v.IdTurno AS idTurno,
  v.IdOperador AS idOperador,
  v.IdVariante AS idVariante,

  c.Id AS idConteo,
  c.Entradas AS entradas,
  c.Salidas AS salidas,
  c.Diferencia AS diferencia,
  c.FechaHora AS fechaConteo,
  c.FHRegistro AS fechaRegistroConteo,
  c.NumeroSerieContador AS numeroSerieContador

FROM ViajesConteos vc
INNER JOIN Viajes v ON v.Id = vc.IdViaje
INNER JOIN ConteoPasajeros c ON c.Id = vc.IdConteo
WHERE v.Id = ?
ORDER BY v.Id DESC
        `,
        [id]
      );
      const data = viajesconteos.map((item) => ({
        ...item,
        idViaje: Number(item.idViaje),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idOperador: Number(item.idOperador),
        idVariante: Number(item.idVariante),
        idConteo: Number(item.idConteo),
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
        message:
          'Ocurrió un error al intentar obtener un listado de viajesconteos.',
        error: error.message,
      });
    }
  }
}
