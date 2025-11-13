import {
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateViajestransaccioneDto } from './dto/create-viajestransaccione.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ViajesTransacciones } from 'src/entities/ViajesTransacciones';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';

@Injectable()
export class ViajestransaccionesService {
  constructor(
    @InjectRepository(ViajesTransacciones)
    private readonly viajestransaccionesRepository: Repository<ViajesTransacciones>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(
    idUser: number,
    createViajestransaccioneDto: CreateViajestransaccioneDto,
  ) {
    try {
      const newViajeTransacciones =
        await this.viajestransaccionesRepository.create(
          createViajestransaccioneDto,
        );
      const viajestransaccionesSave =
        await this.viajestransaccionesRepository.save(newViajeTransacciones);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createViajestransaccioneDto };
      await this.bitacoraLogger.logToBitacora(
        'ViajesTransacciones',
        `Se creó el viajestransacciones con viaje ID: ${createViajestransaccioneDto.idViaje} y transaccion ID: ${createViajestransaccioneDto.idTransaccion}`,
        'CREATE',
        querylogger,
        idUser,
        26,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El viajestransaccion ha sido creado exitosamente.',
        data: {
          id: Number(viajestransaccionesSave.idTransaccion),
          nombre:
            `Viaje ID: ${viajestransaccionesSave.idTransaccion} Transaccion ID: ${viajestransaccionesSave.idViaje} ` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createViajestransaccioneDto };
      await this.bitacoraLogger.logToBitacora(
        'ViajesTransacciones',
        `Se creó el viajestransacciones con viaje ID: ${createViajestransaccioneDto.idViaje} y transaccion ID: ${createViajestransaccioneDto.idTransaccion}`,
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
        message: `Se produjo un error al crear el viajestransaccion.`,
        error: error.message,
      });
    }
  }

  async findAllList() {
    try {
      const viajesconteos = await this.viajestransaccionesRepository.query(
        `
SELECT 
  vt.IdViaje AS idViaje,
  v.Inicio AS inicioViaje,
  v.Fin AS finViaje,
  v.IdCliente AS idCliente,
  v.IdOperador AS idOperador,
  v.IdTurno AS idTurno,
  v.IdVariante AS idVariante,

  t.Id AS IdTransaccion,
  t.TipoTransaccion AS tipoTransaccion,
  t.Monto AS monto,
  t.Latitud AS latitud,
  t.Longitud AS longitud,
  t.FechaHora AS fecheHora,
  t.FHRegistro AS fhRegistro,
  t.NumeroSerieMonedero AS NumeroSerieMonedero,
  t.NumeroSerieValidador AS numeroSerieValidador 

FROM ViajesTransacciones vt
INNER JOIN Viajes v ON v.Id = vt.IdViaje
INNER JOIN Transacciones t ON t.Id = vt.IdTransaccion
ORDER BY v.Id DESC;
              `,
      );
      const data = viajesconteos.map((item) => ({
        ...item,
        idViaje: Number(item.idViaje),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idOperador: Number(item.idOperador),
        idVariante: Number(item.idVariante),
        idTransaccion: Number(item.idTransaccion),
        monto: Number(item.monto),
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
          'Ocurrió un error al intentar obtener un listado de viajestransacciones.',
        error: error.message,
      });
    }
  }

  async findAll(page: number, limit: number) {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      const viajesconteos = await this.viajestransaccionesRepository.query(
        `
SELECT 
  vt.IdViaje AS idViaje,
  v.Inicio AS inicioViaje,
  v.Fin AS finViaje,
  v.IdCliente AS idCliente,
  v.IdOperador AS idOperador,
  v.IdTurno AS idTurno,
  v.IdVariante AS idVariante,

  t.Id AS IdTransaccion,
  t.TipoTransaccion AS tipoTransaccion,
  t.Monto AS monto,
  t.Latitud AS latitud,
  t.Longitud AS longitud,
  t.FechaHora AS fecheHora,
  t.FHRegistro AS fhRegistro,
  t.NumeroSerieMonedero AS NumeroSerieMonedero,
  t.NumeroSerieValidador AS numeroSerieValidador 

FROM ViajesTransacciones vt
INNER JOIN Viajes v ON v.Id = vt.IdViaje
INNER JOIN Transacciones t ON t.Id = vt.IdTransaccion
ORDER BY v.Id DESC
LIMIT ? OFFSET ?;
              `,
        [limit, offset],
      );
      // Query para total (sin paginación)
      totalResult = await this.viajestransaccionesRepository.query(
        `
   SELECT COUNT(*) AS total
FROM ViajesTransacciones vt
INNER JOIN Viajes v ON v.Id = vt.IdViaje
INNER JOIN Transacciones t ON t.Id = vt.IdTransaccion
ORDER BY v.Id DESC;
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
        idTransaccion: Number(item.idTransaccion),
        monto: Number(item.monto),
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
        message:
          'Ocurrió un error al intentar obtener un listado de viajestransacciones.',
        error: error.message,
      });
    }
  }

  async findOneViajes(id: number) {
    try {
      const viajesconteos = await this.viajestransaccionesRepository.query(
        `
SELECT 
  vt.IdViaje AS idViaje,
  v.Inicio AS inicioViaje,
  v.Fin AS finViaje,
  v.IdCliente AS idCliente,
  v.IdOperador AS idOperador,
  v.IdTurno AS idTurno,
  v.IdVariante AS idVariante,

  t.Id AS IdTransaccion,
  t.TipoTransaccion AS tipoTransaccion,
  t.Monto AS monto,
  t.Latitud AS latitud,
  t.Longitud AS longitud,
  t.FechaHora AS fecheHora,
  t.FHRegistro AS fhRegistro,
  t.NumeroSerieMonedero AS NumeroSerieMonedero,
  t.NumeroSerieValidador AS numeroSerieValidador 

FROM ViajesTransacciones vt
INNER JOIN Viajes v ON v.Id = vt.IdViaje
INNER JOIN Transacciones t ON t.Id = vt.IdTransaccion
WHERE v.ID = ?
ORDER BY v.Id DESC;
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
        idTransaccion: Number(item.idTransaccion),
        monto: Number(item.monto),
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
          'Ocurrió un error al intentar obtener un listado de viajestransacciones.',
        error: error.message,
      });
    }
  }

  async findOneTransacciones(id: number) {
    try {
      const viajesconteos = await this.viajestransaccionesRepository.query(
        `
SELECT 
  vt.IdViaje AS idViaje,
  v.Inicio AS inicioViaje,
  v.Fin AS finViaje,
  v.IdCliente AS idCliente,
  v.IdOperador AS idOperador,
  v.IdTurno AS idTurno,
  v.IdVariante AS idVariante,

  t.Id AS IdTransaccion,
  t.TipoTransaccion AS tipoTransaccion,
  t.Monto AS monto,
  t.Latitud AS latitud,
  t.Longitud AS longitud,
  t.FechaHora AS fecheHora,
  t.FHRegistro AS fhRegistro,
  t.NumeroSerieMonedero AS NumeroSerieMonedero,
  t.NumeroSerieValidador AS numeroSerieValidador 

FROM ViajesTransacciones vt
INNER JOIN Viajes v ON v.Id = vt.IdViaje
INNER JOIN Transacciones t ON t.Id = vt.IdTransaccion
WHERE t.Id = ?
ORDER BY v.Id DESC;
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
        idTransaccion: Number(item.idTransaccion),
        monto: Number(item.monto),
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
          'Ocurrió un error al intentar obtener un listado de viajestransacciones.',
        error: error.message,
      });
    }
  }
}
